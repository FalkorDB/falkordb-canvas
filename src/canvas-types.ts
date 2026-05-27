import { NodeObject } from "force-graph";

// ─── Style & Behavior Sub-Configs ────────────────────────────────────────────

/** Visual style for nodes */
export interface NodeStyleConfig {
  /** Font family for node labels. Default: 'SofiaSans' */
  fontFamily?: string;
  /** Font weight when node is not selected. Default: 400 */
  fontWeightUnselected?: number;
  /** Font weight when node is selected. Default: 700 */
  fontWeightSelected?: number;
  /**
   * Fixed font size for node labels (world units).
   * When set, text uses this exact size (no auto-scaling).
   * Ignored when textFillRatio is set (textFillRatio takes precedence).
   */
  fontSize?: number;
  /**
   * Fraction of node radius that text fills (0–1). Default: 0.85.
   * Text auto-scales to fit inside the node circle at this fill ratio.
   * Takes precedence over fontSize when set.
   * Set to undefined/null and provide fontSize for fixed-size text.
   */
  textFillRatio?: number;
  /** Stroke width when node is selected. Default: 1 */
  strokeWidthSelected?: number;
  /** Stroke width when node is not selected. Default: 0.5 */
  strokeWidthUnselected?: number;
  /** Glow effect duration in ms after expand/collapse. Default: 10000 */
  glowDuration?: number;
  /** Glow spread radius in px. Default: 12 */
  glowSpread?: number;
  /** Number of gradient rings in glow. Default: 16 */
  glowSteps?: number;
  /** Glow color as [r, g, b]. Default: [59, 130, 246] (blue) */
  glowColor?: [number, number, number];
  /** Glow maximum opacity (0–1). Default: 0.6 */
  glowMaxOpacity?: number;
}

/** Visual style for links/edges */
export interface LinkStyleConfig {
  /** Font family for link labels. Default: 'SofiaSans' */
  fontFamily?: string;
  /** Font size for link labels (world units). Default: 2 */
  fontSize?: number;
  /** Font weight when link is not selected. Default: 400 */
  fontWeightUnselected?: number;
  /** Font weight when link is selected. Default: 700 */
  fontWeightSelected?: number;
  /** Line width when selected (before dividing by globalScale). Default: 2 */
  lineWidthSelected?: number;
  /** Line width when not selected (before dividing by globalScale). Default: 1 */
  lineWidthUnselected?: number;
  /** Arrow length when selected. Default: 16 */
  arrowLengthSelected?: number;
  /** Arrow length when not selected. Default: 8 */
  arrowLengthUnselected?: number;
  /** Arrow width-to-height ratio. Default: 1.6 */
  arrowWidthRatio?: number;
  /** Arrow notch depth ratio. Default: 0.2 */
  arrowNotchRatio?: number;
  /** Self-loop curve factor. Default: 11.67 */
  selfLoopCurveFactor?: number;
  /** Parallel edge curve multiplier. Default: 0.4 */
  parallelEdgeCurveMultiplier?: number;
  /** Label background padding (world units). Default: 0.3 */
  labelBackgroundPadding?: number;
  /** Gap between edge tip and visible node border (in px). Default: 2 */
  edgeGap?: number;
}

/** Force simulation parameters */
export interface SimulationConfig {
  /** Center force strength (X and Y). Default: 0.03 */
  centerStrength?: number;
  /** Charge strength for node repulsion. Default: -400 */
  chargeStrength?: number;
  /** Velocity decay (damping). Default: 0.4 */
  velocityDecay?: number;
  /** Alpha min (convergence stop threshold). Default: 0.05 */
  alphaMin?: number;
  /** Number of warmup ticks for force simulation. Default: 300 */
  warmupTicks?: number;
}

