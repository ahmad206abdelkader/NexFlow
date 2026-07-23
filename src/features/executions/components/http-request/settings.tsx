"use client";

import { useReactFlow } from "@xyflow/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { KeyValueEditor } from "./key-value-editor";
import {
  HTTP_METHODS,
  type HttpMethod,
  type HttpRequestNodeData,
  type KeyValueEntry,
} from "./types";

export type { HttpRequestNodeData } from "./types";

interface HttpRequestSettingsProps {
  nodeId: string;
  data: HttpRequestNodeData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  executionError?: string | null;
}

const VARIABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const TEMPLATE_EXPRESSION_PATTERN = /\{\{[^{}]+\}\}/g;

const getValidationError = (draft: HttpRequestNodeData) => {
  const variableName = draft.variableName?.trim() ?? "";
  if (!variableName) {
    return "Variable Name is required.";
  }

  if (!VARIABLE_NAME_PATTERN.test(variableName)) {
    return "Variable Name must start with a letter or underscore and contain only letters, numbers, and underscores.";
  }

  if (!HTTP_METHODS.includes(draft.method ?? "GET")) {
    return "Select a supported HTTP Method.";
  }

  const endpoint = draft.endpoint?.trim() ?? "";
  if (!endpoint) {
    return "Endpoint URL is required.";
  }

  try {
    const validationUrl = new URL(
      endpoint.replace(TEMPLATE_EXPRESSION_PATTERN, "template-value"),
    );

    if (!["http:", "https:"].includes(validationUrl.protocol)) {
      return "Endpoint URL must use HTTP or HTTPS.";
    }
  } catch {
    return "Enter a valid Endpoint URL. Workflow variables such as {{variable}} are supported.";
  }

  return null;
};

const normalizeEntries = (
  value: unknown,
  fieldName: string,
): KeyValueEntry[] => {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => {
      if (typeof entry !== "object" || entry === null) {
        return [];
      }

      const candidate = entry as Record<string, unknown>;
      if (
        typeof candidate.key !== "string" ||
        typeof candidate.value !== "string"
      ) {
        return [];
      }

      return [
        {
          id:
            typeof candidate.id === "string"
              ? candidate.id
              : `${fieldName}-${index}`,
          key: candidate.key,
          value: candidate.value,
        },
      ];
    });
  }

  if (typeof value === "object" && value !== null) {
    return Object.entries(value).map(([key, entryValue], index) => ({
      id: `${fieldName}-${index}`,
      key,
      value: String(entryValue),
    }));
  }

  return [];
};

const DEPRECATED_BODY_FIELDS = new Set([
  "bodyType",
  "contentType",
  "bodyFields",
  "rawBody",
  "jsonBody",
]);

const getExistingJsonBody = (data: HttpRequestNodeData) => {
  if (typeof data.body === "string") {
    return data.body;
  }

  if (typeof data.jsonBody === "string") {
    return data.jsonBody;
  }

  return data.jsonBody === undefined ? "" : JSON.stringify(data.jsonBody);
};

const createDraft = (data: HttpRequestNodeData): HttpRequestNodeData => {
  const retainedData = Object.fromEntries(
    Object.entries(data).filter(
      ([field]) => !DEPRECATED_BODY_FIELDS.has(field),
    ),
  );

  return {
    ...retainedData,
    variableName: data.variableName ?? "",
    method: data.method ?? "GET",
    endpoint: data.endpoint ?? "",
    headers: normalizeEntries(data.headers, "header"),
    body: getExistingJsonBody(data),
  };
};

const FieldHelper = ({ children }: { children: React.ReactNode }) => (
  <p className="text-xs leading-5 text-muted-foreground">{children}</p>
);

export const HttpRequestSettings = ({
  nodeId,
  data,
  open,
  onOpenChange,
  executionError,
}: HttpRequestSettingsProps) => {
  const { updateNodeData } = useReactFlow();
  const [draft, setDraft] = useState<HttpRequestNodeData>(() =>
    createDraft(data),
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(createDraft(data));
      setValidationError(null);
    }
  }, [data, open]);

  const method = draft.method ?? "GET";
  const hasBody = method !== "GET";
  const variableExample = draft.variableName?.trim() || "myApiCall";

  const updateDraft = (updates: Partial<HttpRequestNodeData>) => {
    setValidationError(null);
    setDraft((current) => ({ ...current, ...updates }));
  };

  const handleSave = () => {
    const error = getValidationError(draft);
    if (error) {
      setValidationError(error);
      return;
    }

    updateNodeData(
      nodeId,
      {
        ...draft,
        variableName: draft.variableName?.trim(),
        method,
        endpoint: draft.endpoint?.trim(),
      },
      { replace: true },
    );
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b px-6 py-5 text-center">
          <SheetTitle className="text-lg">HTTP Request</SheetTitle>
          <SheetDescription className="mx-auto max-w-72 leading-5">
            Configure settings for the HTTP Request node.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
          {executionError && (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {executionError}
            </div>
          )}
          {validationError && (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {validationError}
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${nodeId}-variable-name`}>Variable Name</Label>
            <Input
              id={`${nodeId}-variable-name`}
              value={draft.variableName ?? ""}
              placeholder="myApiCall"
              onChange={(event) =>
                updateDraft({ variableName: event.target.value })
              }
            />
            <FieldHelper>
              Use this name to reference the result in later nodes:{" "}
              <span className="font-mono">{`{{${variableExample}.data}}`}</span>
            </FieldHelper>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${nodeId}-method`}>HTTP Method</Label>
            <Select
              value={method}
              onValueChange={(value) =>
                updateDraft({ method: value as HttpMethod })
              }
            >
              <SelectTrigger id={`${nodeId}-method`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HTTP_METHODS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldHelper>The HTTP method used for this request.</FieldHelper>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${nodeId}-endpoint`}>Endpoint URL</Label>
            <Input
              id={`${nodeId}-endpoint`}
              type="url"
              value={draft.endpoint ?? ""}
              placeholder="https://api.example.com"
              onChange={(event) =>
                updateDraft({ endpoint: event.target.value })
              }
            />
            <FieldHelper>
              Include query parameters directly in the URL, or use workflow
              variables such as{" "}
              <span className="font-mono">{"{{variable}}"}</span>.
            </FieldHelper>
          </div>

          <KeyValueEditor
            label="Headers"
            entries={draft.headers ?? []}
            onChange={(headers) => updateDraft({ headers })}
            helperText="Add custom headers, including Authorization when needed."
          />

          {hasBody && (
            <div className="flex flex-col gap-2 border-t pt-5">
              <Label htmlFor={`${nodeId}-body`}>Body</Label>
              <Textarea
                id={`${nodeId}-body`}
                value={draft.body ?? ""}
                placeholder='{"message":"Hello"}'
                className="min-h-32 resize-y font-mono"
                onChange={(event) => updateDraft({ body: event.target.value })}
              />
              <FieldHelper>
                Enter valid JSON. It is validated before execution.
              </FieldHelper>
            </div>
          )}
        </div>

        <SheetFooter className="border-t bg-background px-6 py-4">
          <Button type="button" className="w-full" onClick={handleSave}>
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
