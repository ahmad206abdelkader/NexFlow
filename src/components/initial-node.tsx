"use client"

import type {NodeProps} from "@xyflow/react";
import { PlusIcon } from "lucide-react";
import { memo, useState } from "react";
import { PlaceholderNode } from "./react-flow/placeholder-node";

export const InitialNode = memo((props: NodeProps) => {
    return (
        <PlaceholderNode
          {...props}
        >
            <div className="flex items-center justify-center w-full h-full">
                <PlusIcon className="size-5 cursor-pointer" />
            </div>
        </PlaceholderNode>
    )
});

InitialNode.displayName = "InitialNode";