/** Interaction / UX parameters */
export interface InteractionConfig {
  /** Tooltip font size in px. Default: 12 */
  tooltipFontSize?: number;
  /** Tooltip padding CSS value. Default: '4px 8px' */
  tooltipPadding?: string;
  /** Tooltip border radius CSS value. Default: '4px' */
  tooltipBorderRadius?: string;
  /** Tooltip z-index. Default: 1000 */
  tooltipZIndex?: number;
  /** Zoom-to-fit padding as fraction of smallest dimension. Default: 0.1 */
  zoomToFitPadding?: number;
  /** Delay (ms) before zoom-to-fit after layout change. Default: 50 */
  zoomToFitDelay?: number;
  /** Link pointer hit-test width in screen px. Default: 10 */
  linkHitWidth?: number;
  /** Luminance threshold for switching to dark text on light nodes. Default: 0.5 */
  contrastThreshold?: number;
}



/**
 * Configuration for large-graph rendering optimisations.
 * All options are optional; the feature is enabled by default (`enabled: true`).
 */
export interface LargeGraphConfig {
  /**
   * Master switch. When `true` (default) viewport culling and low-zoom
   * optimisations are active.
   */
  enabled?: boolean;

  /**
   * Extra padding added around the visible viewport (in world-space units) when
   * deciding whether a node or link is offscreen.  Increase this to pre-render
   * elements just outside the visible area and avoid pop-in during fast panning.
   * Default: `0`.
   */
  viewportPadding?: number;

  /**
   * Zoom level below which expensive per-element details are skipped.
   * When the current zoom (k) drops to or below this value, labels and arrows
   * are hidden to improve rendering performance.
   * `0.5` = skip at half zoom, `0.3` = skip only when very zoomed out.
   * Default: `1`.
   */
  lowZoomThreshold?: number;

  /**
   * Skip drawing node labels when zoomed out beyond `lowZoomThreshold`.
   * Node circles are still drawn so the graph shape remains visible.
   * Default: `true`.
   */
  skipLabelsAtLowZoom?: boolean;

  /**
   * Skip drawing link arrowheads when zoomed out beyond `lowZoomThreshold`.
   * Default: `true`.
   */
  skipArrowsAtLowZoom?: boolean;

  /**
   * Skip drawing link relationship labels when zoomed out beyond `lowZoomThreshold`.
   * Default: `true`.
   */
  skipLinkLabelsAtLowZoom?: boolean;
}

/** Event handler callbacks */
export interface EventHandlers {
  onNodeClick?: (node: GraphNode, event: MouseEvent) => void;
  onLinkClick?: (link: GraphLink, event: MouseEvent) => void;
  onNodeRightClick?: (node: GraphNode, event: MouseEvent) => void;
  onLinkRightClick?: (link: GraphLink, event: MouseEvent) => void;
  onNodeHover?: (node: GraphNode | null) => void;
  onNodeDragEnd?: (node: GraphNode) => void;
  onPinChange?: (pinned: boolean) => void;
  onLinkHover?: (link: GraphLink | null) => void;
  onBackgroundClick?: (event: MouseEvent) => void;
  onBackgroundRightClick?: (event: MouseEvent) => void;
  onZoom?: (transform: Transform) => void;
  onEngineStop?: () => void;
  onLayoutChange?: (layout: LayoutMode) => void;
}

export interface ForceGraphConfig {
  // ─── Dimensions & Colors ─────────────────────────────────────────────────────
  width?: number;
  height?: number;
  backgroundColor?: string;
  foregroundColor?: string;

  // ─── Layout ──────────────────────────────────────────────────────────────────
  layoutMode?: LayoutMode;
  layoutOptions?: LayoutOptions;

  // ─── Style Sub-Configs ───────────────────────────────────────────────────────
  /** Node visual style configuration */
  nodeStyle?: NodeStyleConfig;
  /** Link/edge visual style configuration */
  linkStyle?: LinkStyleConfig;
  /** Force simulation tuning */
  simulation?: SimulationConfig;
  /** Interaction / UX parameters */
  interaction?: InteractionConfig;
  /** Large-graph rendering optimisations (viewport culling and low-zoom draw skipping). */
  largeGraph?: LargeGraphConfig;

  // ─── Display Options ─────────────────────────────────────────────────────────
  animation?: boolean;
  captionsKeys?: Array<string | [string, boolean]>;
  showPropertyKeyPrefix?: boolean;
  pinOnDragEnd?: boolean;

