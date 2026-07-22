import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NodeType } from "@/generated/prisma";
import { executeWorkflowGraph } from "./execute-workflow";
import {
  topologicallySortWorkflowNodes,
  type WorkflowGraphEdge,
} from "./topological-sort";

const nodes = (...ids: string[]) => ids.map((id) => ({ id }));

const edge = (fromNodeId: string, toNodeId: string): WorkflowGraphEdge => ({
  fromNodeId,
  toNodeId,
});

const nodeResult = (status: number) => ({
  status,
  statusCode: status,
  statusText: "OK",
  headers: {},
  body: null,
  data: null,
});

const orderedIds = (
  nodeIds: string[],
  edges: WorkflowGraphEdge[],
  triggerNodeId = "trigger",
) =>
  topologicallySortWorkflowNodes(
    nodes(...nodeIds),
    edges,
    triggerNodeId,
  ).orderedNodes.map((node) => node.id);

describe("topologicallySortWorkflowNodes", () => {
  it("sorts a simple linear workflow", () => {
    assert.deepEqual(
      orderedIds(
        ["save", "trigger", "ai", "http"],
        [edge("ai", "save"), edge("trigger", "http"), edge("http", "ai")],
      ),
      ["trigger", "http", "ai", "save"],
    );
  });

  it("sorts branches deterministically", () => {
    assert.deepEqual(
      orderedIds(
        ["node-b", "join", "trigger", "node-a"],
        [
          edge("node-b", "join"),
          edge("trigger", "node-b"),
          edge("node-a", "join"),
          edge("trigger", "node-a"),
        ],
      ),
      ["trigger", "node-a", "node-b", "join"],
    );
  });

  it("waits for every dependency before adding a join node", () => {
    const plan = topologicallySortWorkflowNodes(
      nodes("join", "parent-c", "trigger", "parent-a", "parent-b"),
      [
        edge("parent-c", "join"),
        edge("trigger", "parent-c"),
        edge("parent-a", "join"),
        edge("trigger", "parent-a"),
        edge("parent-b", "join"),
        edge("trigger", "parent-b"),
      ],
      "trigger",
    );

    assert.deepEqual(
      plan.orderedNodes.map((node) => node.id),
      ["trigger", "parent-a", "parent-b", "parent-c", "join"],
    );
    assert.deepEqual(plan.dependenciesByNodeId.get("join"), [
      "parent-a",
      "parent-b",
      "parent-c",
    ]);
  });

  it("ignores disconnected nodes", () => {
    assert.deepEqual(
      orderedIds(
        ["detached-b", "connected", "trigger", "detached-a"],
        [edge("trigger", "connected"), edge("detached-a", "detached-b")],
      ),
      ["trigger", "connected"],
    );
  });

  it("detects a reachable cycle", () => {
    assert.throws(
      () =>
        orderedIds(
          ["trigger", "node-a", "node-b"],
          [
            edge("trigger", "node-a"),
            edge("node-a", "node-b"),
            edge("node-b", "node-a"),
          ],
        ),
      /Workflow contains a cycle and cannot be executed\./,
    );
  });

  it("detects a self-loop", () => {
    assert.throws(
      () =>
        orderedIds(
          ["trigger", "node-a"],
          [edge("trigger", "node-a"), edge("node-a", "node-a")],
        ),
      /Workflow contains a self-referencing edge for node "node-a"\./,
    );
  });

  it("detects a missing target node referenced by an edge", () => {
    assert.throws(
      () => orderedIds(["trigger"], [edge("trigger", "missing-target")]),
      /Workflow edge references missing target node "missing-target"\./,
    );
  });

  it("detects a missing source node referenced by an edge", () => {
    assert.throws(
      () => orderedIds(["trigger"], [edge("missing-source", "trigger")]),
      /Workflow edge references missing source node "missing-source"\./,
    );
  });

  it("uses the same order regardless of node and edge input order", () => {
    const nodeIds = ["trigger", "node-b", "node-a", "join"];
    const edges = [
      edge("trigger", "node-b"),
      edge("trigger", "node-a"),
      edge("node-b", "join"),
      edge("node-a", "join"),
    ];

    assert.deepEqual(
      orderedIds(nodeIds, edges),
      orderedIds([...nodeIds].reverse(), [...edges].reverse()),
    );
    assert.deepEqual(orderedIds(nodeIds, edges), [
      "trigger",
      "node-a",
      "node-b",
      "join",
    ]);
  });

  it("rejects an empty workflow", () => {
    assert.throws(
      () => orderedIds([], []),
      /Workflow trigger node is missing\./,
    );
  });

  it("returns the trigger for a trigger-only workflow", () => {
    assert.deepEqual(orderedIds(["trigger"], []), ["trigger"]);
  });

  it("detects duplicate node IDs", () => {
    assert.throws(
      () => orderedIds(["trigger", "duplicate", "duplicate"], []),
      /Workflow contains duplicate node ID "duplicate"\./,
    );
  });

  it("detects malformed edges", () => {
    const malformedEdges = [
      { fromNodeId: "trigger" },
    ] as unknown as WorkflowGraphEdge[];

    assert.throws(
      () => orderedIds(["trigger"], malformedEdges),
      /Workflow contains an invalid or malformed edge\./,
    );
  });
});

