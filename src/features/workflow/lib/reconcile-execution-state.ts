import type {
  NodeExecutionState,
  NodeExecutionStatus,
  WorkflowExecutionState,
  WorkflowExecutionStatus,
} from "@/features/editor/stores/atoms";
import type { ExecutionStatusEvent, NodeStatusEvent } from "@/inngest/realtime";

type PersistedNodeExecution = {
  nodeId: string;
  status: Exclude<NodeExecutionStatus, "IDLE">;
  result: unknown;
  error: string | null;
  updatedAt: Date | string;
};

export type PersistedWorkflowExecution = {
  id: string;
  workflowId: string;
  triggerNodeId: string;
  status: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED";
  updatedAt: Date | string;
  nodeExecutions: PersistedNodeExecution[];
};

const nodeSequence: Record<Exclude<NodeExecutionStatus, "IDLE">, number> = {
  PENDING: 1,
  RUNNING: 2,
  SUCCESS: 3,
  FAILED: 3,
};

const toTimestamp = (value: Date | string) =>
  value instanceof Date ? value.toISOString() : value;

const toWorkflowStatus = (
  status: PersistedWorkflowExecution["status"],
): WorkflowExecutionStatus => {
  if (status === "PENDING" || status === "RUNNING") {
    return "running";
  }

  return status === "SUCCESS" ? "success" : "error";
};

const isNewer = (
  current: Pick<NodeExecutionState, "sequence" | "updatedAt"> | undefined,
  sequence: number,
  timestamp: string,
) => {
  if (!current) {
    return true;
  }

  if (sequence !== current.sequence) {
    return sequence > current.sequence;
  }

  return !current.updatedAt || timestamp > current.updatedAt;
};

export const reconcilePersistedExecution = (
  current: WorkflowExecutionState,
  execution: PersistedWorkflowExecution,
): WorkflowExecutionState => {
  const sameExecution = current.executionId === execution.id;
  const persistedTimestamp = toTimestamp(execution.updatedAt);
  const usePersistedWorkflowState =
    !sameExecution ||
    !current.updatedAt ||
    persistedTimestamp >= current.updatedAt;
  const nodeStates = sameExecution ? { ...current.nodeStates } : {};

  for (const node of execution.nodeExecutions) {
    const timestamp = toTimestamp(node.updatedAt);
    const sequence = nodeSequence[node.status];

    if (!isNewer(nodeStates[node.nodeId], sequence, timestamp)) {
      continue;
    }

    nodeStates[node.nodeId] = {
      status: node.status,
      error: node.error ? { message: node.error } : null,
      output: node.result,
      updatedAt: timestamp,
      sequence,
    };
  }

  return {
    executionId: execution.id,
    workflowId: execution.workflowId,
    triggerNodeId: execution.triggerNodeId,
    status: usePersistedWorkflowState
      ? toWorkflowStatus(execution.status)
      : current.status,
    updatedAt: usePersistedWorkflowState
      ? persistedTimestamp
      : current.updatedAt,
    nodeStates,
  };
};

export const applyNodeStatusEvent = (
  current: WorkflowExecutionState,
  event: NodeStatusEvent,
): WorkflowExecutionState => {
  if (current.executionId !== event.executionId) {
    return current;
  }

  const existing = current.nodeStates[event.nodeId];

  if (!isNewer(existing, event.sequence, event.timestamp)) {
    return current;
  }

  return {
    ...current,
    nodeStates: {
      ...current.nodeStates,
      [event.nodeId]: {
        status: event.status,
        error: event.error ?? null,
        output: event.output ?? existing?.output ?? null,
        updatedAt: event.timestamp,
        sequence: event.sequence,
      },
    },
  };
};

export const applyExecutionStatusEvent = (
  current: WorkflowExecutionState,
  event: ExecutionStatusEvent,
): WorkflowExecutionState => {
  if (current.executionId !== event.executionId) {
    return current;
  }

  if (current.updatedAt && event.timestamp <= current.updatedAt) {
    return current;
  }

  return {
    ...current,
    status: toWorkflowStatus(event.status),
    updatedAt: event.timestamp,
  };
};

export const beginWorkflowExecution = (input: {
  executionId: string;
  workflowId: string;
  triggerNodeId: string;
  status: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED";
}): WorkflowExecutionState => ({
  executionId: input.executionId,
  workflowId: input.workflowId,
  triggerNodeId: input.triggerNodeId,
  status: toWorkflowStatus(input.status),
  updatedAt: null,
  nodeStates: {},
});

export const pruneNodeExecutionStates = (
  current: WorkflowExecutionState,
  nodeIds: ReadonlySet<string>,
): WorkflowExecutionState => {
  const nodeStates = Object.fromEntries(
    Object.entries(current.nodeStates).filter(([nodeId]) =>
      nodeIds.has(nodeId),
    ),
  );

  return Object.keys(nodeStates).length ===
    Object.keys(current.nodeStates).length
    ? current
    : { ...current, nodeStates };
};

export const getExecutionPollingInterval = (
  status: PersistedWorkflowExecution["status"] | undefined,
  realtimeIsHealthy: boolean,
  watchForExternalExecutions = false,
) => {
  if (status !== "PENDING" && status !== "RUNNING") {
    return watchForExternalExecutions ? 5_000 : false;
  }

  return realtimeIsHealthy ? 10_000 : 1000;
};
