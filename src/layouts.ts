import { GraphData, GraphNode, LayoutMode, LayoutOptions } from "./canvas-types.js";

type DagMode = 'td' | 'bu' | 'lr' | 'rl' | 'radialout' | 'radialin' | null;

/**
 * Maps a LayoutMode + layout options to force-graph's built-in dagMode.
 */
export function getDagMode(layoutMode: LayoutMode, options?: LayoutOptions): DagMode {
  if (layoutMode === 'force') return null;

  switch (layoutMode) {
    case 'tree': {
      const dir = options?.tree?.direction ?? 'td';
      if (dir === 'bu') return 'bu';
      if (dir === 'lr') return 'lr';
      if (dir === 'rl') return 'rl';
      return 'td';
    }
    case 'radial': {
      const dir = options?.radial?.direction ?? 'out';
      return dir === 'in' ? 'radialin' : 'radialout';
    }
    default:
      return null;
  }
}

/**
 * Returns true if the layout mode is the free-form force simulation.
 */
export function isForceLayout(layoutMode: LayoutMode): boolean {
  return layoutMode === 'force';
}

/**
 * Returns the dagLevelDistance for the layout.
 */
export function getDagLevelDistance(layoutMode: LayoutMode, options?: LayoutOptions): number | undefined {
  if (isForceLayout(layoutMode)) return undefined;
  if (layoutMode === 'radial') return options?.radial?.levelDistance ?? 80;
  return undefined; // tree uses computeTreePositions
}

/**
 * Pins all nodes at their current positions (sets fx/fy = x/y).
 */
export function pinAllNodes(nodes: GraphNode[]) {
  for (const node of nodes) {
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    node.x = x;
    node.y = y;
    node.fx = x;
    node.fy = y;
    node.vx = 0;
    node.vy = 0;
  }
}

/**
 * Unpins all nodes (clears fx/fy so forces can move them).
 */
export function unpinAllNodes(nodes: GraphNode[]) {
  for (const node of nodes) {
    node.fx = undefined;
    node.fy = undefined;
  }
}

/**
 * Computes deterministic tree positions for all nodes.
 * Parents are centered above their children. Nodes at the same layer are evenly spaced.
 * Uses a bottom-up subtree-width algorithm so deeper/wider subtrees get more horizontal space.
 *
 * @param data - The graph data (nodes + links)
 * @param options - Layout options (direction, dagLevelDistance)
 * @returns true if positions were computed, false if graph has cycles or no roots
 */
