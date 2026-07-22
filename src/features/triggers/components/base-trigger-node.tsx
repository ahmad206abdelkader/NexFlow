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
import {
  executionNodeClassName,
  NodeExecutionIndicator,
} from "@/features/executions/components/node-execution-state";
import { cn } from "@/lib/utils";

interface BaseTriggerNodeProps extends NodeProps {
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

export const BaseTriggerNode = memo(
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
  }: BaseTriggerNodeProps) => {
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
          className={cn(
            "rounded-l-2xl relative group",
            executionNodeClassName(status),
          )}
        >
          <BaseNodeContent>
            {typeof Icon === "string" ? (
              <Image src={Icon} alt={name} width={16} height={16} />
            ) : (
              <Icon className="size-4 text-muted-foreground" />
            )}
            {children}
          </BaseNodeContent>
          <NodeExecutionIndicator status={status} error={error} />
          <BaseHandle id="main" type="source" position={Position.Right} />
        </BaseNode>
      </WorkflowNode>
    );
  },
);

BaseTriggerNode.displayName = "BaseTriggerNode";
