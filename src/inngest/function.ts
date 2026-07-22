import {
  executeWorkflowGraph,
  getWorkflowExecutionErrorMessage,
} from "@/features/workflow/server/execute-workflow";
import { Prisma } from "@/generated/prisma";
import prisma from "@/lib/db";
import { inngest, WORKFLOW_EXECUTION_REQUESTED_EVENT } from "./client";

export const executeWorkflow = inngest.createFunction(
  {
    id: "execute-workflow",
    idempotency: "event.data.executionId",
    retries: 3,
    onFailure: async ({ event, error }) => {
      const { executionId, workflowId, userId } = event.data.event.data;
      const errorMessage = getWorkflowExecutionErrorMessage(error);

      await prisma.$transaction([
        prisma.workflowExecution.updateMany({
          where: {
            id: executionId,
            workflowId,
            userId,
            inngestRunId: event.data.run_id,
            status: "RUNNING",
          },
          data: {
            status: "FAILED",
            error: errorMessage,
            completedAt: new Date(),
          },
        }),
        prisma.nodeExecution.updateMany({
          where: { executionId, status: "RUNNING" },
          data: {
            status: "FAILED",
            error: errorMessage,
            completedAt: new Date(),
          },
        }),
      ]);
    },
  },
  { event: WORKFLOW_EXECUTION_REQUESTED_EVENT },
  async ({ event, runId, step }) => {
    const { executionId, workflowId, userId, triggerNodeId } = event.data;

    const claim = await step.run("claim-execution", async () => {
      const claimed = await prisma.workflowExecution.updateMany({
        where: {
          id: executionId,
          workflowId,
          userId,
          triggerNodeId,
          inngestRunId: null,
          status: "PENDING",
        },
        data: {
          status: "RUNNING",
          inngestRunId: runId,
          startedAt: new Date(),
          error: null,
        },
      });

      if (claimed.count === 1) {
        return { claimed: true, status: "RUNNING" as const };
      }

      const existing = await prisma.workflowExecution.findUnique({
        where: { id: executionId },
        select: { inngestRunId: true, status: true },
      });

      return {
        claimed:
          existing?.status === "RUNNING" && existing.inngestRunId === runId,
        status: existing?.status ?? null,
      };
    });

    if (!claim.claimed) {
      return { executionId, status: claim.status, skipped: true };
    }

    const workflow = await step.run("load-workflow", () =>
      prisma.workflow.findFirstOrThrow({
        where: { id: workflowId, userId },
        include: { nodes: true, connections: true },
      }),
    );

    const result = await executeWorkflowGraph(workflow, {
      executionId,
      executeNode: (node, execute) =>
        step.run(`execute-node-${node.id}`, async () => {
          await prisma.nodeExecution.upsert({
            where: {
              executionId_nodeId: { executionId, nodeId: node.id },
            },
            create: {
              executionId,
              nodeId: node.id,
              status: "RUNNING",
            },
            update: {
              status: "RUNNING",
              result: Prisma.DbNull,
              error: null,
              startedAt: new Date(),
              completedAt: null,
            },
          });

          try {
            const nodeResult = await execute();

            await prisma.nodeExecution.update({
              where: {
                executionId_nodeId: { executionId, nodeId: node.id },
              },
              data: {
                status: "SUCCESS",
                result: nodeResult,
                error: null,
                completedAt: new Date(),
              },
            });

            return nodeResult;
          } catch (error) {
            await prisma.nodeExecution.update({
              where: {
                executionId_nodeId: { executionId, nodeId: node.id },
              },
              data: {
                status: "FAILED",
                error: getWorkflowExecutionErrorMessage(error),
                completedAt: new Date(),
              },
            });

            throw error;
          }
        }),
    });

    await step.run("complete-execution", async () => {
      const completed = await prisma.workflowExecution.updateMany({
        where: {
          id: executionId,
          inngestRunId: runId,
          status: "RUNNING",
        },
        data: {
          status: "SUCCESS",
          error: null,
          completedAt: new Date(),
        },
      });

      if (completed.count !== 1) {
        throw new Error("The workflow execution could not be completed.");
      }
    });

    return { ...result, executionId, status: "SUCCESS" as const };
  },
);
