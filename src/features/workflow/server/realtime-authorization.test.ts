import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { authorizeRealtimeExecution } from "./realtime-authorization";

describe("realtime execution authorization", () => {
  it("authorizes the owner of an execution", async () => {
    const execution = await authorizeRealtimeExecution(
      { executionId: "execution-1", userId: "user-1" },
      async (input) => ({ id: input.executionId, userId: input.userId }),
    );

    assert.equal(execution.id, "execution-1");
  });

  it("does not authorize another user's execution", async () => {
    await assert.rejects(
      authorizeRealtimeExecution(
        { executionId: "execution-1", userId: "user-2" },
        async () => null,
      ),
      /Workflow execution was not found/,
    );
  });
});
