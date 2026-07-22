import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  nodeStatusEventSchema,
  sanitizeRealtimeOutput,
  workflowExecutionChannel,
  workflowExecutionTopics,
} from "./realtime";

describe("workflow execution realtime channel", () => {
  it("scopes a channel to one execution", () => {
    assert.equal(
      workflowExecutionChannel({ executionId: "execution-1" }).name,
      "workflow-execution:execution-1",
    );
  });

  it("exposes only the workflow execution topics", () => {
    assert.deepEqual(workflowExecutionTopics, [
      "execution.status",
      "node.status",
      "execution.error",
      "execution.completed",
    ]);
  });

  it("validates typed node lifecycle events", () => {
    const event = nodeStatusEventSchema.parse({
      executionId: "execution-1",
      workflowId: "workflow-1",
      nodeId: "http-1",
      nodeType: "HTTP_REQUIST",
      status: "SUCCESS",
      output: { status: 200 },
      timestamp: "2026-07-22T10:00:00.000Z",
      sequence: 3,
    });

    assert.equal(event.nodeId, "http-1");
    assert.equal(event.status, "SUCCESS");
  });

  it("accepts Google Forms trigger lifecycle events without secrets", () => {
    const event = nodeStatusEventSchema.parse({
      executionId: "execution-1",
      workflowId: "workflow-1",
      nodeId: "google-trigger",
      nodeType: "googleFormsTrigger",
      status: "RUNNING",
      timestamp: "2026-07-23T12:00:00.000Z",
      sequence: 2,
    });

    assert.equal(event.nodeType, "googleFormsTrigger");
    assert.equal(JSON.stringify(event).includes("webhookSecret"), false);
  });

  it("removes sensitive response headers from realtime output", () => {
    assert.deepEqual(
      sanitizeRealtimeOutput({
        status: 200,
        headers: {
          "content-type": "application/json",
          "set-cookie": "session=secret",
          authorization: "Bearer secret",
        },
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  });
});
