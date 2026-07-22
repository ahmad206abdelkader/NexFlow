import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NodeType } from "@/generated/prisma";
import { workflowStepIds } from "./workflow-step-ids";

describe("workflow step IDs", () => {
  it("creates stable, readable, node-specific executor step IDs", () => {
    assert.equal(
      workflowStepIds.nodeExecute("trigger-1", NodeType.MANUAL_TRIGGER),
      "execute:manual-trigger:trigger-1",
    );
    assert.equal(
      workflowStepIds.nodeExecute("http-1", NodeType.HTTP_REQUIST),
      "execute:http-request:http-1",
    );
    assert.equal(
      workflowStepIds.nodeExecute(
        "google-trigger",
        NodeType.googleFormsTrigger,
      ),
      "execute:google-forms-trigger:google-trigger",
    );
    assert.notEqual(
      workflowStepIds.nodeExecute("http-1", NodeType.HTTP_REQUIST),
      workflowStepIds.nodeExecute("http-2", NodeType.HTTP_REQUIST),
    );
  });

  it("keeps persistence and publishing separate from execution", () => {
    assert.equal(
      workflowStepIds.nodePersist("running", "http-1"),
      "persist:running:http-1",
    );
    assert.equal(
      workflowStepIds.nodePublish("success", "http-1"),
      "publish:success:http-1",
    );
  });
});
