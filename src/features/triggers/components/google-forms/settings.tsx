"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useReactFlow } from "@xyflow/react";
import { CheckIcon, ClipboardIcon, RefreshCwIcon } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
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
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  generateGoogleFormsAppsScript,
  LOST_GOOGLE_FORMS_WEBHOOK_SECRET,
} from "@/features/triggers/google-forms/apps-script";
import { googleFormsTriggerNodeDataSchema } from "@/features/triggers/google-forms/schema";
import { useTRPC } from "@/trpc/client";
import type { GoogleFormsTriggerNodeData } from "./types";

type PublicConfiguration = {
  webhookId: string;
  webhookUrl: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastReceivedAt: Date | null;
};

const setupSteps = [
  "Create or open a Google Form.",
  "Open the three-dot menu.",
  "Open Apps Script.",
  "Replace the default script with the generated script.",
  "Save the project.",
  "Open Triggers in Apps Script.",
  "Add a new trigger.",
  "Select function: onFormSubmit.",
  "Event source: From form.",
  "Event type: On form submit.",
  "Authorize the required permissions.",
  "Submit a test response through the Google Form.",
  "Return to the workflow and confirm the trigger execution.",
];

const FieldHelper = ({ children }: { children: ReactNode }) => (
  <p className="text-xs leading-5 text-muted-foreground">{children}</p>
);

