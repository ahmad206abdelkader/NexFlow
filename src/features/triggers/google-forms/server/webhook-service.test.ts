import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NodeType } from "@/generated/prisma";
import { hashGoogleFormsWebhookSecret } from "./secret";
import {
  GOOGLE_FORMS_WEBHOOK_ERROR_CODES,
  type GoogleFormsWebhookConfigurationRecord,
  type GoogleFormsWebhookDeliveryRecord,
  type GoogleFormsWebhookRepository,
  processGoogleFormsWebhook,
  readLimitedRequestBody,
} from "./webhook-service";

const payload = {
  eventId: "response-1",
  submittedAt: "2026-07-23T12:00:00.000Z",
  form: { id: "form-1", title: "Customer Feedback" },
  response: {
    id: "response-1",
    answers: { Name: "Ahmad", Topics: ["Product", "Support"], Empty: "" },
    answerList: [{ question: "Name", value: "Ahmad" }],
  },
};

const createHarness = async (
  overrides: Partial<GoogleFormsWebhookConfigurationRecord> = {},
) => {
  const secret = "correct-secret";
  const configuration: GoogleFormsWebhookConfigurationRecord = {
    id: "config-1",
    publicId: "public-1",
    secretHash: await hashGoogleFormsWebhookSecret(secret),
    enabled: true,
    userId: "user-1",
    workflowId: "workflow-1",
    triggerNodeId: "trigger-1",
    workflow: {
      id: "workflow-1",
      userId: "user-1",
      isActive: true,
      nodes: [
        {
          id: "trigger-1",
          type: NodeType.googleFormsTrigger,
          data: { variableName: "googleForm", expectedFormId: "form-1" },
        },
      ],
    },
    ...overrides,
  };
  let delivery: GoogleFormsWebhookDeliveryRecord | null = null;
  let queueCalls = 0;
  let sendShouldFail = false;
  const calls = {
    touch: 0,
    attempts: 0,
    sendFailures: 0,
    queued: 0,
  };
  const repository: GoogleFormsWebhookRepository = {
    findConfiguration: async (publicId) =>
      publicId === configuration.publicId ? configuration : null,
    findOrCreateDelivery: async ({ payloadHash }) => {
      delivery ??= {
        id: "delivery-1",
        payloadHash,
        inngestEventId: "inngest-event-1",
        queuedAt: null,
      };
      return delivery;
    },
    touchConfiguration: async () => {
      calls.touch += 1;
    },
    markAttempt: async () => {
      calls.attempts += 1;
    },
    markSendFailed: async () => {
      calls.sendFailures += 1;
    },
    markQueued: async () => {
      calls.queued += 1;
      if (delivery) {
        delivery.queuedAt = new Date();
      }
    },
  };
  const queuedData: unknown[] = [];
  const queueEvent = async (input: unknown) => {
    queueCalls += 1;
    queuedData.push(input);
    if (sendShouldFail) {
      throw new Error("Inngest unavailable");
    }
  };

  return {
    secret,
    repository,
    queueEvent,
    queuedData,
    calls,
    get queueCalls() {
      return queueCalls;
    },
    failSend(value: boolean) {
      sendShouldFail = value;
    },
  };
};

const send = (
  harness: Awaited<ReturnType<typeof createHarness>>,
  raw: unknown = payload,
) =>
  processGoogleFormsWebhook({
    webhookId: "public-1",
    secret: harness.secret,
    rawBody: JSON.stringify(raw),
    repository: harness.repository,
    queueEvent: harness.queueEvent,
  });

describe("Google Forms webhook processing", () => {
  it("accepts a valid payload and queues exactly one secret-free event", async () => {
    const harness = await createHarness();

    assert.deepEqual(await send(harness), { accepted: true });
    assert.equal(harness.queueCalls, 1);
    assert.equal(harness.calls.queued, 1);
    assert.equal(
      JSON.stringify(harness.queuedData).includes(harness.secret),
      false,
    );
  });

  it("deduplicates repeated submissions without sending another event", async () => {
    const harness = await createHarness();

    await send(harness);
    assert.deepEqual(await send(harness), {
      accepted: false,
      duplicate: true,
    });
    assert.equal(harness.queueCalls, 1);
    assert.equal(harness.calls.touch, 1);
  });

  it("rejects an invalid secret before queueing", async () => {
    const harness = await createHarness();

    await assert.rejects(
      processGoogleFormsWebhook({
        webhookId: "public-1",
        secret: "wrong-secret",
        rawBody: JSON.stringify(payload),
        repository: harness.repository,
        queueEvent: harness.queueEvent,
      }),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === GOOGLE_FORMS_WEBHOOK_ERROR_CODES.unauthorized,
    );
    assert.equal(harness.queueCalls, 0);
  });

  it("rejects invalid payloads and disabled or deleted triggers", async () => {
    const invalidPayloadHarness = await createHarness();
    await assert.rejects(
      send(invalidPayloadHarness, { eventId: "missing-fields" }),
    );

    const disabledHarness = await createHarness({ enabled: false });
    await assert.rejects(
      send(disabledHarness),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === GOOGLE_FORMS_WEBHOOK_ERROR_CODES.disabled,
    );

    const deletedHarness = await createHarness({
      workflow: {
        id: "workflow-1",
        userId: "user-1",
        isActive: true,
        nodes: [],
      },
    });
    await assert.rejects(
      send(deletedHarness),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === GOOGLE_FORMS_WEBHOOK_ERROR_CODES.triggerNotFound,
    );
  });

  it("allows a failed Inngest send to be retried with the same delivery", async () => {
    const harness = await createHarness();
    harness.failSend(true);

    await assert.rejects(
      send(harness),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === GOOGLE_FORMS_WEBHOOK_ERROR_CODES.eventSendFailed,
    );
    assert.equal(harness.calls.sendFailures, 1);

    harness.failSend(false);
    assert.equal((await send(harness)).accepted, true);
    assert.equal(harness.queueCalls, 2);
  });

  it("rejects oversized bodies while reading the request stream", async () => {
    const request = new Request("https://nexflow.example/webhook", {
      method: "POST",
      body: "123456",
    });

    await assert.rejects(readLimitedRequestBody(request, 5));
  });
});
