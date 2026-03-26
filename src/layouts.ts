import * as d3 from "d3";
import {
  FlowLayoutOptions,
  GraphData,
  GraphNode,
  LayoutDirection,
  LayoutMode,
  LayoutOptions,
  TreeLayoutOptions,
} from "./canvas-types.js";

type LayoutPoint = { x: number; y: number };

type TreeNode = {
  id: number;
  children: TreeNode[];
};

const DEFAULT_LAYOUT_MODE: LayoutMode = "force";
const DEFAULT_TREE_OPTIONS: Required<Omit<TreeLayoutOptions, "rootNodeId">> = {
  direction: "TB",
  levelSpacing: 130,
  nodeSpacing: 110,
  componentSpacing: 180,
};
const DEFAULT_FLOW_OPTIONS: Required<FlowLayoutOptions> = {
  direction: "LR",
  layerSpacing: 180,
  nodeSpacing: 110,
  componentSpacing: 220,
};

function orientPoint(x: number, y: number, direction: LayoutDirection): LayoutPoint {
  switch (direction) {
    case "BT":
      return { x, y: -y };
    case "LR":
      return { x: y, y: x };
    case "RL":
      return { x: -y, y: x };
    case "TB":
    default:
      return { x, y };
  }
}

function centerNodePositions(nodes: GraphNode[]) {
  if (nodes.length === 0) return;

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const node of nodes) {
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  for (const node of nodes) {
    node.x = (node.x ?? 0) - centerX;
    node.y = (node.y ?? 0) - centerY;
  }
}

function pinAllNodes(nodes: GraphNode[]) {
  for (const node of nodes) {
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    node.x = x;
    node.y = y;
    node.fx = x;
    node.fy = y;
    node.vx = 0;
    node.vy = 0;
    node.initialPositionCalculated = true;
  }
}

function unpinAllNodes(nodes: GraphNode[]) {
  for (const node of nodes) {
    node.fx = undefined;
    node.fy = undefined;
  }
}

function createAdjacency(graphData: GraphData) {
  const nodeIds = graphData.nodes.map((node) => node.id);
  const nodeIdSet = new Set<number>(nodeIds);
  const outgoing = new Map<number, number[]>();
  const incoming = new Map<number, number[]>();
  const inDegree = new Map<number, number>();

  for (const id of nodeIds) {
    outgoing.set(id, []);
    incoming.set(id, []);
    inDegree.set(id, 0);
  }

  for (const link of graphData.links) {
    const sourceId = link.source.id;
    const targetId = link.target.id;

    if (!nodeIdSet.has(sourceId) || !nodeIdSet.has(targetId)) continue;
    if (sourceId === targetId) continue;

    const sourceOutgoing = outgoing.get(sourceId);
    const targetIncoming = incoming.get(targetId);

    if (!sourceOutgoing || !targetIncoming) continue;
    if (sourceOutgoing.includes(targetId)) continue;

    sourceOutgoing.push(targetId);
    targetIncoming.push(sourceId);
    inDegree.set(targetId, (inDegree.get(targetId) ?? 0) + 1);
  }

  for (const ids of outgoing.values()) {
    ids.sort((a, b) => a - b);
  }

  for (const ids of incoming.values()) {
    ids.sort((a, b) => a - b);
  }

  return { nodeIds, outgoing, incoming, inDegree };
}

