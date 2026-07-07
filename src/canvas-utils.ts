import {
  Data,
  GraphData,
  Node,
  Link,
  GraphNode,
  GraphLink,
} from "./canvas-types.js";

/** Default canvas background color */
export const DEFAULT_CANVAS_BACKGROUND = '#FFFFFF';

/** Default canvas foreground color (text, node labels, etc.) */
export const DEFAULT_CANVAS_FOREGROUND = '#1A1A1A';

/** Default link distance between connected nodes (world units) */
export const LINK_DISTANCE = 45;
/** Default node circle radius (world units) */
export const NODE_SIZE = 9;
const DEFAULT_LINK_CURVE_MULTIPLIER = 0.4;

type NodePair = [number, number];

function getPairIds(source: number, target: number): NodePair {
  if (source <= target) {
    return [source, target];
  }
  return [target, source];
}

/**
 * Calculates the curvature value for a link based on its position among parallel edges.
 * Parallel edges between the same node pair alternate above/below the straight line.
 * Self-loops get stronger curvature to form visible loops.
 *
 * @param index - The 0-based index of this link among all links between the same node pair
 * @param isSelfLoop - Whether source and target are the same node
 * @param curveMultiplier - Multiplier controlling curve intensity. Default: 0.4
 * @returns A curvature value (positive = above, negative = below the straight line)
 */
export function calculateLinkCurve(index: number, isSelfLoop: boolean, curveMultiplier = DEFAULT_LINK_CURVE_MULTIPLIER): number {
  const even = index % 2 === 0;

  if (isSelfLoop) {
    if (even) {
      return (Math.floor(-(index / 2)) - 3) * curveMultiplier;
    }
    return (Math.floor((index + 1) / 2) + 2) * curveMultiplier;
  }

  if (even) {
    return Math.floor(-(index / 2)) * curveMultiplier;
  }
  return Math.floor((index + 1) / 2) * curveMultiplier;
}

/**
 * Applies circular layout to nodes (neo4j-style)
 * Only positions nodes that haven't been positioned yet
 */
function circularLayout(nodes: GraphNode[], center: { x: number; y: number }, radius: number): void {
  const unlocatedNodes = nodes.filter(node => !node.initialPositionCalculated);

  unlocatedNodes.forEach((node, i) => {
    node.x = center.x + radius * Math.sin((2 * Math.PI * i) / unlocatedNodes.length);
    node.y = center.y + radius * Math.cos((2 * Math.PI * i) / unlocatedNodes.length);
    node.initialPositionCalculated = true;
  });
}

/**
 * Converts Data format to GraphData format
 * Adds runtime properties (x, y, vx, vy, fx, fy, displayName, curve)
 */
