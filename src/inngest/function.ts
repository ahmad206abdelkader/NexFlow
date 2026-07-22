import {
  type GoogleFormsWebhookPayload,
  googleFormsWebhookPayloadSchema,
} from "@/features/triggers/google-forms/schema";
import {
  createWorkflowExecutionPlan,
  executeWorkflowGraph,
  getWorkflowExecutionErrorMessage,
  type WorkflowNodeResult,
} from "@/features/workflow/server/execute-workflow";
import { TemplateResolutionError } from "@/features/workflow/server/resolve-workflow-variables";
import { NodeType, Prisma } from "@/generated/prisma";
import prisma from "@/lib/db";
import {
  GOOGLE_FORMS_RESPONSE_SUBMITTED_EVENT,
  googleFormsResponseSubmittedEvent,
  inngest,
  workflowExecutionRequestedEvent,
} from "./client";
import {
  type NodeStatusEvent,
  sanitizeRealtimeOutput,
  workflowExecutionChannel,
} from "./realtime";
import { workflowStepIds } from "./workflow-step-ids";

const workflowFailureCode = (message: string) => {
  if (message.toLowerCase().includes("cycle")) {
    return "WORKFLOW_CYCLE_DETECTED";
  }

  return "WORKFLOW_EXECUTION_FAILED";
};

const nodeFailureCode = (error: unknown, message: string) => {
  if (error instanceof TemplateResolutionError) {
    return error.code;
  }

  if (message.startsWith("HTTP Request node")) {
    return "HTTP_REQUEST_FAILED";
  }

  if (message.startsWith("Google Forms trigger")) {
    return "GOOGLE_FORMS_TRIGGER_EXECUTION_FAILED";
  }

  return "NODE_EXECUTION_FAILED";
};

const toIsoString = (value: Date | string) =>
  typeof value === "string" ? value : value.toISOString();

export const createFailedNodeStatusEvent = ({
  executionId,
  workflowId,
  node,
  error,
  message,
  timestamp,
}: {
  executionId: string;
  workflowId: string;
  node: { id: string; name?: string; type: NodeType };
  error: unknown;
  message: string;
  timestamp: string;
}): NodeStatusEvent => ({
  executionId,
  workflowId,
  nodeId: node.id,
  nodeType: node.type,
  nodeName: node.name,
  status: "FAILED",
  error: {
    code: nodeFailureCode(error, message),
    message,
  },
  timestamp,
  sequence: 3,
});

