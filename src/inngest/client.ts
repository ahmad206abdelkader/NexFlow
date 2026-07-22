import { EventSchemas, Inngest } from "inngest";

export const WORKFLOW_EXECUTION_REQUESTED_EVENT =
  "workflow/execution.requested" as const;

type InngestEvents = {
  [WORKFLOW_EXECUTION_REQUESTED_EVENT]: {
    data: {
      workflowId: string;
      executionId: string;
      userId: string;
      triggerNodeId: string;
    };
  };
};

export const inngest = new Inngest({
  id: "nexflow",
  schemas: new EventSchemas().fromRecord<InngestEvents>(),
});
