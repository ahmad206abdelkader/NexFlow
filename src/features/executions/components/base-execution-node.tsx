"use client";

import { type NodeProps, Position } from "@xyflow/react";
import type { LucideIcon } from "lucide-react";
import Image from "next/image";
import { memo, type ReactNode } from "react";
import { BaseHandle } from "@/components/base-handle";
import { BaseNode, BaseNodeContent } from "@/components/react-flow/base-node";
import { WorkflowNode } from "@/components/workflow-node";
import { useDeleteNode } from "@/features/editor/hooks/use-delete-node";
import type { NodeExecutionStatus } from "@/features/editor/stores/atoms";
import { cn } from "@/lib/utils";
import {
  executionNodeClassName,
  NodeExecutionIndicator,
} from "./node-execution-state";

interface BaseExecutionNodeProps extends NodeProps {
  icon: LucideIcon | string;
  name: string;
  description?: string;
  children?: ReactNode;
  showToolbar?: boolean;
  status?: NodeExecutionStatus;
  error?: string | null;
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
    status = "IDLE",
    error,
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
        <BaseNode
          onDoubleClick={onDoubleClick}
          className={cn("relative group", executionNodeClassName(status))}
        >
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
          <NodeExecutionIndicator status={status} error={error} />
        </BaseNode>
      </WorkflowNode>
    );
  },
);

BaseExecutionNode.displayName = "BaseEecutionNode";
