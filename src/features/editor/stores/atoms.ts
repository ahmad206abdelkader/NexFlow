import type { ReactFlowInstance } from "@xyflow/react";
import { atom } from "jotai";

export const editorAtom = atom<ReactFlowInstance | null>(null);

export type WorkflowExecutionStatus = "idle" | "running" | "success" | "error";

export type NodeExecutionStatus =
  | "IDLE"
  | "PENDING"
  | "RUNNING"
  | "SUCCESS"
  | "FAILED";

export type NodeExecutionState = {
  status: NodeExecutionStatus;
  error: { code?: string; message: string } | null;
  output: unknown;
  updatedAt: string | null;
  sequence: number;
};

export type WorkflowExecutionState = {
  executionId: string | null;
  workflowId: string | null;
  triggerNodeId: string | null;
  status: WorkflowExecutionStatus;
  updatedAt: string | null;
  nodeStates: Record<string, NodeExecutionState>;
};

export const workflowExecutionAtom = atom<WorkflowExecutionState>({
  executionId: null,
  workflowId: null,
  triggerNodeId: null,
  status: "idle",
  updatedAt: null,
  nodeStates: {},
});