export const executeWorkflow = inngest.createFunction(
  {
    id: "execute-workflow",
    triggers: [
      workflowExecutionRequestedEvent,
      googleFormsResponseSubmittedEvent,
    ],
    idempotency: "event.id",
    concurrency: {
      limit: 1,
      key: "event.data.workflowId",
    },
    retries: 3,
    onFailure: async ({ event, error }) => {
      const originalEvent = event.data.event;
      let executionIdentity:
        | { executionId: string; workflowId: string; userId: string }
        | undefined;

      if (originalEvent.name === GOOGLE_FORMS_RESPONSE_SUBMITTED_EVENT) {
        const originalData = originalEvent.data as { deliveryId: string };
        const delivery = await prisma.googleFormsWebhookEvent.findUnique({
          where: { id: originalData.deliveryId },
          select: {
            execution: {
              select: { id: true, workflowId: true, userId: true },
            },
          },
        });

        await prisma.googleFormsWebhookEvent.updateMany({
          where: { id: originalData.deliveryId },
          data: {
            failedAt: new Date(),
            errorCode: "GOOGLE_FORMS_TRIGGER_EXECUTION_FAILED",
          },
        });

        if (delivery?.execution) {
          executionIdentity = {
            executionId: delivery.execution.id,
            workflowId: delivery.execution.workflowId,
            userId: delivery.execution.userId,
          };
        }
      } else {
        executionIdentity = originalEvent.data as {
          executionId: string;
          workflowId: string;
          userId: string;
        };
      }

      if (!executionIdentity) {
        return;
      }

      const { executionId, workflowId, userId } = executionIdentity;
      const errorMessage = getWorkflowExecutionErrorMessage(error);
      const completedAt = new Date();
      const runningNodes = await prisma.nodeExecution.findMany({
        where: { executionId, status: "RUNNING" },
        select: { nodeId: true },
      });
      const workflowNodes = await prisma.node.findMany({
        where: {
          workflowId,
          id: { in: runningNodes.map(({ nodeId }) => nodeId) },
        },
        select: { id: true, name: true, type: true },
      });

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
            completedAt,
          },
        }),
        prisma.nodeExecution.updateMany({
          where: { executionId, status: "RUNNING" },
          data: {
            status: "FAILED",
            error: errorMessage,
            completedAt,
          },
        }),
      ]);

      const timestamp = completedAt.toISOString();
      const channel = workflowExecutionChannel({ executionId });

      try {
        for (const node of workflowNodes) {
          await inngest.realtime.publish(
            channel["node.status"],
            createFailedNodeStatusEvent({
              executionId,
              workflowId,
              node,
              error,
              message: errorMessage,
              timestamp,
            }),
          );
        }

        await inngest.realtime.publish(channel["execution.error"], {
          executionId,
          workflowId,
          code: workflowFailureCode(errorMessage),
          message: errorMessage,
          timestamp,
          sequence: 3,
        });
        await inngest.realtime.publish(channel["execution.status"], {
          executionId,
          workflowId,
          status: "FAILED",
          timestamp,
          sequence: 3,
        });
      } catch {
        console.error("Failed to publish workflow failure state.", {
          executionId,
          workflowId,
        });
      }
    },
  },
  async ({ attempt, event, maxAttempts, runId, step }) => {
    let triggerInput: GoogleFormsWebhookPayload | undefined;
    let executionIdentity: {
      executionId: string;
      workflowId: string;
      userId: string;
      triggerNodeId: string;
    };

    if (event.name === GOOGLE_FORMS_RESPONSE_SUBMITTED_EVENT) {
      const prepared = await step.run(
        "prepare-google-forms-execution",
        async () => {
          const delivery = await prisma.googleFormsWebhookEvent.findUnique({
            where: { id: event.data.deliveryId },
            include: {
              execution: true,
              webhookConfig: {
                include: {
                  workflow: {
                    include: { nodes: true },
                  },
                },
              },
            },
          });

          if (
            !delivery ||
            delivery.webhookConfig.publicId !== event.data.webhookId ||
            delivery.webhookConfig.workflowId !== event.data.workflowId ||
            delivery.webhookConfig.triggerNodeId !== event.data.triggerNodeId
          ) {
            throw new Error("Google Forms trigger delivery was not found.");
          }

          const configuration = delivery.webhookConfig;
          const workflow = configuration.workflow;
          const triggerNode = workflow.nodes.find(
            (node) => node.id === configuration.triggerNodeId,
          );

          if (
            !configuration.enabled ||
            !workflow.isActive ||
            workflow.userId !== configuration.userId
          ) {
            throw new Error("Google Forms trigger is inactive.");
          }

          if (!triggerNode) {
            throw new Error("Google Forms trigger was not found.");
          }

          if (triggerNode.type !== NodeType.googleFormsTrigger) {
            throw new Error("Google Forms trigger type does not match.");
          }

          let execution = delivery.execution;

          if (!execution) {
            try {
              execution = await prisma.workflowExecution.create({
                data: {
                  workflowId: workflow.id,
                  userId: configuration.userId,
                  triggerNodeId: configuration.triggerNodeId,
                  googleFormsEventId: delivery.id,
                  status: "PENDING",
                },
              });
            } catch (error) {
              if (
                !(error instanceof Prisma.PrismaClientKnownRequestError) ||
                error.code !== "P2002"
              ) {
                throw error;
              }

              execution = await prisma.workflowExecution.findUnique({
                where: { googleFormsEventId: delivery.id },
              });

              if (!execution) {
                throw error;
              }
            }
          }

          await prisma.googleFormsWebhookEvent.update({
            where: { id: delivery.id },
            data: {
              processingStartedAt: new Date(),
              failedAt: null,
              errorCode: null,
            },
          });

          return {
            executionId: execution.id,
            workflowId: workflow.id,
            userId: configuration.userId,
            triggerNodeId: configuration.triggerNodeId,
          };
        },
      );

      executionIdentity = prepared;
      triggerInput = googleFormsWebhookPayloadSchema.parse({
        eventId: event.data.eventId,
        submittedAt: event.data.submittedAt,
        form: event.data.form,
        response: event.data.response,
      });
    } else {
      executionIdentity = event.data as {
        executionId: string;
        workflowId: string;
        userId: string;
        triggerNodeId: string;
      };
    }

    const { executionId, workflowId, userId, triggerNodeId } =
      executionIdentity;
    const channel = workflowExecutionChannel({ executionId });

    const claim = await step.run("claim-execution", async () => {
      const startedAt = new Date();
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
          startedAt,
          error: null,
        },
      });

      if (claimed.count === 1) {
        return {
          claimed: true,
          status: "RUNNING" as const,
          timestamp: startedAt.toISOString(),
        };
      }

      const existing = await prisma.workflowExecution.findUnique({
        where: { id: executionId },
        select: { inngestRunId: true, status: true, updatedAt: true },
      });

      return {
        claimed:
          existing?.status === "RUNNING" && existing.inngestRunId === runId,
        status: existing?.status ?? null,
        timestamp:
          existing?.updatedAt.toISOString() ?? new Date(0).toISOString(),
      };
    });

    if (!claim.claimed) {
      return { executionId, status: claim.status, skipped: true };
    }

    try {
      await step.realtime.publish(
        "publish:workflow:running",
        channel["execution.status"],
        {
          executionId,
          workflowId,
          status: "RUNNING",
          timestamp: claim.timestamp,
          sequence: 2,
        },
      );
    } catch {
      console.error("Failed to publish workflow running state.", {
        executionId,
        workflowId,
      });
    }

    const workflow = await step.run("prepare-workflow", () =>
      prisma.workflow.findFirstOrThrow({
        where: { id: workflowId, userId, isActive: true },
        include: { nodes: true, connections: true },
      }),
    );

    const validatedPlan = await step.run("validate-workflow-graph", () => {
      const { trigger, executionPlan } = createWorkflowExecutionPlan(
        workflow,
        triggerNodeId,
      );

      return {
        triggerNodeId: trigger.id,
        orderedNodeIds: executionPlan.orderedNodes.map((node) => node.id),
      };
    });

    const pendingNodes = await step.run(
      workflowStepIds.initializePending,
      async () => {
        await prisma.nodeExecution.createMany({
          data: validatedPlan.orderedNodeIds.map((nodeId) => ({
            executionId,
            nodeId,
            status: "PENDING" as const,
          })),
          skipDuplicates: true,
        });

        return prisma.nodeExecution.findMany({
          where: {
            executionId,
            nodeId: { in: validatedPlan.orderedNodeIds },
          },
          select: { nodeId: true, updatedAt: true },
        });
      },
    );

    for (const nodeId of validatedPlan.orderedNodeIds) {
      const node = workflow.nodes.find((candidate) => candidate.id === nodeId);
      const pending = pendingNodes.find(
        (candidate) => candidate.nodeId === nodeId,
      );

      if (!node || !pending) {
        throw new Error(`Workflow node "${nodeId}" could not be initialized.`);
      }

      try {
        await step.realtime.publish(
          workflowStepIds.nodePublish("pending", node.id),
          channel["node.status"],
          {
            executionId,
            workflowId,
            nodeId: node.id,
            nodeType: node.type,
            nodeName: node.name,
            status: "PENDING",
            timestamp: toIsoString(pending.updatedAt),
            sequence: 1,
          },
        );
      } catch {
        console.error("Failed to publish pending node state.", {
          executionId,
          nodeId: node.id,
        });
      }
    }

    const executeDurableNode = async (
      node: { id: string; name?: string; type: NodeType },
      execute: () => Promise<WorkflowNodeResult>,
    ) => {
      const running = await step.run(
        workflowStepIds.nodePersist("running", node.id),
        () =>
          prisma.nodeExecution.update({
            where: { executionId_nodeId: { executionId, nodeId: node.id } },
            data: {
              status: "RUNNING",
              result: Prisma.DbNull,
              error: null,
              startedAt: new Date(),
              completedAt: null,
            },
            select: { updatedAt: true },
          }),
      );

      const runningEvent: NodeStatusEvent = {
        executionId,
        workflowId,
        nodeId: node.id,
        nodeType: node.type,
        nodeName: node.name,
        status: "RUNNING",
        timestamp: toIsoString(running.updatedAt),
        sequence: 2,
      };

      try {
        await step.realtime.publish(
          workflowStepIds.nodePublish("running", node.id),
          channel["node.status"],
          runningEvent,
        );
      } catch {
        console.error("Failed to publish running node state.", {
          executionId,
          nodeId: node.id,
        });
      }

      let nodeResult: WorkflowNodeResult;

      try {
        nodeResult = await step.run(
          workflowStepIds.nodeExecute(node.id, node.type),
          execute,
        );
      } catch (error) {
        const isFinalAttempt =
          maxAttempts !== undefined && attempt >= maxAttempts - 1;

        if (!isFinalAttempt) {
          throw error;
        }

        const errorMessage = getWorkflowExecutionErrorMessage(error);
        const failed = await step.run(
          workflowStepIds.nodePersist("failed", node.id),
          () =>
            prisma.nodeExecution.update({
              where: {
                executionId_nodeId: { executionId, nodeId: node.id },
              },
              data: {
                status: "FAILED",
                error: errorMessage,
                completedAt: new Date(),
              },
              select: { updatedAt: true },
            }),
        );

        try {
          await step.realtime.publish(
            workflowStepIds.nodePublish("failed", node.id),
            channel["node.status"],
            createFailedNodeStatusEvent({
              executionId,
              workflowId,
              node,
              error,
              message: errorMessage,
              timestamp: toIsoString(failed.updatedAt),
            }),
          );
        } catch {
          console.error("Failed to publish failed node state.", {
            executionId,
            nodeId: node.id,
          });
        }

        throw error;
      }

      const succeeded = await step.run(
        workflowStepIds.nodePersist("success", node.id),
        () =>
          prisma.nodeExecution.update({
            where: { executionId_nodeId: { executionId, nodeId: node.id } },
            data: {
              status: "SUCCESS",
              result: nodeResult,
              error: null,
              completedAt: new Date(),
            },
            select: { updatedAt: true },
          }),
      );

      try {
        await step.realtime.publish(
          workflowStepIds.nodePublish("success", node.id),
          channel["node.status"],
          {
            executionId,
            workflowId,
            nodeId: node.id,
            nodeType: node.type,
            nodeName: node.name,
            status: "SUCCESS",
            output: sanitizeRealtimeOutput(nodeResult),
            timestamp: toIsoString(succeeded.updatedAt),
            sequence: 3,
          },
        );
      } catch {
        console.error("Failed to publish successful node state.", {
          executionId,
          nodeId: node.id,
        });
      }

      return nodeResult;
    };

    const result = await executeWorkflowGraph(workflow, {
      executionId,
      triggerNodeId,
      triggerInput,
      executeTrigger: executeDurableNode,
      executeNode: (node, execute) => executeDurableNode(node, execute),
    });

    const completed = await step.run("complete-workflow", async () => {
      const completedAt = new Date();
      const updated = await prisma.workflowExecution.updateMany({
        where: {
          id: executionId,
          inngestRunId: runId,
          status: "RUNNING",
        },
        data: {
          status: "SUCCESS",
          error: null,
          completedAt,
        },
      });

      if (updated.count !== 1) {
        throw new Error("The workflow execution could not be completed.");
      }

      return { timestamp: completedAt.toISOString() };
    });

    const completionEvent = {
      executionId,
      workflowId,
      status: "SUCCESS" as const,
      timestamp: completed.timestamp,
      sequence: 3,
    };

    if (event.name === GOOGLE_FORMS_RESPONSE_SUBMITTED_EVENT) {
      await step.run("complete-google-forms-delivery", () =>
        prisma.googleFormsWebhookEvent.update({
          where: { id: event.data.deliveryId },
          data: {
            completedAt: new Date(),
            failedAt: null,
            errorCode: null,
          },
        }),
      );
    }

    try {
      await step.realtime.publish(
        "publish:workflow:success",
        channel["execution.status"],
        completionEvent,
      );
      await step.realtime.publish(
        "publish:workflow:completed",
        channel["execution.completed"],
        completionEvent,
      );
    } catch {
      console.error("Failed to publish workflow completion state.", {
        executionId,
        workflowId,
      });
    }

    return { ...result, executionId, status: "SUCCESS" as const };
  },
);