export function dataToGraphData(
  data: Data,
  position?: { x?: number, y?: number },
  oldNodesMap?: Map<number, GraphNode>,
  curveMultiplier?: number
): GraphData {
  const nodes: GraphNode[] = data.nodes.map((node) => {
    const oldNode = oldNodesMap?.get(node.id);
    // Reuse the original node object if it exists — preserves object identity
    // so that links resolved against this array point to the same objects in the graph
    if (oldNode) {
      if (oldNode.expand[0] !== (node.expand ?? false)) {
        oldNode.expand = [node.expand ?? false, new Date()];
      }
      // Always sync mutable fields so callers can update color, visibility, borderColor,
      // and arbitrary data (e.g. isPath / isPathSelected) without losing position.
      oldNode.color = node.color ?? oldNode.color;
      oldNode.borderColor = node.borderColor;
      oldNode.visible = node.visible ?? oldNode.visible;
      oldNode.data = node.data ?? oldNode.data;

      return oldNode;
    }

    return {
      ...node,
      size: node.size ?? NODE_SIZE,
      expand: [node.expand ?? false, new Date(0)],
      displayName: ["", ""] as [string, string],
      x: position?.x,
      y: position?.y,
      vx: undefined,
      vy: undefined,
      fx: undefined,
      fy: undefined,
      initialPositionCalculated: false,
    };
  });

  // Apply circular layout to nodes that haven't been positioned yet
  const radius = (nodes.length * LINK_DISTANCE) / (Math.PI * 2);
  const center = { x: 0, y: 0 };
  circularLayout(nodes, center, radius);

  // Create a Map for O(1) node lookups by id
  const nodeMap = new Map<number, GraphNode>();
  nodes.forEach((node) => {
    nodeMap.set(node.id, node);
  });

  const linksByPairCount = new Map<number, Map<number, number>>();

  const links: GraphLink[] = data.links.map((link) => {
    const sourceNode = nodeMap.get(link.source) || oldNodesMap?.get(link.source);
    const targetNode = nodeMap.get(link.target) || oldNodesMap?.get(link.target);

    if (!sourceNode) {
      console.error(`Link with id ${link.id} has invalid source node ${link.source}.`);
    }

    if (!targetNode) {
      console.error(`Link with id ${link.id} has invalid target node ${link.target}.`);
    }

    if (!sourceNode || !targetNode) return undefined;

    const [pairMinId, pairMaxId] = getPairIds(sourceNode.id, targetNode.id);
    let pairMap = linksByPairCount.get(pairMinId);

    if (!pairMap) {
      pairMap = new Map<number, number>();
      linksByPairCount.set(pairMinId, pairMap);
    }

    const duplicateIndex = pairMap.get(pairMaxId) ?? 0;
    pairMap.set(pairMaxId, duplicateIndex + 1);

    return {
      ...link,
      source: sourceNode,
      target: targetNode,
      curve: calculateLinkCurve(duplicateIndex, sourceNode.id === targetNode.id, curveMultiplier),
    };
  }).filter((link) => link !== undefined);

  return { nodes, links };
}

/**
 * Converts GraphData format to Data format
 * Removes runtime properties (x, y, layoutTargetX, layoutTargetY, vx, vy, fx, fy, displayName, curve)
 * Preserves the expand boolean so the state survives round-trips through dataToGraphData.
 */
export function graphDataToData(graphData: GraphData): Data {
  const nodes: Node[] = graphData.nodes.map((node) => {
    const { x, y, layoutTargetX, layoutTargetY, vx, vy, fx, fy, displayName, expand, ...rest } = node;
    return { ...rest, expand: expand[0] };
  });

  const links: Link[] = graphData.links.map((link) => {
    const { curve, source, target, ...rest } = link;
    return {
      ...rest,
      source: source.id,
      target: target.id,
    };
  });

  return { nodes, links };
}

/**
 * Resolves which data property key to use as the node caption/label.
 * Iterates through captionKeys in order and returns the first key that
 * matches a non-empty property in node.data.
 *
 * @param node - The node to resolve caption for
 * @param captionKeys - Ordered list of [key, exactMatch] tuples to try
 * @returns The matched key pair, or null if no keys match
 */
const resolveNodeCaption = (
  node: Node | GraphNode,
  captionKeys: [string, boolean][]
): { requestedKey: string; actualKey: string } | null => {
  for (const [requestedKey, exactMatch] of captionKeys) {
    const dataKeys = Object.keys(node.data);
    const matchedKey = dataKeys.find((dk) =>
      exactMatch
        ? dk === requestedKey
        : dk.toLowerCase().includes(requestedKey.toLowerCase())
    );
    if (
      matchedKey &&
      String(node.data[matchedKey]).trim().length > 0
    ) {
      return { requestedKey, actualKey: matchedKey };
    }
  }
  return null;
};

/**
 * Calculates the appropriate text color (black or white) based on background color brightness
 * Uses the relative luminance formula from WCAG guidelines
 * @param bgColor Background color in hex format (e.g., "#ff5733")
 * @returns "white" for dark backgrounds, "black" for light backgrounds
 */
