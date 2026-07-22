import type { GoogleFormsWebhookPayload } from "@/features/triggers/google-forms/schema";
import { executeGoogleFormsTrigger } from "@/features/triggers/google-forms/server/executor";
import { NodeType, type Prisma } from "@/generated/prisma";
import { executeHttpRequest } from "./http-request";
import {
  resolveWorkflowVariables,
  type TemplateVariableDefinition,
} from "./resolve-workflow-variables";

export type ExecutorNode = {
  id: string;
  name?: string;
  type: NodeType;
  data: Prisma.JsonValue;
};

export type NodeExecutorResult = Record<string, Prisma.JsonValue>;

export type NodeExecutorContext = {
  node: ExecutorNode;
  executionId?: string;
  upstreamResults: ReadonlyArray<{
    nodeId: string;
    nodeName?: string;
    variableName?: string;
    result: NodeExecutorResult;
  }>;
  variableDefinitions: ReadonlyArray<TemplateVariableDefinition>;
  triggerInput?: GoogleFormsWebhookPayload;
};

export type NodeExecutor = (
  context: NodeExecutorContext,
) => Promise<NodeExecutorResult>;

export class ExecutorRegistry {
  private readonly executors = new Map<NodeType, NodeExecutor>();

  register(nodeType: NodeType, executor: NodeExecutor) {
    if (this.executors.has(nodeType)) {
      throw new Error(
        `Executor for node type ${nodeType} is already registered.`,
      );
    }

    this.executors.set(nodeType, executor);
    return this;
  }

  resolve(nodeType: NodeType) {
    const executor = this.executors.get(nodeType);

    if (!executor) {
      throw new Error(
        `Workflow node type ${nodeType} has no registered executor.`,
      );
    }

    return executor;
  }

  has(nodeType: NodeType) {
    return this.executors.has(nodeType);
  }
}

const prepareHttpRequestDataForTemplates = (data: Prisma.JsonValue) => {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { data, jsonStringFields: ["body", "jsonBody"] };
  }

  const retainedData = Object.fromEntries(
    Object.entries(data).filter(
      ([field]) =>
        !["bodyType", "contentType", "bodyFields", "rawBody"].includes(field),
    ),
  );
  const method =
    typeof retainedData.method === "string"
      ? retainedData.method.toUpperCase()
      : "GET";

  if (method !== "GET") {
    return {
      data: retainedData as Prisma.JsonValue,
      jsonStringFields: ["body", "jsonBody"],
    };
  }

  return {
    data: { ...retainedData, body: "", jsonBody: "" },
    jsonStringFields: [],
  };
};

export const workflowExecutorRegistry = new ExecutorRegistry()
  .register(NodeType.MANUAL_TRIGGER, async ({ node }) => ({
    triggerNodeId: node.id,
    status: "triggered",
  }))
  .register(NodeType.googleFormsTrigger, executeGoogleFormsTrigger)
  .register(
    NodeType.HTTP_REQUIST,
    async ({ node, executionId, upstreamResults, variableDefinitions }) => {
      const prepared = prepareHttpRequestDataForTemplates(node.data);
      const resolvedData = resolveWorkflowVariables(
        node.id,
        prepared.data,
        upstreamResults,
        {
          nodeName: node.name ?? node.type,
          executionId,
          variableDefinitions,
          jsonStringFields: prepared.jsonStringFields,
          urlFields: ["endpoint"],
        },
      );

      return executeHttpRequest(
        node.id,
        resolvedData,
        executionId ? `${executionId}:${node.id}` : undefined,
      );
    },
  );
