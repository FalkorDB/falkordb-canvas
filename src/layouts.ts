import * as d3 from "d3";
import {
  ArcLayoutOptions,
  ComponentsInnerLayout,
  ComponentsLayoutOptions,
  ComponentsSortMode,
  ConcentricLayoutOptions,
  ConcentricMetric,
  FlowLayoutOptions,
  GraphData,
  GraphLink,
  GraphNode,
  LayoutDirection,
  LayoutMode,
  LayoutOptions,
  RadialTreeLayoutOptions,
  RingSortMode,
  TreeLayoutOptions,
} from "./canvas-types.js";

type LayoutPoint = { x: number; y: number };
type TreeNode = { id: number; children: TreeNode[] };
type ComponentInfo = { nodeIds: number[]; edgeCount: number };

const DEFAULT_LAYOUT_MODE: LayoutMode = "force";
const LINK_CURVE_MULTIPLIER = 0.4;

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
const DEFAULT_RADIAL_TREE_OPTIONS: Required<Omit<RadialTreeLayoutOptions, "rootNodeId">> = {
  direction: "TB",
  startAngle: -Math.PI / 2,
  endAngle: (3 * Math.PI) / 2,
  radiusStep: 130,
  componentSpacing: 250,
};
const DEFAULT_CONCENTRIC_OPTIONS: Required<Omit<ConcentricLayoutOptions, "rootNodeId">> = {
  metric: "degree",
  ringSpacing: 130,
  minRingNodeSpacing: 80,
  sortWithinRing: "id",
};
const DEFAULT_COMPONENTS_OPTIONS: Required<ComponentsLayoutOptions> = {
  innerLayout: "concentric",
  componentGap: 260,
  maxColumns: 3,
  sortComponentsBy: "size",
};
const DEFAULT_ARC_OPTIONS: Required<ArcLayoutOptions> = {
  orderBy: "id",
  direction: "LR",
  nodeSpacing: 120,
  curveScale: 0.22,
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

function getDirectionRotation(direction: LayoutDirection): number {
  switch (direction) {
    case "LR":
      return 0;
    case "RL":
      return Math.PI;
    case "BT":
      return -Math.PI / 2;
    case "TB":
    default:
      return Math.PI / 2;
  }
}

function calculateLinkCurve(index: number, isSelfLoop: boolean): number {
  const even = index % 2 === 0;

  if (isSelfLoop) {
    if (even) {
      return (Math.floor(-(index / 2)) - 3) * LINK_CURVE_MULTIPLIER;
    }
    return (Math.floor((index + 1) / 2) + 2) * LINK_CURVE_MULTIPLIER;
  }

  if (even) {
    return Math.floor(-(index / 2)) * LINK_CURVE_MULTIPLIER;
  }
  return Math.floor((index + 1) / 2) * LINK_CURVE_MULTIPLIER;
}

function resetDefaultLinkCurves(links: GraphLink[]) {
  const linksByPairCount = new Map<number, Map<number, number>>();

  for (const link of links) {
    const sourceId = link.source.id;
    const targetId = link.target.id;
    const minId = Math.min(sourceId, targetId);
    const maxId = Math.max(sourceId, targetId);

    let pairMap = linksByPairCount.get(minId);
    if (!pairMap) {
      pairMap = new Map<number, number>();
      linksByPairCount.set(minId, pairMap);
    }

    const duplicateIndex = pairMap.get(maxId) ?? 0;
    pairMap.set(maxId, duplicateIndex + 1);
    link.curve = calculateLinkCurve(duplicateIndex, sourceId === targetId);
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

  for (const ids of outgoing.values()) ids.sort((a, b) => a - b);
  for (const ids of incoming.values()) ids.sort((a, b) => a - b);

  return { nodeIds, outgoing, incoming, inDegree };
}

function getNodeMap(nodes: GraphNode[]) {
  const nodeMap = new Map<number, GraphNode>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }
  return nodeMap;
}

function getNodeLabel(node: GraphNode): string {
  const label = node.labels[0] ?? "";
  return label || String(node.id);
}

function computeDegreeMaps(nodeIds: number[], outgoing: Map<number, number[]>, incoming: Map<number, number[]>) {
  const inDegree = new Map<number, number>();
  const outDegree = new Map<number, number>();
  const degree = new Map<number, number>();

  for (const id of nodeIds) {
    const inCount = incoming.get(id)?.length ?? 0;
    const outCount = outgoing.get(id)?.length ?? 0;
    inDegree.set(id, inCount);
    outDegree.set(id, outCount);
    degree.set(id, inCount + outCount);
  }

  return { inDegree, outDegree, degree };
}

function buildUndirectedAdjacency(nodeIds: number[], outgoing: Map<number, number[]>, incoming: Map<number, number[]>) {
  const undirected = new Map<number, number[]>();

  for (const id of nodeIds) {
    const neighbors = new Set<number>();
    for (const target of outgoing.get(id) ?? []) neighbors.add(target);
    for (const source of incoming.get(id) ?? []) neighbors.add(source);
    undirected.set(id, [...neighbors].sort((a, b) => a - b));
  }

  return undirected;
}

function getDefaultRootId(
  nodeIds: number[],
  degreeMap: Map<number, number>,
  preferredRootId?: number
) {
  if (preferredRootId !== undefined && nodeIds.includes(preferredRootId)) {
    return preferredRootId;
  }

  let bestId = nodeIds[0];
  let bestDegree = Number.NEGATIVE_INFINITY;

  for (const nodeId of nodeIds) {
    const nodeDegree = degreeMap.get(nodeId) ?? 0;
    if (nodeDegree > bestDegree || (nodeDegree === bestDegree && nodeId < bestId)) {
      bestDegree = nodeDegree;
      bestId = nodeId;
    }
  }

  return bestId;
}

function computeBfsDepths(
  nodeIds: number[],
  outgoing: Map<number, number[]>,
  incoming: Map<number, number[]>,
  rootId?: number
) {
  const undirected = buildUndirectedAdjacency(nodeIds, outgoing, incoming);
  const degreeMap = computeDegreeMaps(nodeIds, outgoing, incoming).degree;
  const sourceRoot = getDefaultRootId(nodeIds, degreeMap, rootId);
  const depths = new Map<number, number>();
  const queue: number[] = [sourceRoot];

  depths.set(sourceRoot, 0);

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) continue;

    const currentDepth = depths.get(current) ?? 0;
    for (const neighbor of undirected.get(current) ?? []) {
      if (depths.has(neighbor)) continue;
      depths.set(neighbor, currentDepth + 1);
      queue.push(neighbor);
    }
  }

  let maxDepth = 0;
  for (const depth of depths.values()) {
    maxDepth = Math.max(maxDepth, depth);
  }

  for (const nodeId of nodeIds) {
    if (!depths.has(nodeId)) depths.set(nodeId, maxDepth + 1);
  }

  return depths;
}