function applyTreeLayout(graphData: GraphData, treeOptions?: TreeLayoutOptions) {
  const options = { ...DEFAULT_TREE_OPTIONS, ...treeOptions };
  const { nodeIds, outgoing, inDegree } = createAdjacency(graphData);
  const nodeIdSet = new Set<number>(nodeIds);
  const visited = new Set<number>();
  const forest: TreeNode[] = [];

  if (nodeIds.length === 0) return;

  const preferredRoots: number[] = [];
  if (treeOptions?.rootNodeId !== undefined && nodeIdSet.has(treeOptions.rootNodeId)) {
    preferredRoots.push(treeOptions.rootNodeId);
  }

  const inDegreeRoots = nodeIds.filter((nodeId) => (inDegree.get(nodeId) ?? 0) === 0);
  for (const rootId of inDegreeRoots) {
    if (!preferredRoots.includes(rootId)) preferredRoots.push(rootId);
  }

  if (preferredRoots.length === 0) {
    preferredRoots.push(nodeIds[0]);
  }

  const addTreeRoot = (rootId: number) => {
    if (visited.has(rootId)) return;

    const root: TreeNode = { id: rootId, children: [] };
    const queue: Array<{ node: TreeNode; id: number }> = [{ node: root, id: rootId }];
    visited.add(rootId);

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;

      const children = outgoing.get(current.id) ?? [];
      for (const childId of children) {
        if (visited.has(childId)) continue;

        visited.add(childId);
        const childNode: TreeNode = { id: childId, children: [] };
        current.node.children.push(childNode);
        queue.push({ node: childNode, id: childId });
      }
    }

    forest.push(root);
  };

  for (const rootId of preferredRoots) {
    addTreeRoot(rootId);
  }

  for (const nodeId of nodeIds) {
    addTreeRoot(nodeId);
  }

  const positionByNodeId = new Map<number, LayoutPoint>();
  let breadthOffset = 0;

  for (const treeRoot of forest) {
    const rootHierarchy = d3.hierarchy(treeRoot, (node) => node.children);
    const treeLayout = d3
      .tree<TreeNode>()
      .nodeSize([options.nodeSpacing, options.levelSpacing]);

    treeLayout(rootHierarchy);

    let minBreadth = Number.POSITIVE_INFINITY;
    let maxBreadth = Number.NEGATIVE_INFINITY;
    rootHierarchy.each((node) => {
      const breadth = node.x ?? 0;
      minBreadth = Math.min(minBreadth, breadth);
      maxBreadth = Math.max(maxBreadth, breadth);
    });

    rootHierarchy.each((node) => {
      const localBreadth = (node.x ?? 0) - minBreadth + breadthOffset;
      const localDepth = node.y ?? 0;
      positionByNodeId.set(
        node.data.id,
        orientPoint(localBreadth, localDepth, options.direction)
      );
    });

    const componentBreadth = maxBreadth - minBreadth;
    breadthOffset += componentBreadth + options.componentSpacing;
  }

  for (const node of graphData.nodes) {
    const position = positionByNodeId.get(node.id);
    if (!position) continue;

    node.x = position.x;
    node.y = position.y;
  }

  centerNodePositions(graphData.nodes);
}

function collectWeaklyConnectedComponents(
  nodeIds: number[],
  outgoing: Map<number, number[]>,
  incoming: Map<number, number[]>
): number[][] {
  const visited = new Set<number>();
  const components: number[][] = [];

  for (const nodeId of nodeIds) {
    if (visited.has(nodeId)) continue;

    const queue: number[] = [nodeId];
    const component: number[] = [];
    visited.add(nodeId);

    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) continue;
      component.push(current);

      const neighbors = [
        ...(outgoing.get(current) ?? []),
        ...(incoming.get(current) ?? []),
      ];

      for (const next of neighbors) {
        if (visited.has(next)) continue;
        visited.add(next);
        queue.push(next);
      }
    }

    component.sort((a, b) => a - b);
    components.push(component);
  }

  return components;
}

function assignFlowLayers(
  componentNodeIds: number[],
  outgoing: Map<number, number[]>,
  incoming: Map<number, number[]>
): Map<number, number> {
  const componentSet = new Set(componentNodeIds);
  const inDegree = new Map<number, number>();
  const layers = new Map<number, number>();
  const processed = new Set<number>();
  const queue: number[] = [];

  for (const nodeId of componentNodeIds) {
    const degree = (incoming.get(nodeId) ?? []).filter((id) => componentSet.has(id)).length;
    inDegree.set(nodeId, degree);
    if (degree === 0) queue.push(nodeId);
  }

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) continue;
    processed.add(current);

    const currentLayer = layers.get(current) ?? 0;
    const children = outgoing.get(current) ?? [];

    for (const childId of children) {
      if (!componentSet.has(childId)) continue;
      if (childId === current) continue;

      const nextLayer = Math.max(layers.get(childId) ?? 0, currentLayer + 1);
      layers.set(childId, nextLayer);

      const nextInDegree = (inDegree.get(childId) ?? 0) - 1;
      inDegree.set(childId, nextInDegree);
      if (nextInDegree === 0) queue.push(childId);
    }
  }

  let maxAssignedLayer = 0;
  for (const layer of layers.values()) {
    maxAssignedLayer = Math.max(maxAssignedLayer, layer);
  }

  for (const nodeId of componentNodeIds) {
    if (processed.has(nodeId)) continue;
    const parentLayers = (incoming.get(nodeId) ?? [])
      .filter((parentId) => componentSet.has(parentId))
      .map((parentId) => layers.get(parentId))
      .filter((layer): layer is number => layer !== undefined);

    const fallbackLayer = maxAssignedLayer + 1;
    const layer = parentLayers.length > 0 ? Math.max(...parentLayers) + 1 : fallbackLayer;
    layers.set(nodeId, layer);
    maxAssignedLayer = Math.max(maxAssignedLayer, layer);
  }

  for (const nodeId of componentNodeIds) {
    if (!layers.has(nodeId)) layers.set(nodeId, 0);
  }

  return layers;
}

