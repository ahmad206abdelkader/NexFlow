import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { googleFormsWebhookPayloadSchema } from "./schema";

const payload = {
  eventId: "response-1",
  submittedAt: "2026-07-23T12:00:00.000Z",
  form: { id: "form-1", title: "Customer Feedback" },
  response: {
    id: "response-1",
    answers: {
      Name: "Ahmad",
      Topics: ["Product", "Support"],
      Empty: "",
      Date: "2026-07-23T00:00:00.000Z",
    },
    answerList: [
      { question: "Name", value: "Ahmad" },
      { question: "Topics", value: ["Product", "Support"] },
      { question: "Empty", value: "" },
    ],
  },
};

describe("Google Forms webhook payload", () => {
  it("accepts strings, arrays, ISO date strings, and empty answers", () => {
    assert.deepEqual(googleFormsWebhookPayloadSchema.parse(payload), payload);
  });

  it("rejects malformed and unexpected payload fields", () => {
    assert.equal(
      googleFormsWebhookPayloadSchema.safeParse({
        ...payload,
        workflowId: "forged",
      }).success,
      false,
    );
    assert.equal(
      googleFormsWebhookPayloadSchema.safeParse({ ...payload, eventId: "" })
        .success,
      false,
    );
  });
});
