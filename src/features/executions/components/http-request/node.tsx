"use client";

import type { Node, NodeProps } from "@xyflow/react";
import { useAtomValue } from "jotai";
import { GlobeIcon } from "lucide-react";
import { memo, useCallback, useState } from "react";
import { workflowExecutionAtom } from "@/features/editor/stores/atoms";
import { BaseExecutionNode } from "../base-execution-node";
import { HttpRequestSettings } from "./settings";
import type { HttpRequestNodeData } from "./types";

type HttpRequestNodeType = Node<HttpRequestNodeData>;

export const HttpRequestNode = memo((props: NodeProps<HttpRequestNodeType>) => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const execution = useAtomValue(workflowExecutionAtom);
  const nodeExecution = execution.nodeStates[props.id];
  const nodeData = props.data as HttpRequestNodeData;
  const description = nodeData?.endpoint
    ? `${nodeData.method || "GET"}: ${nodeData.endpoint}`
    : "Not configured";
  const handleOpenSettings = useCallback(() => setSettingsOpen(true), []);

  return (
    <>
      <BaseExecutionNode
        {...props}
        id={props.id}
        icon={GlobeIcon}
        name="HTTP Request"
        description={description}
        status={nodeExecution?.status ?? "IDLE"}
        error={nodeExecution?.error?.message}
        onSettings={handleOpenSettings}
        onDoubleClick={handleOpenSettings}
      />
      <HttpRequestSettings
        nodeId={props.id}
        data={nodeData}
        open={settingsOpen}
        executionError={nodeExecution?.error?.message}
        onOpenChange={setSettingsOpen}
      />
    </>
  );
});

HttpRequestNode.displayName = "HttpRequestNode";
