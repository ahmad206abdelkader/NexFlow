import { TRPCError } from "@trpc/server";
import { isTriggerNodeType } from "@/config/node-types";
import type { GoogleFormsWebhookPayload } from "@/features/triggers/google-forms/schema";
import type { NodeType, Prisma } from "@/generated/prisma";
import {
  type NodeExecutorContext,
  type NodeExecutorResult,
  workflowExecutorRegistry,
} from "./executor-registry";
import {
  TemplateResolutionError,
  type TemplateVariableDefinition,
} from "./resolve-workflow-variables";
import { topologicallySortWorkflowNodes } from "./topological-sort";

type WorkflowGraph = {
  id: string;
  nodes: Array<{
    id: string;
    name?: string;
    type: NodeType;
    data: Prisma.JsonValue;
  }>;
  connections: Array<{
    fromNodeId: string;
    toNodeId: string;
  }>;
};

export type WorkflowNodeResult = NodeExecutorResult;

export type WorkflowNodeExecutionContext = Pick<
  NodeExecutorContext,
  "upstreamResults"
>;

type ExecuteWorkflowGraphOptions = {
  executionId?: string;
  triggerNodeId?: string;
  triggerInput?: GoogleFormsWebhookPayload;
  executeTrigger?: (
    node: WorkflowGraph["nodes"][number],
    execute: () => Promise<WorkflowNodeResult>,
  ) => Promise<WorkflowNodeResult>;
  executeNode?: (
    node: WorkflowGraph["nodes"][number],
    execute: () => Promise<WorkflowNodeResult>,
    context: WorkflowNodeExecutionContext,
  ) => Promise<WorkflowNodeResult>;
};

export const createWorkflowExecutionPlan = (
  workflow: WorkflowGraph,
  expectedTriggerNodeId?: string,
) => {
  const triggers = workflow.nodes.filter((node) =>
    isTriggerNodeType(node.type),
  );

  if (triggers.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Workflow must contain a trigger.",
    });
  }

  if (triggers.length > 1) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Workflow must contain only one trigger.",
    });
  }

  const trigger = triggers[0];

  if (expectedTriggerNodeId && trigger.id !== expectedTriggerNodeId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Workflow trigger node does not match the requested trigger.",
    });
  }

  if (
    workflow.connections.some(
      (connection) => connection.toNodeId === trigger.id,
    )
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A trigger must be the first node in a workflow.",
    });
  }
  const executionPlan = topologicallySortWorkflowNodes(
    workflow.nodes,
    workflow.connections,
    trigger.id,
  );

  return { trigger, executionPlan };
};

export const getWorkflowExecutionErrorMessage = (error: unknown) => {
  if (error instanceof TemplateResolutionError) {
    return error.message.trim().slice(0, 500);
  }

  if (error instanceof TRPCError && error.message.trim()) {
    return error.message.trim().slice(0, 500);
  }

  if (error instanceof Error) {
    const message = error.message.trim();
    const safePrefixes = [
      "The workflow",
      "Workflow ",
      "HTTP Request node",
      "Google Forms trigger",
    ];

    if (safePrefixes.some((prefix) => message.startsWith(prefix))) {
      return message.slice(0, 500);
    }
  }

  return "Workflow execution failed.";
};

export const executeWorkflowGraph = async (
  workflow: WorkflowGraph,
  options: ExecuteWorkflowGraphOptions = {},
) => {
  const { trigger, executionPlan } = createWorkflowExecutionPlan(
    workflow,
    options.triggerNodeId,
  );

  const executedNodeIds: string[] = [];
  const nodeResults: Array<{ nodeId: string; result: WorkflowNodeResult }> = [];
  const resultsByNodeId = new Map<string, WorkflowNodeResult>();
  const nodesById = new Map(workflow.nodes.map((node) => [node.id, node]));
  const executionIndexByNodeId = new Map(
    executionPlan.orderedNodes.map((node, index) => [node.id, index]),
  );
  const ancestorIdsByNodeId = new Map<string, Set<string>>();
  const variableDefinitions: TemplateVariableDefinition[] = workflow.nodes.map(
    (node) => {
      const nodeData =
        typeof node.data === "object" &&
        node.data !== null &&
        !Array.isArray(node.data)
          ? node.data
          : null;

      return {
        nodeId: node.id,
        nodeName: node.name ?? node.type,
        variableName:
          typeof nodeData?.variableName === "string"
            ? nodeData.variableName
            : undefined,
      };
    },
  );
  const executeNode = options.executeNode ?? ((_node, execute) => execute());

  const triggerExecutor = workflowExecutorRegistry.resolve(trigger.type);
  const runTrigger = () =>
    triggerExecutor({
      node: trigger,
      executionId: options.executionId,
      upstreamResults: [],
      variableDefinitions,
      triggerInput: options.triggerInput,
    });
  const triggerResult = options.executeTrigger
    ? await options.executeTrigger(trigger, runTrigger)
    : await runTrigger();
  resultsByNodeId.set(trigger.id, triggerResult);

  const getAncestorIds = (nodeId: string): Set<string> => {
    const cached = ancestorIdsByNodeId.get(nodeId);
    if (cached) {
      return cached;
    }

    const ancestors = new Set<string>();
    ancestorIdsByNodeId.set(nodeId, ancestors);

    for (const dependencyId of executionPlan.dependenciesByNodeId.get(nodeId) ??
      []) {
      ancestors.add(dependencyId);

      for (const ancestorId of getAncestorIds(dependencyId)) {
        ancestors.add(ancestorId);
      }
    }

    return ancestors;
  };

  for (const node of executionPlan.orderedNodes) {
    if (node.id === trigger.id) {
      continue;
    }

    const executor = workflowExecutorRegistry.resolve(node.type);

    const upstreamResults = [...getAncestorIds(node.id)]
      .filter((ancestorId) => {
        if (ancestorId !== trigger.id) {
          return true;
        }

        const triggerData =
          typeof trigger.data === "object" &&
          trigger.data !== null &&
          !Array.isArray(trigger.data)
            ? trigger.data
            : null;

        return (
          typeof triggerData?.variableName === "string" &&
          triggerData.variableName.trim().length > 0
        );
      })
      .sort(
        (left, right) =>
          (executionIndexByNodeId.get(left) ?? 0) -
          (executionIndexByNodeId.get(right) ?? 0),
      )
      .map((dependencyId) => {
        const result = resultsByNodeId.get(dependencyId);

        if (!result) {
          throw new Error(
            `Workflow node ${node.id} cannot run before dependency ${dependencyId} succeeds.`,
          );
        }

        const dependency = nodesById.get(dependencyId);
        const dependencyData =
          typeof dependency?.data === "object" &&
          dependency.data !== null &&
          !Array.isArray(dependency.data)
            ? dependency.data
            : null;
        const variableName =
          typeof dependencyData?.variableName === "string"
            ? dependencyData.variableName
            : undefined;

        return {
          nodeId: dependencyId,
          nodeName: dependency?.name ?? dependency?.type,
          variableName,
          result,
        };
      });
    const result = await executeNode(
      node,
      () =>
        executor({
          node,
          executionId: options.executionId,
          upstreamResults,
          variableDefinitions,
        }),
      { upstreamResults },
    );
    resultsByNodeId.set(node.id, result);
    executedNodeIds.push(node.id);
    nodeResults.push({ nodeId: node.id, result });
  }

  return {
    workflowId: workflow.id,
    triggerNodeId: trigger.id,
    executedNodeIds,
    nodeResults,
  };
};
