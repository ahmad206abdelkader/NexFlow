"use client";

import { createId } from "@paralleldrive/cuid2";
import { useReactFlow } from "@xyflow/react";
import { GlobeIcon, MousePointerIcon } from "lucide-react";
import Image from "next/image";
import { useCallback } from "react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { NodeType } from "@/generated/prisma";
import { Separator } from "./ui/separator";

export type NodeTypeOption = {
  type: NodeType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }> | string;
};
const triggerNodes: NodeTypeOption[] = [
  {
    type: NodeType.MANUAL_TRIGGER,
    label: "Trigger manually",
    description:
      "Runs the flow on clicking a button. Good for getting starting quickly",
    icon: MousePointerIcon,
  },
];

const executionNodes: NodeTypeOption[] = [
  {
    type: NodeType.HTTP_REQUIST,
    label: "HTTP Request",
    description: "Makes an HTTP request",
    icon: GlobeIcon,
  },
];

interface NodeSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

function NodeOption({
  option,
  onSelect,
}: {
  option: NodeTypeOption;
  onSelect: (option: NodeTypeOption) => void;
}) {
  const Icon = option.icon;

  return (
    <button
      type="button"
      className="h-auto w-full cursor-pointer border-l-2 border-transparent px-4 py-5 text-left hover:border-l-primary"
      onClick={() => onSelect(option)}
    >
      <span className="flex w-full items-center gap-6 overflow-hidden">
        {typeof Icon === "string" ? (
          <Image
            src={Icon}
            alt=""
            aria-hidden="true"
            width={20}
            height={20}
            className="size-5 rounded-sm object-contain"
          />
        ) : (
          <Icon className="size-5" aria-hidden="true" />
        )}
        <span className="flex flex-col items-start">
          <span className="text-sm font-medium">{option.label}</span>
          <span className="text-xs text-muted-foreground">
            {option.description}
          </span>
        </span>
      </span>
    </button>
  );
}

export function NodeSelector({
  open,
  onOpenChange,
  children,
}: NodeSelectorProps) {
  const { setNodes, getNodes, screenToFlowPosition } = useReactFlow();

  const handleNodeSelect = useCallback(
    (selection: NodeTypeOption) => {
      if (selection.type === NodeType.MANUAL_TRIGGER) {
        const nodes = getNodes();
        const hasManualTrigger = nodes.some(
          (node) => node.type === NodeType.MANUAL_TRIGGER,
        );

        if (hasManualTrigger) {
          toast.error("Only one manual trigger is allowed per workflow");
          return;
        }
      }

      setNodes((nodes) => {
        const hasInitialTrigger = nodes.some(
          (node) => node.type === NodeType.INITIAL,
        );

        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;

        const flowPosition = screenToFlowPosition({
          x: centerX + (Math.random() - 0.5) * 200,
          y: centerY + (Math.random() - 0.5) * 200,
        });

        const newNode = {
          id: createId(),
          data: {},
          position: flowPosition,
          type: selection.type,
        };

        if (hasInitialTrigger) {
          return [
            ...nodes.filter((node) => node.type !== NodeType.INITIAL),
            newNode,
          ];
        }

        return [...nodes, newNode];
      });

      onOpenChange(false);
    },
    [setNodes, getNodes, onOpenChange, screenToFlowPosition],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>What triggers this workflow?</SheetTitle>
          <SheetDescription>
            A trigger is a step that starts your workflow.
          </SheetDescription>
        </SheetHeader>
        <div>
          {triggerNodes.map((nodeType) => (
            <NodeOption
              key={nodeType.type}
              option={nodeType}
              onSelect={handleNodeSelect}
            />
          ))}
        </div>
        <Separator />
        <div>
          {executionNodes.map((nodeType) => (
            <NodeOption
              key={nodeType.type}
              option={nodeType}
              onSelect={handleNodeSelect}
            />
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
