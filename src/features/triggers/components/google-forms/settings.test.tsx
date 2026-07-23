import "@/test/setup-dom";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createTRPCClient, type Operation, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { ReactFlowProvider } from "@xyflow/react";
import { TRPCProvider } from "@/trpc/client";
import type { AppRouter } from "@/trpc/routers/_app";
import {
  GoogleFormsTriggerSettings,
  googleFormsScriptUrlStorageKey,
} from "./settings";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const publicConfiguration = (webhookUrl: string) => ({
  webhookId: "public-1",
  webhookUrl,
  enabled: true,
  createdAt: new Date("2026-07-23T12:00:00.000Z"),
  updatedAt: new Date("2026-07-23T12:00:00.000Z"),
  lastReceivedAt: null,
});

const createClient = (operations: Operation[], initialWebhookUrl?: string) => {
  const link: TRPCLink<AppRouter> =
    () =>
    ({ op }) =>
      observable((observer) => {
        operations.push(op);
        const data = (() => {
          if (op.path === "googleFormsWebhooks.ensure") {
            return {
              ...publicConfiguration(
                "https://nexflow.example/api/webhooks/google-forms/public-1",
              ),
              secret: "one-time-secret",
            };
          }

          if (op.path === "googleFormsWebhooks.get" && initialWebhookUrl) {
            return publicConfiguration(initialWebhookUrl);
          }

          return null;
        })();

        observer.next({ result: { data } });
        observer.complete();
        return () => undefined;
      });

  return createTRPCClient<AppRouter>({ links: [link] });
};

const renderSettings = ({
  workflowId,
  onSaveData,
  initialWebhookUrl,
}: {
  workflowId?: string;
  onSaveData?: (data: Record<string, unknown>) => void;
  initialWebhookUrl?: string;
}) => {
  const operations: Operation[] = [];
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
      mutations: { retry: false, gcTime: Number.POSITIVE_INFINITY },
    },
  });
  const trpcClient = createClient(operations, initialWebhookUrl);

  try {
    render(
      <QueryClientProvider client={queryClient}>
        <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
          <ReactFlowProvider>
            <GoogleFormsTriggerSettings
              workflowId={workflowId}
              nodeId="trigger-1"
              data={{ variableName: "googleForm" }}
              open
              onOpenChange={() => undefined}
              onSaveData={onSaveData}
            />
          </ReactFlowProvider>
        </TRPCProvider>
      </QueryClientProvider>,
    );
  } catch (error) {
    if (error instanceof AggregateError && error.errors[0]) {
      throw error.errors[0];
    }
    throw error;
  }

  return operations;
};

describe("Google Forms trigger settings", () => {
  it("opens and saves the variable and form metadata", () => {
    let saved: Record<string, unknown> | undefined;
    renderSettings({
      onSaveData: (data) => {
        saved = data;
      },
    });

    assert.ok(screen.getByRole("heading", { name: "Google Forms Trigger" }));
    fireEvent.change(screen.getByLabelText("Variable Name"), {
      target: { value: "formResponse" },
    });
    fireEvent.change(screen.getByLabelText("Form Name"), {
      target: { value: "Customer Feedback" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    assert.deepEqual(saved, {
      variableName: "formResponse",
      formName: "Customer Feedback",
      expectedFormId: "",
    });
  });

  it("generates a webhook and exposes the secret only in the immediate response", async () => {
    const operations = renderSettings({ workflowId: "workflow-1" });

    fireEvent.click(screen.getByRole("button", { name: "Generate Webhook" }));

    await waitFor(() =>
      assert.equal(
        (screen.getByLabelText("Webhook URL") as HTMLInputElement).value,
        "https://nexflow.example/api/webhooks/google-forms/public-1",
      ),
    );
    assert.equal(
      (screen.getByLabelText("Webhook Secret") as HTMLInputElement).value,
      "one-time-secret",
    );
    assert.match(
      screen.getByText(/const WEBHOOK_SECRET/).textContent ?? "",
      /one-time-secret/,
    );
    assert.ok(
      operations.some(
        (operation) => operation.path === "googleFormsWebhooks.ensure",
      ),
    );
  });

  it("warns when the current webhook URL uses localhost", async () => {
    renderSettings({
      workflowId: "workflow-1",
      initialWebhookUrl:
        "http://localhost:3000/api/webhooks/google-forms/public-1",
    });

    assert.ok(
      await screen.findByText(
        /This localhost webhook cannot receive Google Forms submissions/,
      ),
    );
    assert.ok(screen.getByText(/Do not regenerate the secret/));
  });

  it("warns when the public URL changed since the script was copied", async () => {
    window.localStorage.setItem(
      googleFormsScriptUrlStorageKey("public-1"),
      "http://localhost:3000/api/webhooks/google-forms/public-1",
    );

    renderSettings({
      workflowId: "workflow-1",
      initialWebhookUrl:
        "https://fresh-tunnel.trycloudflare.com/api/webhooks/google-forms/public-1",
    });

    assert.ok(
      await screen.findByText(
        /The public URL changed since this browser last copied the Apps Script/,
      ),
    );
    assert.ok(screen.getByText(/http:\/\/localhost:3000\/api\/webhooks/));
    assert.ok(
      screen.getByText(/The webhook secret does not need to be regenerated/),
    );
  });

  it("identifies Cloudflare Quick Tunnel URLs as temporary", async () => {
    renderSettings({
      workflowId: "workflow-1",
      initialWebhookUrl:
        "https://fresh-tunnel.trycloudflare.com/api/webhooks/google-forms/public-1",
    });

    assert.ok(
      await screen.findByText(/Cloudflare Quick Tunnel URLs are temporary/),
    );
    assert.ok(screen.getByText(/npm run dev:all/));
  });

  it("remembers the runtime URL after copying the script", async () => {
    const webhookUrl =
      "https://fresh-tunnel.trycloudflare.com/api/webhooks/google-forms/public-1";
    renderSettings({
      workflowId: "workflow-1",
      initialWebhookUrl: webhookUrl,
    });

    await waitFor(() =>
      assert.equal(
        (screen.getByLabelText("Webhook URL") as HTMLInputElement).value,
        webhookUrl,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy Script" }));

    await waitFor(() =>
      assert.equal(
        window.localStorage.getItem(googleFormsScriptUrlStorageKey("public-1")),
        webhookUrl,
      ),
    );
  });
});
