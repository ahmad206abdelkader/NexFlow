export type WorkflowGraphNode = {
  id: string;
};

export type WorkflowGraphEdge = {
  fromNodeId: string;
  toNodeId: string;
};

export type TopologicalWorkflowPlan<TNode extends WorkflowGraphNode> = {
  orderedNodes: TNode[];
  dependenciesByNodeId: ReadonlyMap<string, readonly string[]>;
};

const compareNodeIds = (left: string, right: string) => {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
};

const insertInOrder = (nodeIds: string[], nodeId: string) => {
  const index = nodeIds.findIndex(
    (candidateId) => compareNodeIds(nodeId, candidateId) < 0,
  );

  if (index === -1) {
    nodeIds.push(nodeId);
    return;
  }

  nodeIds.splice(index, 0, nodeId);
};

export const topologicallySortWorkflowNodes = <TNode extends WorkflowGraphNode>(
  nodes: readonly TNode[],
  edges: readonly WorkflowGraphEdge[],
  triggerNodeId: string,
): TopologicalWorkflowPlan<TNode> => {
  const nodesById = new Map<string, TNode>();

  for (const node of nodes) {
    if (!node || typeof node.id !== "string" || node.id.trim().length === 0) {
      throw new Error("Workflow contains an invalid node.");
    }

    if (nodesById.has(node.id)) {
      throw new Error(`Workflow contains duplicate node ID "${node.id}".`);
    }

    nodesById.set(node.id, node);
  }

  if (
    typeof triggerNodeId !== "string" ||
    triggerNodeId.trim().length === 0 ||
    !nodesById.has(triggerNodeId)
  ) {
    throw new Error("Workflow trigger node is missing.");
  }

  const outgoing = new Map<string, Set<string>>();

  for (const edge of edges) {
    if (
      !edge ||
      typeof edge.fromNodeId !== "string" ||
      edge.fromNodeId.trim().length === 0 ||
      typeof edge.toNodeId !== "string" ||
      edge.toNodeId.trim().length === 0
    ) {
      throw new Error("Workflow contains an invalid or malformed edge.");
    }

    if (!nodesById.has(edge.fromNodeId)) {
      throw new Error(
        `Workflow edge references missing source node "${edge.fromNodeId}".`,
      );
    }

    if (!nodesById.has(edge.toNodeId)) {
      throw new Error(
        `Workflow edge references missing target node "${edge.toNodeId}".`,
      );
    }

    if (edge.fromNodeId === edge.toNodeId) {
      throw new Error(
        `Workflow contains a self-referencing edge for node "${edge.fromNodeId}".`,
      );
    }

    const targets = outgoing.get(edge.fromNodeId) ?? new Set<string>();
    targets.add(edge.toNodeId);
    outgoing.set(edge.fromNodeId, targets);
  }

  const sortedTargets = new Map(
    [...outgoing].map(([nodeId, targets]) => [
      nodeId,
      [...targets].sort(compareNodeIds),
    ]),
  );
  const reachableNodeIds = new Set([triggerNodeId]);
  const reachableQueue = [triggerNodeId];

  for (let index = 0; index < reachableQueue.length; index += 1) {
    const nodeId = reachableQueue[index];

    for (const targetId of sortedTargets.get(nodeId) ?? []) {
      if (!reachableNodeIds.has(targetId)) {
        reachableNodeIds.add(targetId);
        reachableQueue.push(targetId);
      }
    }
  }

  const dependencies = new Map<string, Set<string>>(
    [...reachableNodeIds].map((nodeId) => [nodeId, new Set<string>()]),
  );

  for (const [sourceId, targetIds] of sortedTargets) {
    if (!reachableNodeIds.has(sourceId)) {
      continue;
    }

    for (const targetId of targetIds) {
      if (reachableNodeIds.has(targetId)) {
        dependencies.get(targetId)?.add(sourceId);
      }
    }
  }

  const indegree = new Map(
    [...dependencies].map(([nodeId, sourceIds]) => [nodeId, sourceIds.size]),
  );
  const ready = [...indegree]
    .filter(([, count]) => count === 0)
    .map(([nodeId]) => nodeId)
    .sort(compareNodeIds);
  const orderedNodeIds: string[] = [];

  while (ready.length > 0) {
    const nodeId = ready.shift();

    if (!nodeId) {
      break;
    }

    orderedNodeIds.push(nodeId);

    for (const targetId of sortedTargets.get(nodeId) ?? []) {
      if (!reachableNodeIds.has(targetId)) {
        continue;
      }

      const nextIndegree = (indegree.get(targetId) ?? 0) - 1;
      indegree.set(targetId, nextIndegree);

      if (nextIndegree === 0) {
        insertInOrder(ready, targetId);
      }
    }
  }

  if (orderedNodeIds.length !== reachableNodeIds.size) {
    throw new Error("Workflow contains a cycle and cannot be executed.");
  }

  return {
    orderedNodes: orderedNodeIds.map((nodeId) => {
      const node = nodesById.get(nodeId);

      if (!node) {
        throw new Error(`Workflow node "${nodeId}" is missing.`);
      }

      return node;
    }),
    dependenciesByNodeId: new Map(
      [...dependencies].map(([nodeId, sourceIds]) => [
        nodeId,
        [...sourceIds].sort(compareNodeIds),
      ]),
    ),
  };
};
