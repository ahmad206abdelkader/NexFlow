import { createId } from "@paralleldrive/cuid2";
import { NodeType, Prisma } from "@/generated/prisma";
import { googleFormsResponseSubmittedEvent, inngest } from "@/inngest/client";
import prisma from "@/lib/db";
import {
  GOOGLE_FORMS_WEBHOOK_MAX_BYTES,
  type GoogleFormsWebhookPayload,
  googleFormsTriggerNodeDataSchema,
  googleFormsWebhookPayloadSchema,
} from "../schema";
import {
  hashGoogleFormsWebhookValue,
  stableJsonStringify,
  verifyGoogleFormsWebhookSecret,
} from "./secret";

export const GOOGLE_FORMS_WEBHOOK_ERROR_CODES = {
  notFound: "GOOGLE_FORMS_WEBHOOK_NOT_FOUND",
  unauthorized: "GOOGLE_FORMS_WEBHOOK_UNAUTHORIZED",
  disabled: "GOOGLE_FORMS_WEBHOOK_DISABLED",
  payloadInvalid: "GOOGLE_FORMS_PAYLOAD_INVALID",
  duplicate: "GOOGLE_FORMS_DUPLICATE_SUBMISSION",
  triggerNotFound: "GOOGLE_FORMS_TRIGGER_NOT_FOUND",
  triggerInactive: "GOOGLE_FORMS_TRIGGER_INACTIVE",
  eventSendFailed: "GOOGLE_FORMS_EVENT_SEND_FAILED",
} as const;

const DUMMY_SECRET_HASH =
  "scrypt:AQEBAQEBAQEBAQEBAQEBAQ:JygtHTX88rBjNLx57Z7MYnJ5Q2_G0oAysd6Bj2Ahhfo";

type WebhookErrorCode =
  (typeof GOOGLE_FORMS_WEBHOOK_ERROR_CODES)[keyof typeof GOOGLE_FORMS_WEBHOOK_ERROR_CODES];

export class GoogleFormsWebhookError extends Error {
  constructor(
    readonly code: WebhookErrorCode,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GoogleFormsWebhookError";
  }
}

export const readLimitedRequestBody = async (
  request: Request,
  maxBytes = GOOGLE_FORMS_WEBHOOK_MAX_BYTES,
) => {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new GoogleFormsWebhookError(
      GOOGLE_FORMS_WEBHOOK_ERROR_CODES.payloadInvalid,
      413,
      "The webhook payload is too large.",
    );
  }

  if (!request.body) {
    return "";
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let body = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    bytesRead += value.byteLength;
    if (bytesRead > maxBytes) {
      await reader.cancel();
      throw new GoogleFormsWebhookError(
        GOOGLE_FORMS_WEBHOOK_ERROR_CODES.payloadInvalid,
        413,
        "The webhook payload is too large.",
      );
    }

    body += decoder.decode(value, { stream: true });
  }

  return body + decoder.decode();
};

const parsePayload = (rawBody: string) => {
  let value: unknown;

  try {
    value = JSON.parse(rawBody);
  } catch {
    throw new GoogleFormsWebhookError(
      GOOGLE_FORMS_WEBHOOK_ERROR_CODES.payloadInvalid,
      400,
      "The webhook payload is invalid.",
    );
  }

  const parsed = googleFormsWebhookPayloadSchema.safeParse(value);
  if (!parsed.success) {
    throw new GoogleFormsWebhookError(
      GOOGLE_FORMS_WEBHOOK_ERROR_CODES.payloadInvalid,
      400,
      "The webhook payload is invalid.",
    );
  }

  return parsed.data;
};

export type GoogleFormsWebhookConfigurationRecord = {
  id: string;
  publicId: string;
  secretHash: string;
  enabled: boolean;
  userId: string;
  workflowId: string;
  triggerNodeId: string;
  workflow: {
    id: string;
    userId: string;
    isActive: boolean;
    nodes: Array<{
      id: string;
      type: NodeType;
      data: Prisma.JsonValue;
    }>;
  };
};

