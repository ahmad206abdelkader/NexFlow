"use client";

import { useReactFlow } from "@xyflow/react";
import { useParams } from "next/navigation";
import { useCallback } from "react";
import { useUpdateWorkflow } from "@/features/workflow/hooks/use-workflows";
import type { NodeType } from "@/generated/prisma";

export const useDeleteNode = (nodeId: string) => {
  const { getEdges, getNodes, setEdges, setNodes } = useReactFlow();
  const workflowId = useParams<{ workflowId: string }>()?.workflowId;
  const updateWorkflow = useUpdateWorkflow();

  return useCallback(() => {
    if (!workflowId) {
      return;
    }

    const previousNodes = getNodes();
    const previousEdges = getEdges();
    const nodes = previousNodes.filter((node) => node.id !== nodeId);
    const edges = previousEdges.filter(
      (edge) => edge.source !== nodeId && edge.target !== nodeId,
    );

    setNodes(nodes);
    setEdges(edges);

    updateWorkflow.mutate(
      {
        id: workflowId,
        nodes: nodes.map((node) => ({
          id: node.id,
          type: node.type as NodeType,
          position: node.position,
          data: node.data,
        })),
        edges,
      },
      {
        onError: () => {
          setNodes(previousNodes);
          setEdges(previousEdges);
        },
      },
    );
  }, [
    getEdges,
    getNodes,
    nodeId,
    setEdges,
    setNodes,
    updateWorkflow,
    workflowId,
  ]);
};
