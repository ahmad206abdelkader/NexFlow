import { z } from "zod";

export const GOOGLE_FORMS_WEBHOOK_MAX_BYTES = 256 * 1024;
export const GOOGLE_FORMS_MAX_ANSWERS = 500;

export type GoogleFormsAnswerValue =
  | string
  | number
  | boolean
  | null
  | GoogleFormsAnswerValue[];

const answerValueSchema: z.ZodType<
  GoogleFormsAnswerValue,
  GoogleFormsAnswerValue
> = z.lazy(() =>
  z.union([
    z.string().max(100_000),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(answerValueSchema).max(1_000),
  ]),
);

const answersSchema = z
  .record(z.string().min(1).max(500), answerValueSchema)
  .refine(
    (answers) => Object.keys(answers).length <= GOOGLE_FORMS_MAX_ANSWERS,
    `A form response cannot contain more than ${GOOGLE_FORMS_MAX_ANSWERS} answers.`,
  );

export const googleFormsWebhookPayloadSchema = z
  .object({
    eventId: z
      .string()
      .min(1)
      .max(256)
      .refine((value) => value.trim().length > 0),
    submittedAt: z.string().datetime({ offset: true }),
    form: z
      .object({
        id: z.string().min(1).max(512).optional(),
        title: z.string().max(1_000).optional(),
      })
      .strict(),
    response: z
      .object({
        id: z.string().min(1).max(512).optional(),
        answers: answersSchema,
        answerList: z
          .array(
            z
              .object({
                question: z.string().min(1).max(500),
                value: answerValueSchema,
              })
              .strict(),
          )
          .max(GOOGLE_FORMS_MAX_ANSWERS),
      })
      .strict(),
  })
  .strict();

export type GoogleFormsWebhookPayload = z.infer<
  typeof googleFormsWebhookPayloadSchema
>;

export const googleFormsTriggerNodeDataSchema = z
  .object({
    variableName: z
      .string()
      .trim()
      .regex(
        /^[A-Za-z_][A-Za-z0-9_]*$/,
        "Variable name must start with a letter or underscore and contain only letters, numbers, and underscores.",
      ),
    formName: z.string().trim().max(1_000).optional(),
    expectedFormId: z.string().trim().max(512).optional(),
  })
  .passthrough();

export type GoogleFormsTriggerNodeData = z.infer<
  typeof googleFormsTriggerNodeDataSchema
>;

export const googleFormsResponseSubmittedEventSchema =
  googleFormsWebhookPayloadSchema.extend({
    webhookId: z.string().min(1).max(128),
    deliveryId: z.string().min(1).max(128),
    workflowId: z.string().min(1).max(128),
    triggerNodeId: z.string().min(1).max(128),
  });
