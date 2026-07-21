"use client";

import { NodeToolbar, Position } from "@xyflow/react";
import { SettingsIcon, TrashIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog";
import { Button } from "./ui/button";

interface WorkflowNodeProps {
  children: ReactNode;
  showToolbar: boolean;
  onDelete?: () => void;
  onSettings?: () => void;
  name?: string;
  description?: string;
}

export function WorkflowNode({
  children,
  showToolbar = true,
  onDelete,
  onSettings,
  name,
  description,
}: WorkflowNodeProps) {
  return (
    <>
      {showToolbar && (
        <NodeToolbar>
          {onSettings && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onSettings}
              aria-label="Configure node"
            >
              <SettingsIcon className="size-4" />
            </Button>
          )}
          {onDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" aria-label="Delete node">
                  <TrashIcon className="size-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this node?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will also remove every connection to and from this
                    node.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={onDelete}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </NodeToolbar>
      )}
      {children}
      {name && (
        <NodeToolbar
          position={Position.Bottom}
          isVisible
          className="max-w-[200px] text-center"
        >
          <p className=" font-medium">{name}</p>
          {description && (
            <p className=" text-muted-foreground truncate text-sm">
              {description}
            </p>
          )}
        </NodeToolbar>
      )}
    </>
  );
}
