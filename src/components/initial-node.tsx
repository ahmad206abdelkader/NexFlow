"use client";

import type { NodeProps } from "@xyflow/react";
import { PlusIcon } from "lucide-react";
import { memo, useState } from "react";
import { NodeSelector } from "./node-selector";
import { PlaceholderNode } from "./react-flow/placeholder-node";
import { WorkflowNode } from "./workflow-node";

export const InitialNode = memo((props: NodeProps) => {
  const [selectorOpen, setSelectorOpen] = useState(false);

  return (
    <WorkflowNode showToolbar={false}>
      <NodeSelector open={selectorOpen} onOpenChange={setSelectorOpen}>
        <PlaceholderNode {...props} onClick={() => setSelectorOpen(true)}>
          <div className="flex items-center justify-center w-full h-full">
            <PlusIcon className="size-5 cursor-pointer" />
          </div>
        </PlaceholderNode>
      </NodeSelector>
    </WorkflowNode>
  );
});

InitialNode.displayName = "InitialNode";