export function computeTreePositions(
  data: GraphData,
  options?: LayoutOptions
): boolean {
  const nodes = data.nodes;
  const links = data.links;
  if (nodes.length === 0) return true;

  // Read from the tree layout options
  const treeOpts = options?.tree;
  const direction = treeOpts?.direction ?? 'td';
  const baseLevelDistance = treeOpts?.levelDistance ?? 80;
  const baseNodeSpacing = treeOpts?.nodeSpacing ?? 60;

  // Ensure spacing accounts for actual node sizes
  const maxNodeSize = nodes.reduce((max, n) => Math.max(max, n.size), 0);
  const minNodeDiameter = maxNodeSize * 2;
  const nodeSpacing = Math.max(baseNodeSpacing, minNodeDiameter + 10);
  const levelDistance = Math.max(baseLevelDistance, minNodeDiameter + 10);

  // Build adjacency: parent → children (directed by link source→target)
  const childrenMap = new Map<number, number[]>();
  const incomingCount = new Map<number, number>();

  for (const node of nodes) {
    childrenMap.set(node.id, []);
    incomingCount.set(node.id, 0);
  }

  for (const link of links) {
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source as unknown as number;
    const targetId = typeof link.target === 'object' ? link.target.id : link.target as unknown as number;
    childrenMap.get(sourceId)?.push(targetId);
    incomingCount.set(targetId, (incomingCount.get(targetId) ?? 0) + 1);
  }

  // Find roots (no incoming edges)
  const roots: number[] = [];
  for (const node of nodes) {
    if ((incomingCount.get(node.id) ?? 0) === 0) {
      roots.push(node.id);
    }
  }

  // If no roots found (all nodes have incoming edges = cycle),
  // pick the node with the most outgoing edges as root
  if (roots.length === 0) {
    let bestId = nodes[0].id;
    let bestOut = 0;
    for (const node of nodes) {
      const outCount = (childrenMap.get(node.id) ?? []).length;
      if (outCount > bestOut) {
        bestOut = outCount;
        bestId = node.id;
      }
    }
    roots.push(bestId);
  }

  // BFS to assign depths and build the tree structure (handles DAGs by visiting first)
  const depth = new Map<number, number>();
  const parent = new Map<number, number | null>();
  const treeChildren = new Map<number, number[]>(); // actual tree edges (no duplicates)
  const queue: number[] = [];

  for (const root of roots) {
    depth.set(root, 0);
    parent.set(root, null);
    treeChildren.set(root, []);
    queue.push(root);
  }

  let qi = 0;
  while (qi < queue.length) {
    const nodeId = queue[qi++];
    const children = childrenMap.get(nodeId) ?? [];
    for (const childId of children) {
      if (depth.has(childId)) continue; // already visited
      depth.set(childId, (depth.get(nodeId) ?? 0) + 1);
      parent.set(childId, nodeId);
      treeChildren.set(childId, []);
      treeChildren.get(nodeId)!.push(childId);
      queue.push(childId);
    }
  }

  // Handle disconnected nodes: assign them depth 0
  for (const node of nodes) {
    if (!depth.has(node.id)) {
      depth.set(node.id, 0);
      parent.set(node.id, null);
      treeChildren.set(node.id, []);
      roots.push(node.id);
    }
  }

  // Compute subtree width (number of leaves in subtree) — bottom-up
  const subtreeWidth = new Map<number, number>();
  // Process in reverse BFS order (leaves first)
  for (let i = queue.length - 1; i >= 0; i--) {
    const nodeId = queue[i];
    const children = treeChildren.get(nodeId) ?? [];
    if (children.length === 0) {
      subtreeWidth.set(nodeId, 1);
    } else {
      let width = 0;
      for (const childId of children) {
        width += subtreeWidth.get(childId) ?? 1;
      }
      subtreeWidth.set(nodeId, width);
    }
  }

  // Assign breadth positions based on subtree widths
  // Each leaf gets 1 unit of space. Parents are centered over their children.
  const breadthPos = new Map<number, number>();

  function assignBreadth(nodeId: number, startX: number) {
    const children = treeChildren.get(nodeId) ?? [];
    if (children.length === 0) {
      // Leaf node — center in its 1-unit slot
      breadthPos.set(nodeId, startX + 0.5);
      return;
    }
    // Assign children left-to-right
    let offset = startX;
    for (const childId of children) {
      const childWidth = subtreeWidth.get(childId) ?? 1;
      assignBreadth(childId, offset);
      offset += childWidth;
    }
    // Parent = center of first and last child
    const firstChild = children[0];
    const lastChild = children[children.length - 1];
    const center = ((breadthPos.get(firstChild) ?? 0) + (breadthPos.get(lastChild) ?? 0)) / 2;
    breadthPos.set(nodeId, center);
  }

  // Layout each root's subtree side by side
  let globalOffset = 0;
  for (const root of roots) {
    assignBreadth(root, globalOffset);
    globalOffset += subtreeWidth.get(root) ?? 1;
  }

  // Center around 0
  const totalWidth = globalOffset;
  const centerOffset = totalWidth / 2;

  // Build node map for fast lookup
  const nodeMap = new Map<number, GraphNode>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  // Assign final positions based on direction
  for (const node of nodes) {
    const d = depth.get(node.id) ?? 0;
    const b = (breadthPos.get(node.id) ?? 0) - centerOffset;
    const depthCoord = d * levelDistance;
    const breadthCoord = b * nodeSpacing;

    let x: number, y: number;
    switch (direction) {
      case 'bu':
        x = breadthCoord;
        y = -depthCoord;
        break;
      case 'lr':
        x = depthCoord;
        y = breadthCoord;
        break;
      case 'rl':
        x = -depthCoord;
        y = breadthCoord;
        break;
      case 'td':
      default:
        x = breadthCoord;
        y = depthCoord;
        break;
    }

    node.x = x;
    node.y = y;
    node.fx = x;
    node.fy = y;
    node.vx = 0;
    node.vy = 0;
  }

  return true;
}

/**
 * Computes deterministic radial positions for all nodes.
 * Uses directed edges (source→target) to determine tree depth — same logic as the tree layout.
 * Each depth level forms a circle with dynamic radius based on node count.
 * Nodes are distributed using subtree-width proportional angles (yFiles-style).
 */
