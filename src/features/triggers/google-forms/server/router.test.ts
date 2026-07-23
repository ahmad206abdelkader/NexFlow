import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NodeType } from "@/generated/prisma";
import { authorizeGoogleFormsTrigger, getPublicApplicationUrl } from "./router";

describe("Google Forms webhook public URL", () => {
  it("uses BETTER_AUTH_URL for public webhook generation", () => {
    const previousBetterAuthUrl = process.env.BETTER_AUTH_URL;
    const previousVercelUrl = process.env.VERCEL_URL;

    try {
      process.env.BETTER_AUTH_URL =
        "https://generated-public-url.trycloudflare.com/path";
      process.env.VERCEL_URL = "production.example";

      assert.equal(
        getPublicApplicationUrl(),
        "https://generated-public-url.trycloudflare.com",
      );
    } finally {
      if (previousBetterAuthUrl === undefined) {
        delete process.env.BETTER_AUTH_URL;
      } else {
        process.env.BETTER_AUTH_URL = previousBetterAuthUrl;
      }

      if (previousVercelUrl === undefined) {
        delete process.env.VERCEL_URL;
      } else {
        process.env.VERCEL_URL = previousVercelUrl;
      }
    }
  });
});

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
