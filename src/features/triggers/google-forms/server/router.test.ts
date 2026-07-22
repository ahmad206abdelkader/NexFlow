import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NodeType } from "@/generated/prisma";
import { authorizeGoogleFormsTrigger } from "./router";

describe("Google Forms webhook ownership", () => {
  it("authorizes the trigger owner", async () => {
    const trigger = await authorizeGoogleFormsTrigger(
      {
        workflowId: "workflow-1",
        triggerNodeId: "trigger-1",
        userId: "user-1",
      },
      async () => ({ id: "trigger-1", type: NodeType.googleFormsTrigger }),
    );

    assert.equal(trigger.id, "trigger-1");
  });

  it("does not expose another user's trigger", async () => {
    await assert.rejects(
      authorizeGoogleFormsTrigger(
        {
          workflowId: "workflow-1",
          triggerNodeId: "trigger-1",
          userId: "user-2",
        },
        async () => null,
      ),
      /Google Forms trigger was not found/,
    );
  });
});
