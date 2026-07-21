import type { ReactFlowInstance } from "@xyflow/react";
import { atom } from "jotai";

export const editorAtom = atom<ReactFlowInstance | null>(null);

export type WorkflowExecutionStatus = "idle" | "running" | "success" | "error";

export type WorkflowExecutionState = {
  workflowId: string | null;
  triggerNodeId: string | null;
  status: WorkflowExecutionStatus;
};

export const workflowExecutionAtom = atom<WorkflowExecutionState>({
  workflowId: null,
  triggerNodeId: null,
  status: "idle",
});