function sortNodeIdsByMode(
  nodeIds: number[],
  mode: RingSortMode,
  nodeMap: Map<number, GraphNode>,
  degreeMap: Map<number, number>
) {
  const sorted = [...nodeIds];
  sorted.sort((a, b) => {
    if (mode === "degree") {
      const diff = (degreeMap.get(b) ?? 0) - (degreeMap.get(a) ?? 0);
      if (diff !== 0) return diff;
    } else if (mode === "label") {
      const aNode = nodeMap.get(a);
      const bNode = nodeMap.get(b);
      const aLabel = aNode ? getNodeLabel(aNode) : "";
      const bLabel = bNode ? getNodeLabel(bNode) : "";
      const labelDiff = aLabel.localeCompare(bLabel);
      if (labelDiff !== 0) return labelDiff;
    }
    return a - b;
  });
  return sorted;
}

function buildForest(
  nodeIds: number[],
  outgoing: Map<number, number[]>,
  inDegree: Map<number, number>,
  rootNodeId?: number
) {
  const nodeIdSet = new Set<number>(nodeIds);
  const preferredRoots: number[] = [];
  const visited = new Set<number>();
  const forest: TreeNode[] = [];

  if (rootNodeId !== undefined && nodeIdSet.has(rootNodeId)) {
    preferredRoots.push(rootNodeId);
  }

  for (const rootId of nodeIds) {
    if ((inDegree.get(rootId) ?? 0) === 0 && !preferredRoots.includes(rootId)) {
      preferredRoots.push(rootId);
    }
  }

  if (preferredRoots.length === 0 && nodeIds.length > 0) {
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

  for (const rootId of preferredRoots) addTreeRoot(rootId);
  for (const nodeId of nodeIds) addTreeRoot(nodeId);

  return forest;
}

function collectWeaklyConnectedComponents(
  nodeIds: number[],
  outgoing: Map<number, number[]>,
  incoming: Map<number, number[]>
) {
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

function getGraphBounds(nodes: GraphNode[]) {
  if (nodes.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0 };
  }

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

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function assignFlowLayers(
  componentNodeIds: number[],
  outgoing: Map<number, number[]>,
  incoming: Map<number, number[]>
) {
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

function applyTreeLayout(graphData: GraphData, treeOptions?: TreeLayoutOptions) {
  const options = { ...DEFAULT_TREE_OPTIONS, ...treeOptions };
  const { nodeIds, outgoing, inDegree } = createAdjacency(graphData);
  const forest = buildForest(nodeIds, outgoing, inDegree, treeOptions?.rootNodeId);
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

function applyRadialTreeLayout(graphData: GraphData, radialOptions?: RadialTreeLayoutOptions) {
  const options = { ...DEFAULT_RADIAL_TREE_OPTIONS, ...radialOptions };
  const { nodeIds, outgoing, inDegree } = createAdjacency(graphData);
  const forest = buildForest(nodeIds, outgoing, inDegree, radialOptions?.rootNodeId);
  const angleSpan = Math.max(0.001, options.endAngle - options.startAngle);
  const rotation = getDirectionRotation(options.direction);
  const nodeMap = getNodeMap(graphData.nodes);
  let offsetX = 0;

  for (const treeRoot of forest) {
    const rootHierarchy = d3.hierarchy(treeRoot, (node) => node.children);
    const treeLayout = d3.tree<TreeNode>().size([angleSpan, options.radiusStep * (rootHierarchy.height + 1)]);
    treeLayout(rootHierarchy);

    const points: Array<{ id: number; x: number; y: number }> = [];
    rootHierarchy.each((node) => {
      const angle = options.startAngle + (node.x ?? 0) + rotation;
      const radius = node.y ?? 0;
      points.push({
        id: node.data.id,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      });
    });

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    for (const point of points) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
    }

    for (const point of points) {
      const node = nodeMap.get(point.id);
      if (!node) continue;
      node.x = point.x - minX + offsetX;
      node.y = point.y;
    }

    offsetX += (maxX - minX) + options.componentSpacing;
  }

  centerNodePositions(graphData.nodes);
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

        const aScore = aParents.length > 0
          ? aParents.reduce((sum, index) => sum + index, 0) / aParents.length
          : Number.POSITIVE_INFINITY;
        const bScore = bParents.length > 0
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

function getMetricValues(
  metric: ConcentricMetric,
  nodeIds: number[],
  outgoing: Map<number, number[]>,
  incoming: Map<number, number[]>,
  rootNodeId?: number
) {
  const { degree, inDegree, outDegree } = computeDegreeMaps(nodeIds, outgoing, incoming);

  if (metric === "inDegree") return inDegree;
  if (metric === "outDegree") return outDegree;
  if (metric === "bfsDepth") return computeBfsDepths(nodeIds, outgoing, incoming, rootNodeId);
  return degree;
}

function applyConcentricLayout(graphData: GraphData, concentricOptions?: ConcentricLayoutOptions) {
  const options = { ...DEFAULT_CONCENTRIC_OPTIONS, ...concentricOptions };
  const { nodeIds, outgoing, incoming } = createAdjacency(graphData);
  const nodeMap = getNodeMap(graphData.nodes);
  const degreeMap = computeDegreeMaps(nodeIds, outgoing, incoming).degree;
  const metricValues = getMetricValues(options.metric, nodeIds, outgoing, incoming, options.rootNodeId);
  const ringByNode = new Map<number, number>();
  const nodesByRing = new Map<number, number[]>();

  if (options.metric === "bfsDepth") {
    for (const nodeId of nodeIds) {
      ringByNode.set(nodeId, metricValues.get(nodeId) ?? 0);
    }
  } else {
    const uniqueValues = [...new Set(nodeIds.map((nodeId) => metricValues.get(nodeId) ?? 0))]
      .sort((a, b) => b - a);
    const ringByMetric = new Map<number, number>();
    uniqueValues.forEach((value, index) => {
      ringByMetric.set(value, index);
    });
    for (const nodeId of nodeIds) {
      const value = metricValues.get(nodeId) ?? 0;
      ringByNode.set(nodeId, ringByMetric.get(value) ?? 0);
    }
  }

  for (const nodeId of nodeIds) {
    const ring = ringByNode.get(nodeId) ?? 0;
    const ringNodes = nodesByRing.get(ring) ?? [];
    ringNodes.push(nodeId);
    nodesByRing.set(ring, ringNodes);
  }

  const rings = [...nodesByRing.keys()].sort((a, b) => a - b);
  const baseAngle = -Math.PI / 2;

  for (const ring of rings) {
    const ringNodeIds = nodesByRing.get(ring);
    if (!ringNodeIds) continue;
    const sortedRingNodes = sortNodeIdsByMode(ringNodeIds, options.sortWithinRing, nodeMap, degreeMap);
    const nodeCount = sortedRingNodes.length;

    let radius = ring === 0 ? 0 : ring * options.ringSpacing;
    if (nodeCount > 1) {
      const minRadiusForSpacing = (nodeCount * options.minRingNodeSpacing) / (2 * Math.PI);
      radius = Math.max(radius || options.ringSpacing, minRadiusForSpacing);
    }

    sortedRingNodes.forEach((nodeId, index) => {
      const node = nodeMap.get(nodeId);
      if (!node) return;

      if (nodeCount === 1 && ring === 0) {
        node.x = 0;
        node.y = 0;
        return;
      }

      const angle = baseAngle + ((2 * Math.PI * index) / nodeCount);
      node.x = Math.cos(angle) * radius;
      node.y = Math.sin(angle) * radius;
    });
  }

  centerNodePositions(graphData.nodes);
}

function applyArcLayout(graphData: GraphData, arcOptions?: ArcLayoutOptions) {
  const options = { ...DEFAULT_ARC_OPTIONS, ...arcOptions };
  const { nodeIds, outgoing, incoming } = createAdjacency(graphData);
  const nodeMap = getNodeMap(graphData.nodes);
  const degreeMap = computeDegreeMaps(nodeIds, outgoing, incoming).degree;
  const orderedIds = sortNodeIdsByMode(nodeIds, options.orderBy, nodeMap, degreeMap);

  if (options.direction === "RL") orderedIds.reverse();

  const nodeIndex = new Map<number, number>();
  orderedIds.forEach((nodeId, index) => {
    nodeIndex.set(nodeId, index);
    const node = nodeMap.get(nodeId);
    if (!node) return;
    node.x = index * options.nodeSpacing;
    node.y = 0;
  });

  for (const link of graphData.links) {
    const sourceIndex = nodeIndex.get(link.source.id);
    const targetIndex = nodeIndex.get(link.target.id);
    if (sourceIndex === undefined || targetIndex === undefined) continue;
    if (sourceIndex === targetIndex) continue;

    const distance = Math.max(1, Math.abs(sourceIndex - targetIndex));
    const magnitude = Math.max(0.25, distance * options.curveScale);
    link.curve = sourceIndex < targetIndex ? -magnitude : magnitude;
  }

  centerNodePositions(graphData.nodes);
}

function createComponentSubGraph(graphData: GraphData, nodeIds: number[]) {
  const nodeIdSet = new Set<number>(nodeIds);
  const nodes = graphData.nodes
    .filter((node) => nodeIdSet.has(node.id))
    .map((node) => ({ ...node }));
  const nodeMap = new Map<number, GraphNode>();
  for (const node of nodes) nodeMap.set(node.id, node);

  const links = graphData.links
    .filter((link) => nodeIdSet.has(link.source.id) && nodeIdSet.has(link.target.id))
    .map((link) => ({
      ...link,
      source: nodeMap.get(link.source.id)!,
      target: nodeMap.get(link.target.id)!,
    }));

  return { nodes, links } as GraphData;
}

function applyInnerComponentsLayout(
  subGraph: GraphData,
  innerLayout: ComponentsInnerLayout,
  layoutOptions?: LayoutOptions
) {
  if (innerLayout === "flow") {
    applyFlowLayout(subGraph, layoutOptions?.flow);
    return;
  }
  if (innerLayout === "tree") {
    applyTreeLayout(subGraph, layoutOptions?.tree);
    return;
  }
  if (innerLayout === "radial-tree") {
    applyRadialTreeLayout(subGraph, layoutOptions?.radialTree);
    return;
  }
  applyConcentricLayout(subGraph, layoutOptions?.concentric);
}

function getComponentsInfo(
  graphData: GraphData,
  sortBy: ComponentsSortMode
) {
  const { nodeIds, outgoing, incoming } = createAdjacency(graphData);
  const components = collectWeaklyConnectedComponents(nodeIds, outgoing, incoming);
  const info: ComponentInfo[] = components.map((componentNodeIds) => {
    const nodeSet = new Set(componentNodeIds);
    let edgeCount = 0;
    for (const link of graphData.links) {
      if (nodeSet.has(link.source.id) && nodeSet.has(link.target.id)) edgeCount += 1;
    }
    return { nodeIds: componentNodeIds, edgeCount };
  });

  info.sort((a, b) => {
    if (sortBy === "edgeCount") {
      const edgeDiff = b.edgeCount - a.edgeCount;
      if (edgeDiff !== 0) return edgeDiff;
    }
    const sizeDiff = b.nodeIds.length - a.nodeIds.length;
    if (sizeDiff !== 0) return sizeDiff;
    return a.nodeIds[0] - b.nodeIds[0];
  });

  return info;
}

function applyComponentsLayout(
  graphData: GraphData,
  componentsOptions?: ComponentsLayoutOptions,
  layoutOptions?: LayoutOptions
) {
  const options = { ...DEFAULT_COMPONENTS_OPTIONS, ...componentsOptions };
  const components = getComponentsInfo(graphData, options.sortComponentsBy);
  const maxColumns = Math.max(1, options.maxColumns);
  const globalNodeMap = getNodeMap(graphData.nodes);

  let currentColumn = 0;
  let currentX = 0;
  let currentY = 0;
  let rowHeight = 0;

  for (const component of components) {
    if (currentColumn >= maxColumns) {
      currentColumn = 0;
      currentX = 0;
      currentY += rowHeight + options.componentGap;
      rowHeight = 0;
    }

    const subGraph = createComponentSubGraph(graphData, component.nodeIds);
    applyInnerComponentsLayout(subGraph, options.innerLayout, layoutOptions);

    const bounds = getGraphBounds(subGraph.nodes);
    const width = Math.max(1, bounds.width);
    const height = Math.max(1, bounds.height);

    const shiftX = currentX - bounds.minX;
    const shiftY = currentY - bounds.minY;

    for (const node of subGraph.nodes) {
      const globalNode = globalNodeMap.get(node.id);
      if (!globalNode) continue;
      globalNode.x = (node.x ?? 0) + shiftX;
      globalNode.y = (node.y ?? 0) + shiftY;
    }

    currentX += width + options.componentGap;
    rowHeight = Math.max(rowHeight, height);
    currentColumn += 1;
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
) {
  const mode = layoutMode ?? DEFAULT_LAYOUT_MODE;

  if (mode !== "arc") {
    resetDefaultLinkCurves(graphData.links);
  }

  if (mode === "force") {
    unpinAllNodes(graphData.nodes);
    return graphData;
  }

  if (mode === "tree") {
    applyTreeLayout(graphData, layoutOptions?.tree);
  } else if (mode === "flow") {
    applyFlowLayout(graphData, layoutOptions?.flow);
  } else if (mode === "radial-tree") {
    applyRadialTreeLayout(graphData, layoutOptions?.radialTree);
  } else if (mode === "concentric") {
    applyConcentricLayout(graphData, layoutOptions?.concentric);
  } else if (mode === "components") {
    applyComponentsLayout(graphData, layoutOptions?.components, layoutOptions);
  } else if (mode === "arc") {
    applyArcLayout(graphData, layoutOptions?.arc);
  }

  pinAllNodes(graphData.nodes);
  return graphData;
}
