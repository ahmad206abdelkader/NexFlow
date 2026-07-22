import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NodeType } from "@/generated/prisma";
import { defaultNodeData, isTriggerNodeType } from "./node-types";

describe("Google Forms node registration", () => {
  it("registers the node and creates its default variable name", () => {
    assert.equal(NodeType.googleFormsTrigger, "googleFormsTrigger");
    assert.deepEqual(defaultNodeData(NodeType.googleFormsTrigger), {
      variableName: "googleForm",
    });
  });

  it("treats manual and Google Forms nodes as one trigger family", () => {
    assert.equal(isTriggerNodeType(NodeType.MANUAL_TRIGGER), true);
    assert.equal(isTriggerNodeType(NodeType.googleFormsTrigger), true);
    assert.equal(isTriggerNodeType(NodeType.HTTP_REQUIST), false);
  });
});
