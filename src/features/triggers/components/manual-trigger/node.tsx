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
  const status =
    execution.workflowId === workflowId && execution.triggerNodeId === props.id
      ? execution.status
      : "idle";

  return (
    <BaseTriggerNode
      {...props}
      icon={MousePointerIcon}
      name="When clicking 'Execute workflow'"
      status={status}
      //    onSettings={handleOpenSettings} TODO
      //    onDoubleClick={handleOpenSettings} TODO
    />
  );
});

ManualTriggerNode.displayName = "ManualTriggerNode";
