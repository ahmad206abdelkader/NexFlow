"use client";

import { type NodeProps, Position } from "@xyflow/react";
import type { LucideIcon } from "lucide-react";
import Image from "next/image";
import { memo, type ReactNode, useCallback } from "react";
import { BaseNode, BaseNodeContent } from "@/components/react-flow/base-node";  
import { BaseHandle } from "@/components/base-handle"; 
import { WorkflowNode } from "@/components/workflow-node"; 

interface BaseTriggerNodeProps extends NodeProps {
  icon: LucideIcon | string;
  name: string;
  desciption?: string;
  children?: ReactNode;
  showToolbar?: boolean;
  // status?: NodeStatus;
  onSettings?: () => void;
  onDoubleClick?: () => void;
}

export const BaseTriggerNode = memo(
  ({
    id,
    icon: Icon,
    name,
    desciption,
    showToolbar,
    children,
    onSettings,
    onDoubleClick,
  }: BaseTriggerNodeProps) => {
    const handleDelete = () => {};

    return (
      <WorkflowNode
        name={name}
        description={desciption}
        onDelete={handleDelete}
        onSettings={onSettings}
        showToolbar
      >
        <BaseNode onDoubleClick={onDoubleClick} className="rounded-l-2xl relative group">
          <BaseNodeContent>
            {typeof Icon === "string" ? (
               <Image src={Icon} alt={name} width={16} height={16} /> 
            ): (
                <Icon className="size-4 text-muted-foreground" />
            )}
            {children}
          </BaseNodeContent>
          <BaseHandle type="source" position={Position.Right} />
        </BaseNode>
      </WorkflowNode>
    );
  },
);

BaseTriggerNode.displayName = "BaseTriggerNode";