export const getContrastTextColor = (bgColor: string, threshold = 0.5): string => {
  let r: number;
  let g: number;
  let b: number;

  // Handle HSL colors
  if (bgColor.startsWith('hsl')) {
    // Parse HSL: hsl(h, s%, l%)
    const hslMatch = bgColor.match(/hsl\((\d+),\s*([\d.]+)%,\s*([\d.]+)%\)/);
    if (hslMatch) {
      const h = parseInt(hslMatch[1], 10) / 360;
      const s = parseFloat(hslMatch[2]) / 100;
      const l = parseFloat(hslMatch[3]) / 100;

      // Convert HSL to RGB
      const hue2rgb = (p: number, q: number, tParam: number) => {
        let t = tParam;
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };

      if (s === 0) {
        r = l;
        g = l;
        b = l; // achromatic
      } else {
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
      }
    } else {
      // Fallback if parsing fails
      return 'white';
    }
  } else {
    // Handle hex colors
    let hex = bgColor.replace('#', '');
    // Support 3-digit shorthand hex codes
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    r = parseInt(hex.substring(0, 2), 16) / 255;
    g = parseInt(hex.substring(2, 4), 16) / 255;
    b = parseInt(hex.substring(4, 6), 16) / 255;
  }

  // Calculate relative luminance
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  // Return white for dark backgrounds, black for light backgrounds
  return luminance > threshold ? 'black' : 'white';
};

/**
 * Returns the display text for a node based on the configured captionsKeys.
 * Tries each key in order; falls back to the node ID if none match.
 *
 * @param node - The node to get display text for
 * @param captionKeys - Ordered list of [key, exactMatch] tuples
 * @param showPropertyKeyPrefix - When true, prepends the key name (e.g. "name: Foo")
 * @returns The resolved display string
 */
export const getNodeDisplayText = (
  node: Node | GraphNode,
  captionKeys: [string, boolean][],
  showPropertyKeyPrefix: boolean
) => {
  const caption = resolveNodeCaption(node, captionKeys);

  if (caption) {
    const { requestedKey, actualKey } = caption;
    const value = String(node.data[actualKey]);
    return showPropertyKeyPrefix ? `${requestedKey}: ${value}` : value;
  }

  return showPropertyKeyPrefix ? `ID: ${String(node.id)}` : String(node.id);
};

/**
 * Returns the actual data property key used for a node's display text.
 * Useful for determining which property is currently being shown.
 *
 * @param node - The node to check
 * @param captionKeys - Ordered list of [key, exactMatch] tuples
 * @returns The matched property key name, or "id" if no keys match
 */
export const getNodeDisplayKey = (
  node: Node | GraphNode,
  captionKeys: [string, boolean][]
) => {
  const caption = resolveNodeCaption(node, captionKeys);
  return caption?.actualKey || "id";
}

/**
 * Wraps text into two lines with ellipsis handling for circular nodes
 */
export const wrapTextForCircularNode = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxRadius: number
): [string, string] => {
  const ellipsis = "...";
  const ellipsisWidth = ctx.measureText(ellipsis).width;
  const halfTextHeight = 1.125;
  const availableRadius = Math.sqrt(
    Math.max(0, maxRadius * maxRadius - halfTextHeight * halfTextHeight)
  );
  const lineWidth = availableRadius * 2;

  const words = text.split(/\s+/);
  let line1 = "";
  let line2 = "";

  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    const testLine = line1 ? `${line1} ${word}` : word;
    const testWidth = ctx.measureText(testLine).width;

    if (testWidth <= lineWidth) {
      line1 = testLine;
    } else if (!line1) {
      let partialWord = word;
      while (
        partialWord.length > 0 &&
        ctx.measureText(partialWord).width > lineWidth
      ) {
        partialWord = partialWord.slice(0, -1);
      }
      line1 = partialWord;
      const remainingWords = [
        word.slice(partialWord.length),
        ...words.slice(i + 1),
      ];
      line2 = remainingWords.join(" ");
      break;
    } else {
      line2 = words.slice(i).join(" ");
      break;
    }
  }

  if (line2 && ctx.measureText(line2).width > lineWidth) {
    while (
      line2.length > 0 &&
      ctx.measureText(line2).width + ellipsisWidth > lineWidth
    ) {
      line2 = line2.slice(0, -1);
    }
    line2 += ellipsis;
  }

  return [line1, line2 || ""];
};
