"use client";

import { useReactFlow } from "@xyflow/react";
import { useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

const HTTP_METHODS = ["GET", "POST", "PATCH", "DELETE"] as const;

type HttpMethod = (typeof HTTP_METHODS)[number];

export type HttpRequestNodeData = {
  endpoint?: string;
  method?: HttpMethod;
  body?: string;
  [key: string]: unknown;
};

interface HttpRequestSettingsProps {
  nodeId: string;
  data: HttpRequestNodeData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const HttpRequestSettings = ({
  nodeId,
  data,
  open,
  onOpenChange,
}: HttpRequestSettingsProps) => {
  const { updateNodeData } = useReactFlow();
  const updateData = useCallback(
    (updates: Partial<HttpRequestNodeData>) => {
      updateNodeData(nodeId, updates);
    },
    [nodeId, updateNodeData],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>HTTP Request</SheetTitle>
          <SheetDescription>
            Configure the request sent by this workflow step.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 px-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${nodeId}-method`}>Method</Label>
            <Select
              value={data.method ?? "GET"}
              onValueChange={(method) =>
                updateData({ method: method as HttpMethod })
              }
            >
              <SelectTrigger id={`${nodeId}-method`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HTTP_METHODS.map((method) => (
                  <SelectItem key={method} value={method}>
                    {method}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${nodeId}-endpoint`}>URL</Label>
            <Input
              id={`${nodeId}-endpoint`}
              value={data.endpoint ?? ""}
              placeholder="https://api.example.com/resource"
              onChange={(event) => updateData({ endpoint: event.target.value })}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${nodeId}-body`}>Body</Label>
            <Textarea
              id={`${nodeId}-body`}
              value={data.body ?? ""}
              placeholder="Optional request body"
              className="min-h-40 font-mono"
              onChange={(event) => updateData({ body: event.target.value })}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
