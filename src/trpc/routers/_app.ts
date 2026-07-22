import { googleFormsWebhooksRouter } from "@/features/triggers/google-forms/server/router";
import { workflowsRouter } from "@/features/workflow/server/routers";
import { createTRPCRouter } from "../init";

export const appRouter = createTRPCRouter({
  workflows: workflowsRouter,
  googleFormsWebhooks: googleFormsWebhooksRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
