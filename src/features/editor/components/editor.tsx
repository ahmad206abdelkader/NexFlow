"use client";

import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  type Connection,
  Controls,
  type Edge,
  type EdgeChange,
  MiniMap,
  type Node,
  type NodeChange,
  Panel,
  ReactFlow,
} from "@xyflow/react";
import { useSetAtom } from "jotai";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useState } from "react";

import { ErrorView, LoadingView } from "@/components/entity-components";

import { useSuspenseWorkflow } from "@/features/workflow/hooks/use-workflows";
import { pruneNodeExecutionStates } from "@/features/workflow/lib/reconcile-execution-state";

import "@xyflow/react/dist/style.css";
import { nodeComponents } from "@/config/node-components";
import { editorAtom, workflowExecutionAtom } from "../stores/atoms";
import { AddNodeButton } from "./add-node-button";

export const EditorLoading = () => {
  return <LoadingView message="Loading editor..." />;
};

export const EditorError = () => {
  return <ErrorView message="Error loading editor" />;
};

export const Editor = ({ workflowId }: { workflowId: string }) => {
  const { data: workflow } = useSuspenseWorkflow(workflowId);
  const setEditor = useSetAtom(editorAtom);
  const setExecution = useSetAtom(workflowExecutionAtom);
  const { resolvedTheme } = useTheme();
  const [isMounted, setIsMounted] = useState(false);

  const [nodes, setNodes] = useState<Node[]>(workflow.nodes);
  const [edges, setEdges] = useState<Edge[]>(workflow.edges);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const nodeIds = new Set(nodes.map((node) => node.id));
    setExecution((current) => pruneNodeExecutionStates(current, nodeIds));
  }, [nodes, setExecution]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) =>
      setNodes((nodesSnapshot) => applyNodeChanges(changes, nodesSnapshot)),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) =>
      setEdges((edgesSnapshot) => applyEdgeChanges(changes, edgesSnapshot)),
    [],
  );
  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((edgesSnapshot) => addEdge(params, edgesSnapshot)),
    [],
  );

  return (
    <div style={{ width: "100%", height: "100vh" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={setEditor}
        nodeTypes={nodeComponents}
        colorMode={isMounted && resolvedTheme === "dark" ? "dark" : "light"}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap />
        <Panel position="top-right">
          <AddNodeButton />
        </Panel>
      </ReactFlow>
    </div>
  );
};