const CopyButton = ({ value, label }: { value: string; label: string }) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied`);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      toast.error(`Could not copy ${label.toLowerCase()}`);
    }
  };

  return (
    <Button type="button" variant="outline" size="sm" onClick={copy}>
      {copied ? (
        <CheckIcon className="size-4" />
      ) : (
        <ClipboardIcon className="size-4" />
      )}
      {copied ? "Copied" : `Copy ${label}`}
    </Button>
  );
};

interface GoogleFormsTriggerSettingsProps {
  workflowId?: string;
  nodeId: string;
  data: GoogleFormsTriggerNodeData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  executionError?: string | null;
  onSaveData?: (data: GoogleFormsTriggerNodeData) => void;
}

export const GoogleFormsTriggerSettings = ({
  workflowId,
  nodeId,
  data,
  open,
  onOpenChange,
  executionError,
  onSaveData,
}: GoogleFormsTriggerSettingsProps) => {
  const { updateNodeData } = useReactFlow();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<GoogleFormsTriggerNodeData>(data);
  const [configuration, setConfiguration] =
    useState<PublicConfiguration | null>(null);
  const [oneTimeSecret, setOneTimeSecret] = useState<string | null>(null);
  const identity = { workflowId: workflowId ?? "", triggerNodeId: nodeId };
  const configurationQuery = useQuery({
    ...trpc.googleFormsWebhooks.get.queryOptions(identity),
    enabled: open && Boolean(workflowId),
    retry: false,
  });

  useEffect(() => {
    if (!open) {
      setOneTimeSecret(null);
      return;
    }

    setDraft({
      variableName: data.variableName || "googleForm",
      formName: data.formName ?? "",
      expectedFormId: data.expectedFormId ?? "",
    });
    setOneTimeSecret(null);
  }, [data, open]);

  useEffect(() => {
    if (configurationQuery.data !== undefined) {
      setConfiguration(configurationQuery.data);
    }
  }, [configurationQuery.data]);

  const ensureWebhook = useMutation(
    trpc.googleFormsWebhooks.ensure.mutationOptions({
      onSuccess: (result) => {
        const { secret, ...publicConfiguration } = result;
        setConfiguration(publicConfiguration);
        setOneTimeSecret(secret);
        queryClient.setQueryData(
          trpc.googleFormsWebhooks.get.queryKey(identity),
          publicConfiguration,
        );
        toast.success(
          result.secret ? "Webhook generated" : "Webhook already exists",
        );
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const regenerateSecret = useMutation(
    trpc.googleFormsWebhooks.regenerateSecret.mutationOptions({
      onSuccess: (result) => {
        const { secret, ...publicConfiguration } = result;
        setConfiguration(publicConfiguration);
        setOneTimeSecret(secret);
        queryClient.setQueryData(
          trpc.googleFormsWebhooks.get.queryKey(identity),
          publicConfiguration,
        );
        toast.success("Webhook secret regenerated");
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const variableExample = draft.variableName?.trim() || "googleForm";
  const script = useMemo(
    () =>
      configuration
        ? generateGoogleFormsAppsScript({
            webhookUrl: configuration.webhookUrl,
            webhookSecret: oneTimeSecret,
          })
        : "Generate the webhook after saving this node to create the Apps Script.",
    [configuration, oneTimeSecret],
  );

  const handleSave = () => {
    const parsed = googleFormsTriggerNodeDataSchema.safeParse(draft);
    if (!parsed.success) {
      toast.error(
        parsed.error.issues[0]?.message ?? "Invalid trigger settings",
      );
      return;
    }

    if (onSaveData) {
      onSaveData(parsed.data);
    } else {
      updateNodeData(nodeId, parsed.data, { replace: true });
    }
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-xl">
        <SheetHeader className="border-b px-6 py-5 text-center">
          <SheetTitle>Google Forms Trigger</SheetTitle>
          <SheetDescription>
            Start this workflow when Google Forms sends a new response.
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

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${nodeId}-variable-name`}>Variable Name</Label>
            <Input
              id={`${nodeId}-variable-name`}
              value={draft.variableName ?? ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  variableName: event.target.value,
                }))
              }
            />
            <FieldHelper>
              Use this name to reference the submitted form response in later
              nodes:{" "}
              <span className="font-mono">{`{{${variableExample}.data}}`}</span>
            </FieldHelper>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${nodeId}-form-name`}>Form Name</Label>
              <Input
                id={`${nodeId}-form-name`}
                value={draft.formName ?? ""}
                placeholder="Customer Feedback"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    formName: event.target.value,
                  }))
                }
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${nodeId}-form-id`}>Expected Form ID</Label>
              <Input
                id={`${nodeId}-form-id`}
                value={draft.expectedFormId ?? ""}
                placeholder="Optional"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    expectedFormId: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          <section className="flex flex-col gap-3 border-t pt-5">
            <div>
              <h3 className="font-medium">Webhook</h3>
              <FieldHelper>
                Save the workflow before generating a webhook for a newly added
                node.
              </FieldHelper>
            </div>

            {!configuration ? (
              <Button
                type="button"
                variant="outline"
                disabled={!workflowId || ensureWebhook.isPending}
                onClick={() => ensureWebhook.mutate(identity)}
              >
                Generate Webhook
              </Button>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`${nodeId}-webhook-url`}>Webhook URL</Label>
                  <Input
                    id={`${nodeId}-webhook-url`}
                    value={configuration.webhookUrl}
                    readOnly
                  />
                  <CopyButton value={configuration.webhookUrl} label="URL" />
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor={`${nodeId}-webhook-secret`}>
                    Webhook Secret
                  </Label>
                  {oneTimeSecret ? (
                    <>
                      <Input
                        id={`${nodeId}-webhook-secret`}
                        value={oneTimeSecret}
                        readOnly
                      />
                      <p
                        role="alert"
                        className="text-xs text-amber-700 dark:text-amber-300"
                      >
                        Copy this secret now. It will not be shown again.
                      </p>
                      <CopyButton value={oneTimeSecret} label="Secret" />
                    </>
                  ) : (
                    <FieldHelper>
                      The secret is hidden. Regenerate it if it has been lost.
                    </FieldHelper>
                  )}
                </div>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="outline">
                      <RefreshCwIcon className="size-4" />
                      Regenerate webhook secret
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Regenerate webhook secret?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This immediately invalidates the previous Apps Script
                        configuration. You must copy the new script into Google
                        Apps Script.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => regenerateSecret.mutate(identity)}
                      >
                        Regenerate
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </section>

          <section className="flex flex-col gap-3 border-t pt-5">
            <div>
              <h3 className="font-medium">Google Apps Script</h3>
              {!oneTimeSecret && configuration && (
                <FieldHelper>
                  The script contains {LOST_GOOGLE_FORMS_WEBHOOK_SECRET}.
                  Regenerate the secret to receive a ready-to-copy script.
                </FieldHelper>
              )}
            </div>
            <pre className="max-h-96 overflow-auto rounded-md bg-muted p-4 text-xs whitespace-pre-wrap">
              <code>{script}</code>
            </pre>
            <CopyButton value={script} label="Script" />
          </section>

          <section className="flex flex-col gap-3 border-t pt-5">
            <h3 className="font-medium">Setup instructions</h3>
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              {setupSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p
              role="alert"
              className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
            >
              Do not click the Run button directly for onFormSubmit because a
              manual Apps Script run does not provide the form-submit event
              object.
            </p>
          </section>
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
