import { eventType, Inngest } from "inngest";
import { z } from "zod";
import { googleFormsResponseSubmittedEventSchema } from "@/features/triggers/google-forms/schema";

export const WORKFLOW_EXECUTION_REQUESTED_EVENT =
  "workflow/execution.requested" as const;
export const GOOGLE_FORMS_RESPONSE_SUBMITTED_EVENT =
  "google.forms.response.submitted" as const;

export const workflowExecutionRequestedEvent = eventType(
  WORKFLOW_EXECUTION_REQUESTED_EVENT,
  {
    schema: z.object({
      workflowId: z.string(),
      executionId: z.string(),
      userId: z.string(),
      triggerNodeId: z.string(),
    }),
  },
);

export const googleFormsResponseSubmittedEvent = eventType(
  GOOGLE_FORMS_RESPONSE_SUBMITTED_EVENT,
  { schema: googleFormsResponseSubmittedEventSchema },
);

export const inngest = new Inngest({
  id: "nexflow",
  isDev: process.env.NODE_ENV === "development",
});