export type GoogleFormsWebhookDeliveryRecord = {
  id: string;
  payloadHash: string;
  inngestEventId: string;
  queuedAt: Date | null;
};

export type GoogleFormsWebhookRepository = {
  findConfiguration: (
    publicId: string,
  ) => Promise<GoogleFormsWebhookConfigurationRecord | null>;
  findOrCreateDelivery: (input: {
    webhookConfigId: string;
    idempotencyKeyHash: string;
    payloadHash: string;
  }) => Promise<GoogleFormsWebhookDeliveryRecord>;
  touchConfiguration: (configurationId: string) => Promise<void>;
  markAttempt: (deliveryId: string) => Promise<void>;
  markSendFailed: (deliveryId: string) => Promise<void>;
  markQueued: (deliveryId: string, configurationId: string) => Promise<void>;
};

const findWebhookConfiguration = (publicId: string) =>
  prisma.googleFormsWebhook.findUnique({
    where: { publicId },
    include: {
      workflow: {
        select: {
          id: true,
          userId: true,
          isActive: true,
          nodes: {
            select: { id: true, type: true, data: true },
          },
        },
      },
    },
  });

const findOrCreateDelivery = async ({
  webhookConfigId,
  idempotencyKeyHash,
  payloadHash,
}: {
  webhookConfigId: string;
  idempotencyKeyHash: string;
  payloadHash: string;
}) => {
  try {
    return await prisma.googleFormsWebhookEvent.create({
      data: {
        webhookConfigId,
        idempotencyKeyHash,
        payloadHash,
        inngestEventId: createId(),
      },
    });
  } catch (error) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== "P2002"
    ) {
      throw error;
    }

    const delivery = await prisma.googleFormsWebhookEvent.findUniqueOrThrow({
      where: {
        webhookConfigId_idempotencyKeyHash: {
          webhookConfigId,
          idempotencyKeyHash,
        },
      },
    });

    return delivery;
  }
};

export const googleFormsWebhookRepository: GoogleFormsWebhookRepository = {
  findConfiguration: findWebhookConfiguration,
  findOrCreateDelivery,
  touchConfiguration: async (configurationId) => {
    await prisma.googleFormsWebhook.update({
      where: { id: configurationId },
      data: { lastReceivedAt: new Date() },
    });
  },
  markAttempt: async (deliveryId) => {
    await prisma.googleFormsWebhookEvent.update({
      where: { id: deliveryId },
      data: { lastAttemptAt: new Date(), errorCode: null },
    });
  },
  markSendFailed: async (deliveryId) => {
    await prisma.googleFormsWebhookEvent.update({
      where: { id: deliveryId },
      data: { errorCode: GOOGLE_FORMS_WEBHOOK_ERROR_CODES.eventSendFailed },
    });
  },
  markQueued: async (deliveryId, configurationId) => {
    await prisma.$transaction([
      prisma.googleFormsWebhookEvent.update({
        where: { id: deliveryId },
        data: { queuedAt: new Date(), errorCode: null },
      }),
      prisma.googleFormsWebhook.update({
        where: { id: configurationId },
        data: { lastReceivedAt: new Date() },
      }),
    ]);
  },
};

export type QueueGoogleFormsEvent = (input: {
  eventId: string;
  data: GoogleFormsWebhookPayload & {
    webhookId: string;
    deliveryId: string;
    workflowId: string;
    triggerNodeId: string;
  };
}) => Promise<void>;

const queueGoogleFormsEvent: QueueGoogleFormsEvent = async ({
  eventId,
  data,
}) => {
  await inngest.send(
    googleFormsResponseSubmittedEvent.create(data, { id: eventId }),
  );
};

