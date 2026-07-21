"use client";

import { type NodeProps, Position } from "@xyflow/react";
import type { LucideIcon } from "lucide-react";
import Image from "next/image";
import { memo, type ReactNode } from "react";
import { BaseHandle } from "@/components/base-handle";
import { BaseNode, BaseNodeContent } from "@/components/react-flow/base-node";
import { WorkflowNode } from "@/components/workflow-node";
import { useDeleteNode } from "@/features/editor/hooks/use-delete-node";

interface BaseExecutionNodeProps extends NodeProps {
  icon: LucideIcon | string;
  name: string;
  description?: string;
  children?: ReactNode;
  showToolbar?: boolean;
  // status?: NodeStatus;
  onSettings?: () => void;
  onDoubleClick?: () => void;
}

export const BaseExecutionNode = memo(
  ({
    id,
    icon: Icon,
    name,
    description,
    showToolbar,
    children,
    onSettings,
    onDoubleClick,
  }: BaseExecutionNodeProps) => {
    const handleDelete = useDeleteNode(id);

    return (
      <WorkflowNode
        name={name}
        description={description}
        onDelete={handleDelete}
        onSettings={onSettings}
        showToolbar={showToolbar ?? true}
      >
        <BaseNode onDoubleClick={onDoubleClick}>
          <BaseNodeContent>
            {typeof Icon === "string" ? (
              <Image src={Icon} alt={name} width={16} height={16} />
            ) : (
              <Icon className="size-4 text-muted-foreground" />
            )}
            {children}
            <BaseHandle id="target-1" type="target" position={Position.Left} />
            <BaseHandle id="source-1" type="source" position={Position.Right} />
          </BaseNodeContent>
        </BaseNode>
      </WorkflowNode>
    );
  },
);

BaseExecutionNode.displayName = "BaseEecutionNode";
