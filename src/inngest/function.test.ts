import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InngestTestEngine } from "@inngest/test";
import { NodeType } from "@/generated/prisma";
import { createFailedNodeStatusEvent, executeWorkflow } from "./function";

const timestamp = "2026-07-22T10:00:00.000Z";
const workflow = {
  id: "workflow-1",
  userId: "user-1",
  name: "Workflow",
  createdAt: timestamp,
  updatedAt: timestamp,
  nodes: [
    {
      id: "trigger",
      workflowId: "workflow-1",
      name: "Manual Trigger",
      type: NodeType.MANUAL_TRIGGER,
      position: {},
      data: {},
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: "http-1",
      workflowId: "workflow-1",
      name: "HTTP Request",
      type: NodeType.HTTP_REQUIST,
      position: {},
      data: { method: "GET", endpoint: "https://example.com" },
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
  connections: [
    {
      id: "edge-1",
      workflowId: "workflow-1",
      fromNodeId: "trigger",
      toNodeId: "http-1",
      fromOutput: "main",
      toInput: "main",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
};

const step = (id: string, value: unknown) => ({
  id,
  handler: () => value,
});

describe("executeWorkflow Inngest trace", () => {
  it("uses separate deterministic trigger and HTTP execution steps", async () => {
    const engine = new InngestTestEngine({
      function: executeWorkflow,
      events: [
        {
          name: "workflow/execution.requested",
          data: {
            executionId: "execution-1",
            workflowId: "workflow-1",
            userId: "user-1",
            triggerNodeId: "trigger",
          },
        },
      ],
      steps: [
        step("claim-execution", {
          claimed: true,
          status: "RUNNING",
          timestamp,
        }),
        step("publish:workflow:running", {}),
        step("prepare-workflow", workflow),
        step("validate-workflow-graph", {
          triggerNodeId: "trigger",
          orderedNodeIds: ["trigger", "http-1"],
        }),
        step("persist:nodes:pending", [
          { nodeId: "trigger", updatedAt: timestamp },
          { nodeId: "http-1", updatedAt: timestamp },
        ]),
        step("publish:pending:trigger", {}),
        step("publish:pending:http-1", {}),
        step("persist:running:trigger", { updatedAt: timestamp }),
        step("publish:running:trigger", {}),
        step("execute:manual-trigger:trigger", {
          triggerNodeId: "trigger",
          status: "triggered",
        }),
        step("persist:success:trigger", { updatedAt: timestamp }),
        step("publish:success:trigger", {}),
        step("persist:running:http-1", { updatedAt: timestamp }),
        step("publish:running:http-1", {}),
        step("execute:http-request:http-1", {
          status: 200,
          statusCode: 200,
          statusText: "OK",
          headers: {},
          contentType: "application/json",
          body: null,
          data: { ok: true },
        }),
        step("persist:success:http-1", { updatedAt: timestamp }),
        step("publish:success:http-1", {}),
        step("complete-workflow", { timestamp }),
        step("publish:workflow:success", {}),
        step("publish:workflow:completed", {}),
      ],
    });

    const { ctx } = await engine.execute();
    const stepIds = ctx.step.run.mock.calls.map(([id]) =>
      typeof id === "string" ? id : id.id,
    );

    assert.ok(stepIds.includes("execute:manual-trigger:trigger"));
    assert.ok(stepIds.includes("execute:http-request:http-1"));
    assert.ok(stepIds.includes("persist:success:http-1"));
    assert.equal(
      stepIds.filter((id) => id === "execute:http-request:http-1").length,
      1,
    );
  });

  it("runs a Google Forms trigger through the same durable node lifecycle", async () => {
    const googleWorkflow = {
      ...workflow,
      nodes: [
        {
          ...workflow.nodes[0],
          name: "Google Forms Trigger",
          type: NodeType.googleFormsTrigger,
          data: { variableName: "googleForm" },
        },
        workflow.nodes[1],
      ],
    };
    const triggerInput = {
      eventId: "response-1",
      submittedAt: timestamp,
      form: { id: "form-1", title: "Customer Feedback" },
      response: {
        id: "response-1",
        answers: { Email: "ahmad@example.com" },
        answerList: [{ question: "Email", value: "ahmad@example.com" }],
      },
    };
    const engine = new InngestTestEngine({
      function: executeWorkflow,
      events: [
        {
          id: "inngest-event-1",
          name: "google.forms.response.submitted",
          data: {
            ...triggerInput,
            webhookId: "public-1",
            deliveryId: "delivery-1",
            workflowId: "workflow-1",
            triggerNodeId: "trigger",
          },
        },
      ],
      steps: [
        step("prepare-google-forms-execution", {
          executionId: "execution-1",
          workflowId: "workflow-1",
          userId: "user-1",
          triggerNodeId: "trigger",
        }),
        step("claim-execution", {
          claimed: true,
          status: "RUNNING",
          timestamp,
        }),
        step("publish:workflow:running", {}),
        step("prepare-workflow", googleWorkflow),
        step("validate-workflow-graph", {
          triggerNodeId: "trigger",
          orderedNodeIds: ["trigger", "http-1"],
        }),
        step("persist:nodes:pending", [
          { nodeId: "trigger", updatedAt: timestamp },
          { nodeId: "http-1", updatedAt: timestamp },
        ]),
        step("publish:pending:trigger", {}),
        step("publish:pending:http-1", {}),
        step("persist:running:trigger", { updatedAt: timestamp }),
        step("publish:running:trigger", {}),
        step("execute:google-forms-trigger:trigger", { data: triggerInput }),
        step("persist:success:trigger", { updatedAt: timestamp }),
        step("publish:success:trigger", {}),
        step("persist:running:http-1", { updatedAt: timestamp }),
        step("publish:running:http-1", {}),
        step("execute:http-request:http-1", {
          status: 200,
          statusCode: 200,
          statusText: "OK",
          headers: {},
          contentType: "application/json",
          body: null,
          data: { ok: true },
        }),
        step("persist:success:http-1", { updatedAt: timestamp }),
        step("publish:success:http-1", {}),
        step("complete-workflow", { timestamp }),
        step("complete-google-forms-delivery", {}),
        step("publish:workflow:success", {}),
        step("publish:workflow:completed", {}),
      ],
    });

    const { ctx } = await engine.execute();
    const stepIds = ctx.step.run.mock.calls.map(([id]) =>
      typeof id === "string" ? id : id.id,
    );

    assert.ok(stepIds.includes("prepare-google-forms-execution"));
    assert.ok(stepIds.includes("execute:google-forms-trigger:trigger"));
    assert.ok(stepIds.includes("execute:http-request:http-1"));
    assert.ok(stepIds.includes("complete-google-forms-delivery"));
    assert.ok(
      stepIds.indexOf("persist:running:trigger") <
        stepIds.indexOf("persist:success:trigger"),
    );
    assert.ok(
      stepIds.indexOf("persist:success:trigger") <
        stepIds.indexOf("persist:running:http-1"),
    );
  });

  it("creates a sanitized failed realtime event for the Google trigger", () => {
    const failed = createFailedNodeStatusEvent({
      executionId: "execution-failed",
      workflowId: "workflow-1",
      node: {
        id: "trigger",
        name: "Google Forms Trigger",
        type: NodeType.googleFormsTrigger,
      },
      error: new Error("Google Forms trigger execution failed."),
      message: "Google Forms trigger execution failed.",
      timestamp,
    });

    assert.equal(failed.status, "FAILED");
    assert.equal(failed.nodeType, "googleFormsTrigger");
    assert.equal(failed.error?.code, "GOOGLE_FORMS_TRIGGER_EXECUTION_FAILED");
    assert.equal(JSON.stringify(failed).includes("secret"), false);
  });
});
