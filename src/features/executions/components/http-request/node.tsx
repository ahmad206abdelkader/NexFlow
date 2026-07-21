"use client";

import type { Node, NodeProps } from "@xyflow/react";
import { GlobeIcon } from "lucide-react";
import { memo, useCallback, useState } from "react";
import { BaseExecutionNode } from "../base-execution-node";
import { type HttpRequestNodeData, HttpRequestSettings } from "./settings";

type HttpRequestNodeType = Node<HttpRequestNodeData>;

export const HttpRequestNode = memo((props: NodeProps<HttpRequestNodeType>) => {
  const [settingsOpen, setSettingsOpen] = useState(false);
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
        onSettings={handleOpenSettings}
        onDoubleClick={handleOpenSettings}
      />
      <HttpRequestSettings
        nodeId={props.id}
        data={nodeData}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
    </>
  );
});

HttpRequestNode.displayName = "HttpRequestNode";
