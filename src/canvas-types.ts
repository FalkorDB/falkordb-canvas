import { NodeObject } from "force-graph";

export interface ForceGraphConfig {
  width?: number;
  height?: number;
  backgroundColor?: string;
  foregroundColor?: string;
  onNodeClick?: (node: GraphNode, event: MouseEvent) => void;
  onLinkClick?: (link: GraphLink, event: MouseEvent) => void;
  onNodeRightClick?: (node: GraphNode, event: MouseEvent) => void;
  onLinkRightClick?: (link: GraphLink, event: MouseEvent) => void;
  onNodeHover?: (node: GraphNode | null) => void;
  onLinkHover?: (link: GraphLink | null) => void;
  onBackgroundClick?: (event: MouseEvent) => void;
  onBackgroundRightClick?: (event: MouseEvent) => void;
  onZoom?: (transform: Transform) => void;
  onEngineStop?: () => void;
  onLoadingChange?: (loading: boolean) => void;
  cooldownTicks?: number | undefined;
  cooldownTime?: number;
  autoStopOnSettle?: boolean;
  captionsKeys?: string[];
  showPropertyKeyPrefix?: boolean;
  isLinkSelected?: (link: GraphLink) => boolean;
  isNodeSelected?: (node: GraphNode) => boolean;
  linkLineDash?: (link: GraphLink) => number[] | null;
  isLoading?: boolean;
  node?: {
    nodeCanvasObject: (node: GraphNode, ctx: CanvasRenderingContext2D) => void;
    nodePointerAreaPaint: (node: GraphNode, color: string, ctx: CanvasRenderingContext2D) => void;
  };
  link?: {
    linkCanvasObject: (link: GraphLink, ctx: CanvasRenderingContext2D) => void;
    linkPointerAreaPaint: (link: GraphLink, color: string, ctx: CanvasRenderingContext2D) => void;
  };
}

export interface InternalForceGraphConfig extends Omit<ForceGraphConfig, 'backgroundColor' | 'foregroundColor' | 'captionsKeys' | 'showPropertyKeyPrefix'> {
  backgroundColor: string;
  foregroundColor: string;
  captionsKeys: string[];
  showPropertyKeyPrefix: boolean;
}

export type GraphNode = NodeObject & {
  id: number;
  labels: string[];
  visible: boolean;
  displayName: [string, string];
  color: string;
  size: number;
  data: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
  };
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number;
  fy?: number;
  initialPositionCalculated?: boolean;
};

export type GraphLink = {
  id: number;
  relationship: string;
  source: GraphNode;
  target: GraphNode;
  visible: boolean;
  color: string;
  curve: number;
  data: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
  };
};

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export type Node = Omit<
  GraphNode,
  "x" | "y" | "vx" | "vy" | "fx" | "fy" | "initialPositionCalculated" | "displayName" | "size"
> & {
  size?: number;
}

export type Link = Omit<GraphLink, "curve" | "source" | "target"> & {
  source: number;
  target: number;
};

export interface Data {
  nodes: Node[];
  links: Link[];
}

export type ViewportState = {
  zoom: number;
  centerX: number;
  centerY: number;
} | undefined;

export type Transform = { k: number, x: number, y: number };

export type CanvasRenderMode = 'before' | 'after' | 'replace';

// Force graph instance type from force-graph library
// The instance is created by calling ForceGraph as a function with a container element
export type ForceGraphInstance = import("force-graph").default<GraphNode, GraphLink> | undefined;