describe("executeWorkflowGraph", () => {
  it("executes the trigger through its registered executor when requested", async () => {
    const dispatchedNodes: string[] = [];

    const result = await executeWorkflowGraph(
      {
        id: "workflow",
        nodes: [
          { id: "trigger", type: NodeType.MANUAL_TRIGGER, data: {} },
          { id: "http", type: NodeType.HTTP_REQUIST, data: {} },
        ],
        connections: [edge("trigger", "http")],
      },
      {
        executeTrigger: async (node, execute) => {
          dispatchedNodes.push(node.id);
          return execute();
        },
        executeNode: async (node) => {
          dispatchedNodes.push(node.id);
          return nodeResult(200);
        },
      },
    );

    assert.deepEqual(dispatchedNodes, ["trigger", "http"]);
    assert.deepEqual(result.executedNodeIds, ["http"]);
  });

  it("does not dispatch any node when the reachable graph contains a cycle", async () => {
    let dispatchedNodes = 0;

    await assert.rejects(
      executeWorkflowGraph(
        {
          id: "workflow",
          nodes: [
            { id: "trigger", type: NodeType.MANUAL_TRIGGER, data: {} },
            { id: "node-a", type: NodeType.HTTP_REQUIST, data: {} },
            { id: "node-b", type: NodeType.HTTP_REQUIST, data: {} },
          ],
          connections: [
            edge("trigger", "node-a"),
            edge("node-a", "node-b"),
            edge("node-b", "node-a"),
          ],
        },
        {
          executeNode: async () => {
            dispatchedNodes += 1;
            return nodeResult(200);
          },
        },
      ),
      /Workflow contains a cycle and cannot be executed\./,
    );
    assert.equal(dispatchedNodes, 0);
  });

  it("rejects multiple trigger nodes", async () => {
    await assert.rejects(
      executeWorkflowGraph({
        id: "workflow",
        nodes: [
          { id: "trigger-a", type: NodeType.MANUAL_TRIGGER, data: {} },
          { id: "trigger-b", type: NodeType.MANUAL_TRIGGER, data: {} },
        ],
        connections: [],
      }),
      /Workflow must contain only one trigger\./,
    );
  });

  it("rejects mixed manual and Google Forms triggers", async () => {
    await assert.rejects(
      executeWorkflowGraph({
        id: "workflow",
        nodes: [
          { id: "manual", type: NodeType.MANUAL_TRIGGER, data: {} },
          {
            id: "google",
            type: NodeType.googleFormsTrigger,
            data: { variableName: "googleForm" },
          },
        ],
        connections: [],
      }),
      /Workflow must contain only one trigger\./,
    );
  });

  it("makes Google Forms trigger output available to downstream nodes", async () => {
    const contexts = new Map<string, string[]>();
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

    await executeWorkflowGraph(
      {
        id: "workflow",
        nodes: [
          {
            id: "trigger",
            type: NodeType.googleFormsTrigger,
            data: { variableName: "googleForm" },
          },
          { id: "http", type: NodeType.HTTP_REQUIST, data: {} },
        ],
        connections: [edge("trigger", "http")],
      },
      {
        triggerNodeId: "trigger",
        triggerInput,
        executeNode: async (node, _execute, context) => {
          contexts.set(
            node.id,
            context.upstreamResults.map(
              ({ variableName }) => variableName ?? "",
            ),
          );
          return nodeResult(200);
        },
      },
    );

    assert.deepEqual(contexts.get("http"), ["googleForm"]);
  });

  it("passes all successful direct dependency results to a join node", async () => {
    const contexts = new Map<string, string[]>();
    const result = await executeWorkflowGraph(
      {
        id: "workflow",
        nodes: [
          { id: "join", type: NodeType.HTTP_REQUIST, data: {} },
          { id: "parent-b", type: NodeType.HTTP_REQUIST, data: {} },
          { id: "trigger", type: NodeType.MANUAL_TRIGGER, data: {} },
          { id: "parent-a", type: NodeType.HTTP_REQUIST, data: {} },
        ],
        connections: [
          edge("parent-b", "join"),
          edge("trigger", "parent-b"),
          edge("parent-a", "join"),
          edge("trigger", "parent-a"),
        ],
      },
      {
        executeNode: async (node, _execute, context) => {
          contexts.set(
            node.id,
            context.upstreamResults.map(({ nodeId }) => nodeId),
          );
          return nodeResult(node.id === "parent-a" ? 201 : 200);
        },
      },
    );

    assert.deepEqual(result.executedNodeIds, ["parent-a", "parent-b", "join"]);
    assert.deepEqual(contexts.get("join"), ["parent-a", "parent-b"]);
  });

  it("exposes completed transitive ancestors but not sibling nodes", async () => {
    const contexts = new Map<string, string[]>();
    await executeWorkflowGraph(
      {
        id: "workflow",
        nodes: [
          {
            id: "ancestor",
            type: NodeType.HTTP_REQUIST,
            data: { variableName: "ancestorResult" },
          },
          {
            id: "child",
            type: NodeType.HTTP_REQUIST,
            data: {},
          },
          {
            id: "parent",
            type: NodeType.HTTP_REQUIST,
            data: { variableName: "parentResult" },
          },
          {
            id: "sibling",
            type: NodeType.HTTP_REQUIST,
            data: { variableName: "siblingResult" },
          },
          { id: "trigger", type: NodeType.MANUAL_TRIGGER, data: {} },
        ],
        connections: [
          edge("trigger", "ancestor"),
          edge("ancestor", "parent"),
          edge("parent", "child"),
          edge("trigger", "sibling"),
        ],
      },
      {
        executeNode: async (node, _execute, context) => {
          contexts.set(
            node.id,
            context.upstreamResults.map(({ nodeId }) => nodeId),
          );
          return nodeResult(200);
        },
      },
    );

    assert.deepEqual(contexts.get("child"), ["ancestor", "parent"]);
    assert.equal(contexts.get("child")?.includes("sibling"), false);
    assert.equal(contexts.get("child")?.includes("child"), false);
  });
});