export const processGoogleFormsWebhook = async ({
  webhookId,
  secret,
  rawBody,
  queueEvent = queueGoogleFormsEvent,
  repository = googleFormsWebhookRepository,
}: {
  webhookId: string;
  secret: string | null;
  rawBody: string;
  queueEvent?: QueueGoogleFormsEvent;
  repository?: GoogleFormsWebhookRepository;
}) => {
  const configuration = await repository.findConfiguration(webhookId);

  if (!configuration) {
    await verifyGoogleFormsWebhookSecret(secret ?? "", DUMMY_SECRET_HASH);
    throw new GoogleFormsWebhookError(
      GOOGLE_FORMS_WEBHOOK_ERROR_CODES.notFound,
      404,
      "The webhook was not found.",
    );
  }

  const authenticated =
    typeof secret === "string" &&
    secret.length <= 256 &&
    (await verifyGoogleFormsWebhookSecret(secret, configuration.secretHash));

  if (!authenticated) {
    throw new GoogleFormsWebhookError(
      GOOGLE_FORMS_WEBHOOK_ERROR_CODES.unauthorized,
      401,
      "The webhook credentials are invalid.",
    );
  }

  if (!configuration.enabled) {
    throw new GoogleFormsWebhookError(
      GOOGLE_FORMS_WEBHOOK_ERROR_CODES.disabled,
      410,
      "The webhook is disabled.",
    );
  }

  if (
    !configuration.workflow.isActive ||
    configuration.workflow.userId !== configuration.userId
  ) {
    throw new GoogleFormsWebhookError(
      GOOGLE_FORMS_WEBHOOK_ERROR_CODES.triggerInactive,
      409,
      "The Google Forms trigger is inactive.",
    );
  }

  const triggerNode = configuration.workflow.nodes.find(
    (node) => node.id === configuration.triggerNodeId,
  );

  if (!triggerNode) {
    throw new GoogleFormsWebhookError(
      GOOGLE_FORMS_WEBHOOK_ERROR_CODES.triggerNotFound,
      410,
      "The Google Forms trigger was not found.",
    );
  }

  if (triggerNode.type !== NodeType.googleFormsTrigger) {
    throw new GoogleFormsWebhookError(
      GOOGLE_FORMS_WEBHOOK_ERROR_CODES.triggerInactive,
      409,
      "The Google Forms trigger is inactive.",
    );
  }

  const payload = parsePayload(rawBody);
  const nodeData = googleFormsTriggerNodeDataSchema.safeParse(triggerNode.data);
  const expectedFormId = nodeData.success
    ? nodeData.data.expectedFormId?.trim()
    : undefined;

  if (expectedFormId && payload.form.id !== expectedFormId) {
    throw new GoogleFormsWebhookError(
      GOOGLE_FORMS_WEBHOOK_ERROR_CODES.payloadInvalid,
      400,
      "The webhook payload is invalid.",
    );
  }

  const idempotencyKeyHash = hashGoogleFormsWebhookValue(payload.eventId);
  const payloadHash = hashGoogleFormsWebhookValue(stableJsonStringify(payload));
  const delivery = await repository.findOrCreateDelivery({
    webhookConfigId: configuration.id,
    idempotencyKeyHash,
    payloadHash,
  });

  if (delivery.payloadHash !== payloadHash) {
    throw new GoogleFormsWebhookError(
      GOOGLE_FORMS_WEBHOOK_ERROR_CODES.payloadInvalid,
      409,
      "The event ID has already been used with a different payload.",
    );
  }

  if (delivery.queuedAt) {
    await repository.touchConfiguration(configuration.id);

    return { accepted: false as const, duplicate: true as const };
  }

  await repository.markAttempt(delivery.id);

  try {
    await queueEvent({
      eventId: delivery.inngestEventId,
      data: {
        ...payload,
        webhookId: configuration.publicId,
        deliveryId: delivery.id,
        workflowId: configuration.workflowId,
        triggerNodeId: configuration.triggerNodeId,
      },
    });
  } catch {
    await repository.markSendFailed(delivery.id);

    throw new GoogleFormsWebhookError(
      GOOGLE_FORMS_WEBHOOK_ERROR_CODES.eventSendFailed,
      503,
      "The webhook event could not be queued.",
    );
  }

  await repository.markQueued(delivery.id, configuration.id);

  return { accepted: true as const };
};
