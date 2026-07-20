"use client";

import { Node, NodeProps } from "@xyflow/react";
import { GlobeIcon } from  "lucide-react";
import { memo} from "react";
import { BaseExecutionNode } from "../base-execution-node"; 

type HttpRequestNodeData = {
    endPoint?: string;
    method?: "GET" | "POST" | "PATCH" | "DELETE" ;
    body?: string;
    [key: string] : unknown;
};


type HttpRerquestNodeType = Node<HttpRequestNodeData>;

export const HttpRequestNode = memo((props: NodeProps<HttpRerquestNodeType>) => {
    const nodeData = props.data as HttpRequestNodeData;
    const desciption = nodeData?.endPoint
      ? `${nodeData.method || "GET"} : ${nodeData.endPoint}`
      : "Not configured";

    return (
        <>
          <BaseExecutionNode 
           {...props}
           id={props.id}
           icon={GlobeIcon}
           name="HTTP Request"
           desciption={desciption}
           onSettings={() => {}}
           onDoubleClick={() => {}} 
          />
        </>
    )
      
});

HttpRequestNode.displayName = "HttpRequestNode" ;