export function computeRadialPositions(
  data: GraphData,
  options?: LayoutOptions
): boolean {
  const nodes = data.nodes;
  const links = data.links;
  if (nodes.length === 0) return true;

  const direction = options?.radial?.direction ?? 'out';

  // Build directed adjacency: parent → children (same as tree layout)
  const childrenMap = new Map<number, number[]>();
  const incomingCount = new Map<number, number>();

  for (const node of nodes) {
    childrenMap.set(node.id, []);
    incomingCount.set(node.id, 0);
  }

  for (const link of links) {
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source as unknown as number;
    const targetId = typeof link.target === 'object' ? link.target.id : link.target as unknown as number;
    childrenMap.get(sourceId)?.push(targetId);
    incomingCount.set(targetId, (incomingCount.get(targetId) ?? 0) + 1);
  }

  // Find roots (no incoming edges)
  const roots: number[] = [];
  for (const node of nodes) {
    if ((incomingCount.get(node.id) ?? 0) === 0) {
      roots.push(node.id);
    }
  }

  // If no roots found (cycle), pick node with most outgoing edges
  if (roots.length === 0) {
    let bestId = nodes[0].id;
    let bestOut = 0;
    for (const node of nodes) {
      const outCount = (childrenMap.get(node.id) ?? []).length;
      if (outCount > bestOut) {
        bestOut = outCount;
        bestId = node.id;
      }
    }
    roots.push(bestId);
  }

  // BFS from roots following directed edges to assign depths
  const depth = new Map<number, number>();
  const treeChildren = new Map<number, number[]>();
  const queue: number[] = [];

  for (const root of roots) {
    depth.set(root, 0);
    treeChildren.set(root, []);
    queue.push(root);
  }

  let qi = 0;
  while (qi < queue.length) {
    const nodeId = queue[qi++];
    const children = childrenMap.get(nodeId) ?? [];
    for (const childId of children) {
      if (depth.has(childId)) continue; // already visited
      depth.set(childId, (depth.get(nodeId) ?? 0) + 1);
      treeChildren.set(childId, []);
      treeChildren.get(nodeId)!.push(childId);
      queue.push(childId);
    }
  }

  // Handle disconnected nodes: assign them depth 0 as additional roots
  for (const node of nodes) {
    if (!depth.has(node.id)) {
      depth.set(node.id, 0);
      treeChildren.set(node.id, []);
      roots.push(node.id);
      queue.push(node.id);
    }
  }

  // Compute subtree width for angular allocation
  const subtreeWidth = new Map<number, number>();
  for (let i = queue.length - 1; i >= 0; i--) {
    const nodeId = queue[i];
    const children = treeChildren.get(nodeId) ?? [];
    if (children.length === 0) {
      subtreeWidth.set(nodeId, 1);
    } else {
      let width = 0;
      for (const childId of children) {
        width += subtreeWidth.get(childId) ?? 1;
      }
      subtreeWidth.set(nodeId, width);
    }
  }

  // Assign angular positions using subtree widths
  const nodeAngle = new Map<number, number>();

  function assignChildAngles(parentId: number, startAngle: number, arcSpan: number) {
    const children = treeChildren.get(parentId) ?? [];
    if (children.length === 0) return;

    const parentWidth = subtreeWidth.get(parentId) ?? 1;
    let offset = startAngle;
    for (const childId of children) {
      const childWidth = subtreeWidth.get(childId) ?? 1;
      const childArc = (childWidth / parentWidth) * arcSpan;
      const childCenter = offset + childArc / 2;
      nodeAngle.set(childId, childCenter);
      assignChildAngles(childId, offset, childArc);
      offset += childArc;
    }
  }

  // All roots share the full 2π circle proportionally by subtree width
  const totalRootWidth = roots.reduce((sum, r) => sum + (subtreeWidth.get(r) ?? 1), 0);
  let rootAngleOffset = 0;
  for (const root of roots) {
    const rootWidth = subtreeWidth.get(root) ?? 1;
    const rootArc = (rootWidth / totalRootWidth) * 2 * Math.PI;
    const rootCenter = rootAngleOffset + rootArc / 2;
    nodeAngle.set(root, rootCenter);
    assignChildAngles(root, rootAngleOffset, rootArc);
    rootAngleOffset += rootArc;
  }

  // Compute dynamic radius for each depth level:
  // Each ring must be large enough to fit all its nodes with minimum spacing
  const nodeSpacing = options?.radial?.nodeSpacing ?? 10;
  const levelDistance = options?.radial?.levelDistance ?? 80;

  // Count nodes per depth and track max node size per depth
  const nodesPerDepth = new Map<number, number>();
  const maxSizePerDepth = new Map<number, number>();
  let maxDepth = 0;
  for (const node of nodes) {
    const d = depth.get(node.id) ?? 0;
    nodesPerDepth.set(d, (nodesPerDepth.get(d) ?? 0) + 1);
    const currentMax = maxSizePerDepth.get(d) ?? 0;
    if (node.size > currentMax) maxSizePerDepth.set(d, node.size);
    if (d > maxDepth) maxDepth = d;
  }

  // Effective spacing per depth = diameter of largest node + gap
  function spacingForDepth(d: number): number {
    const maxSize = maxSizePerDepth.get(d) ?? 9;
    return maxSize * 2 + nodeSpacing;
  }

  // Minimum level gap accounts for node sizes on adjacent rings and levelDistance
  function levelGap(d1: number, d2: number): number {
    const s1 = maxSizePerDepth.get(d1) ?? 9;
    const s2 = maxSizePerDepth.get(d2) ?? 9;
    return Math.max(levelDistance, s1 + s2 + nodeSpacing * 2);
  }

  // Find the minimum angular gap between any two adjacent nodes per depth.
  // This determines the actual tightest spot on each ring.
  const anglesPerDepth = new Map<number, number[]>();
  for (const node of nodes) {
    const d = depth.get(node.id) ?? 0;
    const angle = nodeAngle.get(node.id) ?? 0;
    if (!anglesPerDepth.has(d)) anglesPerDepth.set(d, []);
    anglesPerDepth.get(d)!.push(angle);
  }

  const minAngularGap = new Map<number, number>();
  for (const [d, angles] of anglesPerDepth) {
    if (angles.length <= 1) {
      minAngularGap.set(d, 2 * Math.PI); // single node, no constraint
      continue;
    }
    angles.sort((a, b) => a - b);
    let minGapAngle = 2 * Math.PI - (angles[angles.length - 1] - angles[0]); // wrap-around gap
    for (let i = 1; i < angles.length; i++) {
      const gap = angles[i] - angles[i - 1];
      if (gap < minGapAngle) minGapAngle = gap;
    }
    minAngularGap.set(d, minGapAngle);
  }

  // For a given depth, the radius must be large enough so that the tightest
  // angular gap still provides sufficient spacing: r * minAngle >= spacing
  function radiusForAngularSpacing(d: number): number {
    const spacing = spacingForDepth(d);
    const gap = minAngularGap.get(d) ?? (2 * Math.PI);
    if (gap >= 2 * Math.PI) return 0; // single node
    return spacing / gap;
  }

  // Calculate radius for each depth level
  const radiusForDepth = new Map<number, number>();

  if (direction === 'out') {
    // 'out': roots at center, deeper levels on larger rings
    const rootCount = nodesPerDepth.get(0) ?? 1;
    const rootSpacing = spacingForDepth(0);
    const rootCircleRadius = rootCount <= 1 ? 0 : Math.max(
      (rootCount * rootSpacing) / (2 * Math.PI),
      radiusForAngularSpacing(0)
    );
    radiusForDepth.set(0, rootCircleRadius);
    let prevRadius = rootCircleRadius;

    for (let d = 1; d <= maxDepth; d++) {
      const count = nodesPerDepth.get(d) ?? 0;
      const spacing = spacingForDepth(d);
      const radiusEven = (count * spacing) / (2 * Math.PI);
      const radiusAngular = radiusForAngularSpacing(d);
      const radiusForGap = prevRadius + levelGap(d - 1, d);
      const r = Math.max(radiusEven, radiusAngular, radiusForGap);
      radiusForDepth.set(d, r);
      prevRadius = r;
    }
  } else {
    // 'in': deepest nodes at center, roots on the outermost ring
    // Build from innermost (maxDepth) outward to depth 0
    const innerCount = nodesPerDepth.get(maxDepth) ?? 1;
    const innerSpacing = spacingForDepth(maxDepth);
    const minInnerRadius = levelGap(maxDepth, maxDepth) * (options?.radial?.innerRadiusMultiplier ?? 2);
    const radiusEven = (innerCount * innerSpacing) / (2 * Math.PI);
    const radiusAngular = radiusForAngularSpacing(maxDepth);
    const innerRadius = Math.max(minInnerRadius, radiusEven, radiusAngular);
    radiusForDepth.set(maxDepth, innerRadius);
    let prevRadius = innerRadius;

    for (let d = maxDepth - 1; d >= 0; d--) {
      const count = nodesPerDepth.get(d) ?? 0;
      const spacing = spacingForDepth(d);
      const radiusEven = (count * spacing) / (2 * Math.PI);
      const radiusAngular = radiusForAngularSpacing(d);
      const gap = levelGap(d, d + 1) * (options?.radial?.innerGapMultiplier ?? 1.5);
      const radiusForGap = prevRadius + gap;
      const r = Math.max(radiusEven, radiusAngular, radiusForGap);
      radiusForDepth.set(d, r);
      prevRadius = r;
    }
  }

  // Assign positions
  for (const node of nodes) {
    const d = depth.get(node.id) ?? 0;
    const angle = nodeAngle.get(node.id) ?? 0;
    const r = radiusForDepth.get(d) ?? 0;

    const x = r * Math.cos(angle - Math.PI / 2);
    const y = r * Math.sin(angle - Math.PI / 2);

    node.x = x;
    node.y = y;
    node.fx = x;
    node.fy = y;
    node.vx = 0;
    node.vy = 0;
  }

  return true;
}
