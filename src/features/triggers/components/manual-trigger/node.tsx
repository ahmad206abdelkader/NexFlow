import type { NodeProps } from "@xyflow/react";
import { useAtomValue } from "jotai";
import { MousePointerIcon } from "lucide-react";
import { useParams } from "next/navigation";
import { memo } from "react";
import { workflowExecutionAtom } from "@/features/editor/stores/atoms";
import { BaseTriggerNode } from "../base-trigger-node";

export const ManualTriggerNode = memo((props: NodeProps) => {
  const workflowId = useParams<{ workflowId: string }>()?.workflowId;
  const execution = useAtomValue(workflowExecutionAtom);
  const nodeExecution =
    execution.workflowId === workflowId
      ? execution.nodeStates[props.id]
      : undefined;

  return (
    <BaseTriggerNode
      {...props}
      icon={MousePointerIcon}
      name="When clicking 'Execute workflow'"
      status={nodeExecution?.status ?? "IDLE"}
      error={nodeExecution?.error?.message}
      //    onSettings={handleOpenSettings} TODO
      //    onDoubleClick={handleOpenSettings} TODO
    />
  );
});

ManualTriggerNode.displayName = "ManualTriggerNode";
