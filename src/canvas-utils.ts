import {
  Data,
  GraphData,
  Node,
  Link,
  GraphNode,
  GraphLink,
} from "./canvas-types.js";

const DEFAULT_NODE_SIZE = 6;

/**
 * Converts Data format to GraphData format
 * Adds runtime properties (x, y, vx, vy, fx, fy, displayName, curve)
 */
export function dataToGraphData(data: Data, position?: { x?: number, y?: number }, oldNodesMap?: Map<number, GraphNode>): GraphData {
  const nodes: GraphNode[] = data.nodes.map((node) => ({
    ...node,
    size: node.size ?? DEFAULT_NODE_SIZE,
    displayName: ["", ""] as [string, string],
    x: position?.x,
    y: position?.y,
    vx: undefined,
    vy: undefined,
    fx: undefined,
    fy: undefined,
  }));

  // Create a Map for O(1) node lookups by id
  const nodeMap = new Map<number, GraphNode>();
  nodes.forEach((node) => {
    nodeMap.set(node.id, node);
  });

  const links: GraphLink[] = data.links.map((link) => {
    const sourceNode = nodeMap.get(link.source) || oldNodesMap?.get(link.source);
    const targetNode = nodeMap.get(link.target) || oldNodesMap?.get(link.target);

    if (!sourceNode) {
      console.error(`Link with id ${link.id} has invalid source node ${link.source}.`);
    }

    if (!targetNode) {
      console.error(`Link with id ${link.id} has invalid target node ${link.target}.`);
    }

    if (!sourceNode || !targetNode) return

    return {
      ...link,
      source: sourceNode,
      target: targetNode,
      curve: 0,
    };
  }).filter((link) => link !== undefined);

  return { nodes, links };
}

/**
 * Converts GraphData format to Data format
 * Removes runtime properties (x, y, vx, vy, fx, fy, displayName, curve)
 */
export function graphDataToData(graphData: GraphData): Data {
  const nodes: Node[] = graphData.nodes.map((node) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { x, y, vx, vy, fx, fy, displayName, ...rest } = node;
    return rest;
  });

  const links: Link[] = graphData.links.map((link) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
 * Calculates the appropriate text color (black or white) based on background color brightness
 * Uses the relative luminance formula from WCAG guidelines
 * @param bgColor Background color in hex format (e.g., "#ff5733")
 * @returns "white" for dark backgrounds, "black" for light backgrounds
 */
export const getContrastTextColor = (bgColor: string): string => {
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
  return luminance > 0.5 ? 'black' : 'white';
};

export const getNodeDisplayText = (
  node: Node,
) => {
  if (node.caption && node.caption.trim().length > 0) {
    return String(node.data[node.caption]);
  }

  return String(node.id);
};

export const getNodeDisplayKey = (
  node: Node,
) => {
  if (node.caption && node.caption.trim().length > 0) {
    return node.caption;
  }

  return "id";
};

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
