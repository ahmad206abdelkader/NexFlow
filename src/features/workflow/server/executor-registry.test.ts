import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NodeType } from "@/generated/prisma";
import {
  ExecutorRegistry,
  workflowExecutorRegistry,
} from "./executor-registry";

describe("ExecutorRegistry", () => {
  it("registers and resolves an executor by node type", async () => {
    const registry = new ExecutorRegistry().register(
      NodeType.INITIAL,
      async ({ node }) => ({ nodeId: node.id }),
    );
    const result = await registry.resolve(NodeType.INITIAL)({
      node: { id: "initial", type: NodeType.INITIAL, data: {} },
      upstreamResults: [],
      variableDefinitions: [],
    });

    assert.deepEqual(result, { nodeId: "initial" });
  });

  it("rejects duplicate registrations", () => {
    const registry = new ExecutorRegistry().register(
      NodeType.INITIAL,
      async () => ({}),
    );

    assert.throws(
      () => registry.register(NodeType.INITIAL, async () => ({})),
      /Executor for node type INITIAL is already registered\./,
    );
  });

  it("returns a clear error when no executor is registered", () => {
    const registry = new ExecutorRegistry();

    assert.throws(
      () => registry.resolve(NodeType.INITIAL),
      /Workflow node type INITIAL has no registered executor\./,
    );
  });

  it("registers the existing trigger and HTTP Request executors", async () => {
    assert.equal(workflowExecutorRegistry.has(NodeType.MANUAL_TRIGGER), true);
    assert.equal(
      workflowExecutorRegistry.has(NodeType.googleFormsTrigger),
      true,
    );
    assert.equal(workflowExecutorRegistry.has(NodeType.HTTP_REQUIST), true);
    assert.equal(
      typeof workflowExecutorRegistry.resolve(NodeType.HTTP_REQUIST),
      "function",
    );

    const triggerResult = await workflowExecutorRegistry.resolve(
      NodeType.MANUAL_TRIGGER,
    )({
      node: {
        id: "trigger",
        type: NodeType.MANUAL_TRIGGER,
        data: {},
      },
      upstreamResults: [],
      variableDefinitions: [],
    });

    assert.deepEqual(triggerResult, {
      triggerNodeId: "trigger",
      status: "triggered",
    });
  });

  it("normalizes Google Forms trigger input under data", async () => {
    const triggerInput = {
      eventId: "response-1",
      submittedAt: "2026-07-23T12:00:00.000Z",
      form: { id: "form-1", title: "Customer Feedback" },
      response: {
        id: "response-1",
        answers: { Email: "ahmad@example.com" },
        answerList: [{ question: "Email", value: "ahmad@example.com" }],
      },
    };
    const result = await workflowExecutorRegistry.resolve(
      NodeType.googleFormsTrigger,
    )({
      node: {
        id: "google-trigger",
        type: NodeType.googleFormsTrigger,
        data: { variableName: "googleForm" },
      },
      triggerInput,
      upstreamResults: [],
      variableDefinitions: [],
    });

    assert.deepEqual(result, { data: triggerInput });
  });

  it("resolves HTTP endpoint and JSON body templates through the registered executor", async () => {
    const result = await workflowExecutorRegistry.resolve(
      NodeType.HTTP_REQUIST,
    )({
      node: {
        id: "http-node",
        name: "HTTP Request",
        type: NodeType.HTTP_REQUIST,
        data: {
          endpoint: "https://httpbingo.org/anything/{{source.data.path}}",
          method: "POST",
          body: JSON.stringify({
            id: "{{source.data.id}}",
            active: "{{source.data.active}}",
          }),
        },
      },
      executionId: "execution-1",
      upstreamResults: [
        {
          nodeId: "source-node",
          nodeName: "HTTP Request",
          variableName: "source",
          result: {
            data: { path: "templated", id: 15, active: true },
          },
        },
      ],
      variableDefinitions: [
        {
          nodeId: "source-node",
          nodeName: "HTTP Request",
          variableName: "source",
        },
      ],
    });
    const response = result.data as {
      json: unknown;
      url: string;
    };

    assert.match(response.url, /\/anything\/templated$/);
    assert.deepEqual(response.json, { id: 15, active: true });
  });
});
