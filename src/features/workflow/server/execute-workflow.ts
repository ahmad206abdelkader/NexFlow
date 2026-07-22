import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { TRPCError } from "@trpc/server";
import { NodeType, type Prisma } from "@/generated/prisma";

type WorkflowGraph = {
  id: string;
  nodes: Array<{
    id: string;
    type: NodeType;
    data: Prisma.JsonValue;
  }>;
  connections: Array<{
    fromNodeId: string;
    toNodeId: string;
  }>;
};

export type WorkflowNodeResult = {
  statusCode: number;
};

type ExecuteWorkflowGraphOptions = {
  executionId?: string;
  executeNode?: (
    node: WorkflowGraph["nodes"][number],
    execute: () => Promise<WorkflowNodeResult>,
  ) => Promise<WorkflowNodeResult>;
};

type HttpRequestData = {
  endpoint?: unknown;
  method?: unknown;
  body?: unknown;
};

const HTTP_METHODS = new Set(["GET", "POST", "PATCH", "DELETE"]);

const isPrivateIpv4 = (address: string) => {
  const [first, second] = address.split(".").map(Number);

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
};

const isPrivateIpv6 = (address: string) => {
  const normalized = address.toLowerCase();

  if (normalized.startsWith("::ffff:")) {
    const mappedIpv4 = normalized.slice("::ffff:".length);
    return isIP(mappedIpv4) === 4 && isPrivateIpv4(mappedIpv4);
  }

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("ff")
  );
};

const assertPublicHttpUrl = async (endpoint: string) => {
  let url: URL;

  try {
    url = new URL(endpoint);
  } catch {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "HTTP Request node has an invalid URL.",
    });
  }

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hostname === "localhost" ||
    url.hostname.endsWith(".localhost")
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "HTTP Request URLs must use a public HTTP or HTTPS address.",
    });
  }

  let addresses: LookupAddress[];

  try {
    addresses = await lookup(url.hostname, { all: true, verbatim: true });
  } catch {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "The HTTP Request hostname could not be resolved.",
    });
  }

  const hasUnsafeAddress = addresses.some(({ address, family }) =>
    family === 4 ? isPrivateIpv4(address) : isPrivateIpv6(address),
  );

  if (addresses.length === 0 || hasUnsafeAddress) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "HTTP Request URLs cannot target private network addresses.",
    });
  }

  return url;
};

export const getWorkflowExecutionErrorMessage = (error: unknown) => {
  if (error instanceof TRPCError && error.message.trim()) {
    return error.message.trim().slice(0, 500);
  }

  if (error instanceof Error) {
    const message = error.message.trim();
    const safePrefixes = ["The workflow", "Workflow node", "HTTP Request node"];

    if (safePrefixes.some((prefix) => message.startsWith(prefix))) {
      return message.slice(0, 500);
    }
  }

  return "Workflow execution failed.";
};

const executeHttpRequest = async (
  nodeId: string,
  data: Prisma.JsonValue,
  idempotencyKey?: string,
): Promise<WorkflowNodeResult> => {
  const request = (data ?? {}) as HttpRequestData;
  const endpoint =
    typeof request.endpoint === "string" ? request.endpoint.trim() : "";
  const method = typeof request.method === "string" ? request.method : "GET";

  if (!endpoint) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `HTTP Request node ${nodeId} needs a URL before execution.`,
    });
  }

  if (!HTTP_METHODS.has(method)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `HTTP Request node ${nodeId} uses an unsupported method.`,
    });
  }

  const url = await assertPublicHttpUrl(endpoint);
  const body = typeof request.body === "string" ? request.body : undefined;
  const canHaveBody = method !== "GET";
  const headers: Record<string, string> = {};

  if (canHaveBody && body) {
    headers["content-type"] = "application/json";
  }

  if (idempotencyKey) {
    headers["Idempotency-Key"] = idempotencyKey;
  }

  let response: Response;

  try {
    response = await fetch(url, {
      method,
      body: canHaveBody && body ? body : undefined,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      redirect: "error",
    });
  } catch (error) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `HTTP Request node ${nodeId} could not complete.`,
      cause: error,
    });
  }

  if (!response.ok) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `HTTP Request node ${nodeId} failed with status ${response.status}.`,
    });
  }

  return { statusCode: response.status };
};

export const executeWorkflowGraph = async (
  workflow: WorkflowGraph,
  options: ExecuteWorkflowGraphOptions = {},
) => {
  const triggers = workflow.nodes.filter(
    (node) => node.type === NodeType.MANUAL_TRIGGER,
  );

  if (triggers.length !== 1) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "The workflow must contain exactly one manual trigger.",
    });
  }

  const trigger = triggers[0];
  const nodesById = new Map(workflow.nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, string[]>();

  for (const connection of workflow.connections) {
    const targets = outgoing.get(connection.fromNodeId) ?? [];
    targets.push(connection.toNodeId);
    outgoing.set(connection.fromNodeId, targets);
  }

  const reachableNodeIds = new Set([trigger.id]);
  const reachableQueue = [trigger.id];

  for (let index = 0; index < reachableQueue.length; index += 1) {
    const nodeId = reachableQueue[index];

    for (const targetId of outgoing.get(nodeId) ?? []) {
      if (!reachableNodeIds.has(targetId)) {
        reachableNodeIds.add(targetId);
        reachableQueue.push(targetId);
      }
    }
  }

  const indegree = new Map([...reachableNodeIds].map((nodeId) => [nodeId, 0]));

  for (const connection of workflow.connections) {
    if (
      reachableNodeIds.has(connection.fromNodeId) &&
      reachableNodeIds.has(connection.toNodeId)
    ) {
      indegree.set(
        connection.toNodeId,
        (indegree.get(connection.toNodeId) ?? 0) + 1,
      );
    }
  }

  const ready = [...indegree]
    .filter(([, count]) => count === 0)
    .map(([nodeId]) => nodeId);
  const executionOrder: string[] = [];

  for (let index = 0; index < ready.length; index += 1) {
    const nodeId = ready[index];
    executionOrder.push(nodeId);

    for (const targetId of outgoing.get(nodeId) ?? []) {
      if (!reachableNodeIds.has(targetId)) {
        continue;
      }

      const nextIndegree = (indegree.get(targetId) ?? 0) - 1;
      indegree.set(targetId, nextIndegree);

      if (nextIndegree === 0) {
        ready.push(targetId);
      }
    }
  }

  if (executionOrder.length !== reachableNodeIds.size) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "The workflow contains a cycle and cannot be executed.",
    });
  }

  const executedNodeIds: string[] = [];
  const nodeResults: Array<{ nodeId: string; result: WorkflowNodeResult }> = [];
  const executeNode = options.executeNode ?? ((_node, execute) => execute());

  for (const nodeId of executionOrder) {
    if (nodeId === trigger.id) {
      continue;
    }

    const node = nodesById.get(nodeId);

    if (!node || node.type !== NodeType.HTTP_REQUIST) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Workflow node ${nodeId} is not executable.`,
      });
    }

    const result = await executeNode(node, () =>
      executeHttpRequest(
        node.id,
        node.data,
        options.executionId ? `${options.executionId}:${node.id}` : undefined,
      ),
    );
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
