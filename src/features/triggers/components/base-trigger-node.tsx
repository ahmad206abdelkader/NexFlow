"use client";

import { type NodeProps, Position } from "@xyflow/react";
import {
  CircleCheckIcon,
  CircleXIcon,
  LoaderCircleIcon,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import { memo, type ReactNode } from "react";
import { BaseHandle } from "@/components/base-handle";
import { BaseNode, BaseNodeContent } from "@/components/react-flow/base-node";
import { WorkflowNode } from "@/components/workflow-node";
import { useDeleteNode } from "@/features/editor/hooks/use-delete-node";
import type { WorkflowExecutionStatus } from "@/features/editor/stores/atoms";
import { cn } from "@/lib/utils";
import styles from "./execution-state.module.css";

interface BaseTriggerNodeProps extends NodeProps {
  icon: LucideIcon | string;
  name: string;
  description?: string;
  children?: ReactNode;
  showToolbar?: boolean;
  status?: WorkflowExecutionStatus;
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
    status = "idle",
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
            styles.node,
            styles[status],
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
          {status !== "idle" && (
            <output
              aria-label={`Workflow execution ${status}`}
              className={cn(
                styles.statusIndicator,
                styles[`${status}Indicator`],
              )}
            >
              {status === "running" && (
                <LoaderCircleIcon className={cn("size-4", styles.spinner)} />
              )}
              {status === "success" && <CircleCheckIcon className="size-4" />}
              {status === "error" && <CircleXIcon className="size-4" />}
            </output>
          )}
          <BaseHandle id="main" type="source" position={Position.Right} />
        </BaseNode>
      </WorkflowNode>
    );
  },
);

BaseTriggerNode.displayName = "BaseTriggerNode";
