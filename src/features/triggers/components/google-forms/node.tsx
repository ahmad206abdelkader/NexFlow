"use client";

import type { Node, NodeProps } from "@xyflow/react";
import { useAtomValue } from "jotai";
import { useParams } from "next/navigation";
import { memo, useCallback, useState } from "react";
import { workflowExecutionAtom } from "@/features/editor/stores/atoms";
import { BaseTriggerNode } from "../base-trigger-node";
import { GoogleFormsTriggerSettings } from "./settings";
import type { GoogleFormsTriggerNodeData } from "./types";

type GoogleFormsTriggerNodeType = Node<GoogleFormsTriggerNodeData>;

export const GoogleFormsTriggerNode = memo(
  (props: NodeProps<GoogleFormsTriggerNodeType>) => {
    const workflowId = useParams<{ workflowId: string }>()?.workflowId;
    const execution = useAtomValue(workflowExecutionAtom);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const nodeExecution =
      execution.workflowId === workflowId
        ? execution.nodeStates[props.id]
        : undefined;
    const handleOpenSettings = useCallback(() => setSettingsOpen(true), []);
    const formName = props.data.formName?.trim();

    return (
      <>
        <BaseTriggerNode
          {...props}
          icon="/logos/google-forms.svg"
          name="Google Forms Trigger"
          description={formName || "Waiting for a form response"}
          status={nodeExecution?.status ?? "IDLE"}
          error={nodeExecution?.error?.message}
          onSettings={handleOpenSettings}
          onDoubleClick={handleOpenSettings}
        />
        <GoogleFormsTriggerSettings
          workflowId={workflowId}
          nodeId={props.id}
          data={props.data}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          executionError={nodeExecution?.error?.message}
        />
      </>
    );
  },
);

GoogleFormsTriggerNode.displayName = "GoogleFormsTriggerNode";
