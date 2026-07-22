import { NodeType } from "@/generated/prisma";

export const triggerNodeTypes = [
  NodeType.MANUAL_TRIGGER,
  NodeType.googleFormsTrigger,
] as const;

export const isTriggerNodeType = (type: NodeType | string | undefined) =>
  triggerNodeTypes.includes(type as (typeof triggerNodeTypes)[number]);

export const defaultNodeData = (type: NodeType) =>
  type === NodeType.googleFormsTrigger ? { variableName: "googleForm" } : {};
