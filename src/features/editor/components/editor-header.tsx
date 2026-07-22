"use client";

import type { ReactFlowInstance } from "@xyflow/react";
import { useAtomValue, useSetAtom } from "jotai";
import { PlayIcon, SaveIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  useExecuteWorkflow,
  useLatestWorkflowExecution,
  useSuspenseWorkflow,
  useUpdateWorkflow,
  useUpdateWorkflowName,
} from "@/features/workflow/hooks/use-workflows";
import { NodeType } from "@/generated/prisma";
import {
  editorAtom,
  type WorkflowExecutionStatus,
  workflowExecutionAtom,
} from "../stores/atoms";

const toWorkflowExecutionUiStatus = (
  status: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED",
): WorkflowExecutionStatus => {
  if (status === "PENDING" || status === "RUNNING") {
    return "running";
  }

  return status === "SUCCESS" ? "success" : "error";
};

const getEditorGraph = (editor: ReactFlowInstance) => {
  const editorNodes = editor.getNodes();
  const edges = editor.getEdges();

  const hasInvalidNodeType = editorNodes.some(
    (node) =>
      !node.type || !Object.values(NodeType).includes(node.type as NodeType),
  );

  if (hasInvalidNodeType) {
    toast.error("The workflow contains an unsupported node type.");
    return null;
  }

  return {
    nodes: editorNodes.map((node) => ({
      id: node.id,
      type: node.type as NodeType,
      position: node.position,
      data: node.data,
    })),
    edges,
  };
};

export const EditorSaveButton = ({ workflowId }: { workflowId: string }) => {
  const editor = useAtomValue(editorAtom);
  const execution = useAtomValue(workflowExecutionAtom);
  const saveWorkflow = useUpdateWorkflow();

  const handleSave = () => {
    if (!editor) {
      return;
    }

    const graph = getEditorGraph(editor);

    if (!graph) {
      return;
    }

    saveWorkflow.mutate({
      id: workflowId,
      ...graph,
    });
  };

  const executionIsRunning =
    execution.workflowId === workflowId && execution.status === "running";

  return (
    <div>
      <Button
        size="sm"
        onClick={handleSave}
        disabled={saveWorkflow.isPending || executionIsRunning}
      >
        <SaveIcon className="size-4" />
        Save
      </Button>
    </div>
  );
};

export const EditorExecuteButton = ({ workflowId }: { workflowId: string }) => {
  const editor = useAtomValue(editorAtom);
  const execution = useAtomValue(workflowExecutionAtom);
  const setExecution = useSetAtom(workflowExecutionAtom);
  const saveWorkflow = useUpdateWorkflow();
  const executeWorkflow = useExecuteWorkflow();
  const latestExecution = useLatestWorkflowExecution(workflowId);
  const inFlightRef = useRef(false);
  const latestExecutionIsActive =
    latestExecution.data?.status === "PENDING" ||
    latestExecution.data?.status === "RUNNING";
  const executionIsActive =
    latestExecutionIsActive ||
    (execution.workflowId === workflowId && execution.status === "running");

  useEffect(() => {
    if (!latestExecution.data) {
      return;
    }

    setExecution({
      workflowId: latestExecution.data.workflowId,
      triggerNodeId: latestExecution.data.triggerNodeId,
      status: toWorkflowExecutionUiStatus(latestExecution.data.status),
    });
  }, [latestExecution.data, setExecution]);

  const handleExecute = useCallback(async () => {
    if (!editor || inFlightRef.current || executionIsActive) {
      return;
    }

    const graph = getEditorGraph(editor);

    if (!graph) {
      return;
    }

    const triggers = graph.nodes.filter(
      (node) => node.type === NodeType.MANUAL_TRIGGER,
    );

    if (triggers.length !== 1) {
      toast.error("Add exactly one manual trigger before executing.");
      return;
    }

    inFlightRef.current = true;

    try {
      await saveWorkflow.mutateAsync({ id: workflowId, ...graph });
      const result = await executeWorkflow.mutateAsync({ id: workflowId });
      setExecution({
        workflowId: result.workflowId,
        triggerNodeId: result.triggerNodeId,
        status: toWorkflowExecutionUiStatus(result.status),
      });
    } catch {
      // The mutation hooks display the save or queueing error.
    } finally {
      inFlightRef.current = false;
    }
  }, [
    editor,
    executeWorkflow,
    executionIsActive,
    saveWorkflow,
    setExecution,
    workflowId,
  ]);

  const isRunning =
    latestExecution.isPending ||
    executionIsActive ||
    saveWorkflow.isPending ||
    executeWorkflow.isPending;

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleExecute}
      disabled={isRunning}
    >
      <PlayIcon className="size-4" />
      Execute workflow
    </Button>
  );
};

export const EditorNameInput = ({ workflowId }: { workflowId: string }) => {
  const { data: workflow } = useSuspenseWorkflow(workflowId);
  const updateWorkflow = useUpdateWorkflowName();

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(workflow.name);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (workflow.name) {
      setName(workflow.name);
    }
  }, [workflow.name]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = async () => {
    if (name === workflow.name) {
      setIsEditing(false);
      return;
    }

    try {
      await updateWorkflow.mutateAsync({
        id: workflowId,
        name,
      });
    } catch {
      setName(workflow.name);
    } finally {
      setIsEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setName(workflow.name);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <Input
        disabled={updateWorkflow.isPending}
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="h-7 w-auto min-w-[10px] px-2"
      />
    );
  }

  return (
    <BreadcrumbItem
      onClick={() => setIsEditing(true)}
      className=" cursor-pointer hover:text-foreground transition-colors"
    >
      {workflow.name}
    </BreadcrumbItem>
  );
};

export const EditorBreadcrumbs = ({ workflowId }: { workflowId: string }) => {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link prefetch href="/workflows">
              Workflows
            </Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <EditorNameInput workflowId={workflowId} />
      </BreadcrumbList>
    </Breadcrumb>
  );
};

export const EditorHeader = ({ workflowId }: { workflowId: string }) => {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 bg-background">
      <SidebarTrigger />
      <div className="flex flex-row items-center justify-between gap-x-4 w-full">
        <EditorBreadcrumbs workflowId={workflowId} />
        <div className="ml-auto flex items-center gap-2">
          <EditorExecuteButton workflowId={workflowId} />
          <EditorSaveButton workflowId={workflowId} />
        </div>
      </div>
    </header>
  );
};
