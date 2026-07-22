import type { NodeType } from "@/generated/prisma";

const nodeTypeStepNames: Record<NodeType, string> = {
  INITIAL: "initial",
  MANUAL_TRIGGER: "manual-trigger",
  HTTP_REQUIST: "http-request",
  googleFormsTrigger: "google-forms-trigger",
};

export const workflowStepIds = {
  initializePending: "persist:nodes:pending",
  nodeExecute: (nodeId: string, nodeType: NodeType) =>
    `execute:${nodeTypeStepNames[nodeType]}:${nodeId}`,
  nodePersist: (status: "running" | "success" | "failed", nodeId: string) =>
    `persist:${status}:${nodeId}`,
  nodePublish: (
    status: "pending" | "running" | "success" | "failed",
    nodeId: string,
  ) => `publish:${status}:${nodeId}`,
} as const;