function applyFlowLayout(graphData: GraphData, flowOptions?: FlowLayoutOptions) {
  const options = { ...DEFAULT_FLOW_OPTIONS, ...flowOptions };
  const { nodeIds, outgoing, incoming } = createAdjacency(graphData);
  const components = collectWeaklyConnectedComponents(nodeIds, outgoing, incoming);
  const positionByNodeId = new Map<number, LayoutPoint>();

  let breadthOffset = 0;

  for (const componentNodeIds of components) {
    const componentSet = new Set(componentNodeIds);
    const layersByNode = assignFlowLayers(componentNodeIds, outgoing, incoming);
    const nodesByLayer = new Map<number, number[]>();
    const priorLayerOrder = new Map<number, number>();

    for (const nodeId of componentNodeIds) {
      const layer = layersByNode.get(nodeId) ?? 0;
      const layerNodes = nodesByLayer.get(layer) ?? [];
      layerNodes.push(nodeId);
      nodesByLayer.set(layer, layerNodes);
    }

    const sortedLayers = [...nodesByLayer.keys()].sort((a, b) => a - b);

    for (const layer of sortedLayers) {
      const layerNodes = nodesByLayer.get(layer);
      if (!layerNodes) continue;

      layerNodes.sort((a, b) => {
        const aParents = (incoming.get(a) ?? [])
          .filter((id) => componentSet.has(id))
          .map((id) => priorLayerOrder.get(id))
          .filter((index): index is number => index !== undefined);
        const bParents = (incoming.get(b) ?? [])
          .filter((id) => componentSet.has(id))
          .map((id) => priorLayerOrder.get(id))
          .filter((index): index is number => index !== undefined);

        const aScore =
          aParents.length > 0
            ? aParents.reduce((sum, index) => sum + index, 0) / aParents.length
            : Number.POSITIVE_INFINITY;
        const bScore =
          bParents.length > 0
            ? bParents.reduce((sum, index) => sum + index, 0) / bParents.length
            : Number.POSITIVE_INFINITY;

        if (aScore === bScore) return a - b;
        return aScore - bScore;
      });

      layerNodes.forEach((nodeId, index) => {
        priorLayerOrder.set(nodeId, index);
      });
    }

    let minBreadth = Number.POSITIVE_INFINITY;
    let maxBreadth = Number.NEGATIVE_INFINITY;

    for (const layer of sortedLayers) {
      const layerNodes = nodesByLayer.get(layer);
      if (!layerNodes) continue;

      const centerIndex = (layerNodes.length - 1) / 2;
      layerNodes.forEach((nodeId, index) => {
        const breadth = (index - centerIndex) * options.nodeSpacing;
        const depth = layer * options.layerSpacing;
        minBreadth = Math.min(minBreadth, breadth);
        maxBreadth = Math.max(maxBreadth, breadth);
        positionByNodeId.set(nodeId, { x: breadth, y: depth });
      });
    }

    for (const nodeId of componentNodeIds) {
      const basePoint = positionByNodeId.get(nodeId);
      if (!basePoint) continue;

      const normalizedBreadth = basePoint.x - minBreadth + breadthOffset;
      positionByNodeId.set(nodeId, { x: normalizedBreadth, y: basePoint.y });
    }

    const componentBreadth = maxBreadth - minBreadth;
    breadthOffset += componentBreadth + options.componentSpacing;
  }

  for (const node of graphData.nodes) {
    const basePoint = positionByNodeId.get(node.id);
    if (!basePoint) continue;

    const orientedPoint = orientPoint(basePoint.x, basePoint.y, options.direction);
    node.x = orientedPoint.x;
    node.y = orientedPoint.y;
  }

  centerNodePositions(graphData.nodes);
}

export function isForceLayout(layoutMode?: LayoutMode): boolean {
  return (layoutMode ?? DEFAULT_LAYOUT_MODE) === "force";
}

export function applyGraphLayout(
  graphData: GraphData,
  layoutMode?: LayoutMode,
  layoutOptions?: LayoutOptions
): GraphData {
  const mode = layoutMode ?? DEFAULT_LAYOUT_MODE;

  if (mode === "tree") {
    applyTreeLayout(graphData, layoutOptions?.tree);
    pinAllNodes(graphData.nodes);
    return graphData;
  }

  if (mode === "flow") {
    applyFlowLayout(graphData, layoutOptions?.flow);
    pinAllNodes(graphData.nodes);
    return graphData;
  }

  unpinAllNodes(graphData.nodes);
  return graphData;
}