  // ─── Selection & Custom Rendering ────────────────────────────────────────────
  isLinkSelected?: (link: GraphLink) => boolean;
  isNodeSelected?: (node: GraphNode) => boolean;
  linkLineDash?: (link: GraphLink) => number[];
  node?: {
    nodeCanvasObject: (node: GraphNode, ctx: CanvasRenderingContext2D) => void;
    nodePointerAreaPaint: (node: GraphNode, color: string, ctx: CanvasRenderingContext2D) => void;
  };
  link?: {
    linkCanvasObject: (link: GraphLink, ctx: CanvasRenderingContext2D, globalScale: number) => void;
    linkPointerAreaPaint: (link: GraphLink, color: string, ctx: CanvasRenderingContext2D) => void;
  };

  // ─── Event Handlers ──────────────────────────────────────────────────────────
  /** Event handler callbacks */
  eventHandlers?: EventHandlers;
}

export interface InternalForceGraphConfig extends Omit<ForceGraphConfig, 'backgroundColor' | 'foregroundColor' | 'captionsKeys' | 'showPropertyKeyPrefix' | 'layoutMode' | 'layoutOptions' | 'pinOnDragEnd' | 'nodeStyle' | 'linkStyle' | 'simulation' | 'interaction' | 'largeGraph'> {
  backgroundColor: string;
  foregroundColor: string;
  captionsKeys: [string, boolean][];
  showPropertyKeyPrefix: boolean;
  layoutMode: LayoutMode;
  layoutOptions: LayoutOptions;
  pinOnDragEnd: boolean;
  nodeStyle: Required<NodeStyleConfig>;
  linkStyle: Required<LinkStyleConfig>;
  simulation: Required<SimulationConfig>;
  interaction: Required<InteractionConfig>;
  largeGraph: Required<LargeGraphConfig>;
}

export type LayoutMode = 'force' | 'tree' | 'radial';

/** Directions for tree layout */
export type HierarchyDirection = 'td' | 'bu' | 'lr' | 'rl';

/** Directions for radial layout */
export type RadialDirection = 'out' | 'in';

/** All possible layout directions */
export type LayoutDirection = HierarchyDirection | RadialDirection;

/** Options for tree layout */
export interface HierarchyLayoutOptions {
  /** Direction of the hierarchy. Default: 'td' */
  direction?: HierarchyDirection;
  /** Distance between levels (inter-layer spacing). Default: 80 */
  levelDistance?: number;
  /** Minimum gap between sibling nodes (world-space units). Default: 60 */
  nodeSpacing?: number;
}

/** Options specific to radial layout */
export interface RadialLayoutOptions {
  /** Direction of the radial expansion. Default: 'out' */
  direction?: RadialDirection;
  /** Minimum distance between rings (inter-level spacing). Default: 80 */
  levelDistance?: number;
  /** Minimum gap between sibling nodes on the same ring (world-space units). Default: 10 */
  nodeSpacing?: number;
  /** Inner-radius minimum multiplier for 'in' direction. Default: 2 */
  innerRadiusMultiplier?: number;
  /** Inter-ring gap multiplier for 'in' direction. Default: 1.5 */
  innerGapMultiplier?: number;
}

/** Options specific to force layout */
export interface ForceLayoutOptions {
  /** Base link distance (added to node sizes). Default: 45 */
  linkDistance?: number;
  /** Extra padding around nodes for collision detection. Default: 25 */
  collisionPadding?: number;
}

/** Combined layout options with per-layout sections */
export interface LayoutOptions {
  tree?: HierarchyLayoutOptions;
  radial?: RadialLayoutOptions;
  force?: ForceLayoutOptions;
}

export type GraphNode = NodeObject & {
  id: number;
  labels: string[];
  visible: boolean;
  expand: [boolean, Date];
  displayName: [string, string];
  color: string;
  size: number;
  data: {
    [key: string]: any;
  };
  x?: number;
  y?: number;
  layoutTargetX?: number;
  layoutTargetY?: number;
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
    [key: string]: any;
  };
};

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export type Node = Omit<
  GraphNode,
  "x" | "y" | "layoutTargetX" | "layoutTargetY" | "vx" | "vy" | "fx" | "fy" | "initialPositionCalculated" | "displayName" | "size" | "expand"
> & {
  size?: number;
  expand?: boolean;
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
