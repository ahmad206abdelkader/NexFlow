import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WorkflowExecutionState } from "@/features/editor/stores/atoms";
import type { NodeStatusEvent } from "@/inngest/realtime";
import {
  applyNodeStatusEvent,
  beginWorkflowExecution,
  getExecutionPollingInterval,
  reconcilePersistedExecution,
} from "./reconcile-execution-state";

const initialState = (): WorkflowExecutionState => ({
  executionId: "execution-1",
  workflowId: "workflow-1",
  triggerNodeId: "trigger",
  status: "running",
  updatedAt: "2026-07-22T10:00:00.000Z",
  nodeStates: {},
});

const nodeEvent = (
  overrides: Partial<NodeStatusEvent> = {},
): NodeStatusEvent => ({
  executionId: "execution-1",
  workflowId: "workflow-1",
  nodeId: "http-1",
  nodeType: "HTTP_REQUIST",
  status: "RUNNING",
  timestamp: "2026-07-22T10:00:01.000Z",
  sequence: 2,
  ...overrides,
});

describe("workflow execution state reconciliation", () => {
  it("updates only the node matching the realtime nodeId", () => {
    const current = initialState();
    current.nodeStates["http-2"] = {
      status: "PENDING",
      error: null,
      output: null,
      updatedAt: "2026-07-22T10:00:00.000Z",
      sequence: 1,
    };

    const updated = applyNodeStatusEvent(current, nodeEvent());

    assert.equal(updated.nodeStates["http-1"].status, "RUNNING");
    assert.equal(updated.nodeStates["http-2"].status, "PENDING");
  });

  it("ignores events from another execution", () => {
    const current = initialState();
    const updated = applyNodeStatusEvent(
      current,
      nodeEvent({ executionId: "execution-2" }),
    );

    assert.equal(updated, current);
  });

  it("ignores stale transitions such as SUCCESS to RUNNING", () => {
    const current = applyNodeStatusEvent(
      initialState(),
      nodeEvent({
        status: "SUCCESS",
        timestamp: "2026-07-22T10:00:03.000Z",
        sequence: 3,
      }),
    );
    const updated = applyNodeStatusEvent(
      current,
      nodeEvent({
        status: "RUNNING",
        timestamp: "2026-07-22T10:00:04.000Z",
        sequence: 2,
      }),
    );

    assert.equal(updated, current);
  });

  it("does not let an older persisted snapshot overwrite realtime state", () => {
    const current: WorkflowExecutionState = {
      ...initialState(),
      status: "success",
      updatedAt: "2026-07-22T10:00:05.000Z",
    };
    const updated = reconcilePersistedExecution(current, {
      id: "execution-1",
      workflowId: "workflow-1",
      triggerNodeId: "trigger",
      status: "RUNNING",
      updatedAt: "2026-07-22T10:00:04.000Z",
      nodeExecutions: [],
    });

    assert.equal(updated.status, "success");
    assert.equal(updated.updatedAt, "2026-07-22T10:00:05.000Z");
  });

  it("supports trigger and HTTP node transitions independently", () => {
    let state = initialState();
    state = applyNodeStatusEvent(
      state,
      nodeEvent({ nodeId: "trigger", nodeType: "MANUAL_TRIGGER" }),
    );
    state = applyNodeStatusEvent(
      state,
      nodeEvent({
        nodeId: "trigger",
        nodeType: "MANUAL_TRIGGER",
        status: "SUCCESS",
        sequence: 3,
        timestamp: "2026-07-22T10:00:02.000Z",
      }),
    );
    state = applyNodeStatusEvent(
      state,
      nodeEvent({ nodeId: "http-1", status: "PENDING", sequence: 1 }),
    );
    state = applyNodeStatusEvent(state, nodeEvent({ nodeId: "http-1" }));

    assert.equal(state.nodeStates.trigger.status, "SUCCESS");
    assert.equal(state.nodeStates["http-1"].status, "RUNNING");
  });

  it("stores a real failed node error", () => {
    const updated = applyNodeStatusEvent(
      initialState(),
      nodeEvent({
        status: "FAILED",
        sequence: 3,
        error: { code: "HTTP_ERROR", message: "Request returned 500." },
      }),
    );

    assert.equal(updated.nodeStates["http-1"].status, "FAILED");
    assert.equal(updated.nodeStates["http-1"].error?.code, "HTTP_ERROR");
  });

  it("clears old node statuses when a new execution starts", () => {
    const current = initialState();
    current.nodeStates["http-1"] = {
      status: "SUCCESS",
      error: null,
      output: { status: 200 },
      updatedAt: "2026-07-22T10:00:03.000Z",
      sequence: 3,
    };

    const next = beginWorkflowExecution({
      executionId: "execution-2",
      workflowId: "workflow-1",
      triggerNodeId: "trigger",
      status: "PENDING",
    });

    assert.deepEqual(next.nodeStates, {});
  });

  it("restores persisted pending, success, output, and error state", () => {
    const restored = reconcilePersistedExecution(initialState(), {
      id: "execution-2",
      workflowId: "workflow-1",
      triggerNodeId: "trigger",
      status: "RUNNING",
      updatedAt: "2026-07-22T11:00:00.000Z",
      nodeExecutions: [
        {
          nodeId: "trigger",
          status: "SUCCESS",
          result: { status: "triggered" },
          error: null,
          updatedAt: "2026-07-22T11:00:01.000Z",
        },
        {
          nodeId: "http-2",
          status: "PENDING",
          result: null,
          error: null,
          updatedAt: "2026-07-22T11:00:00.000Z",
        },
      ],
    });

    assert.equal(restored.nodeStates.trigger.status, "SUCCESS");
    assert.deepEqual(restored.nodeStates.trigger.output, {
      status: "triggered",
    });
    assert.equal(restored.nodeStates["http-2"].status, "PENDING");
  });

  it("keeps polling as a slower fallback while realtime is healthy", () => {
    assert.equal(getExecutionPollingInterval("RUNNING", false), 1000);
    assert.equal(getExecutionPollingInterval("RUNNING", true), 10_000);
    assert.equal(getExecutionPollingInterval("SUCCESS", false), false);
    assert.equal(getExecutionPollingInterval("SUCCESS", false, true), 5_000);
  });
});
