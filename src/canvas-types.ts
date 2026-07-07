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
  /**
   * Maximum distance for charge force interaction. Nodes beyond this distance don't repel.
   * - `number`: fixed value (e.g. 1500)
   * - `"auto"`: automatically calculated based on node count (sqrt(nodeCount) * 30)
   * - `undefined` / not set: disabled (Infinity — no limit)
   * Default: disabled.
   */
  chargeDistanceMax?: number | "auto";
  /**
   * Node count above which collision force is disabled for performance.
   * - `number`: threshold (e.g. 3000 — disable collide when nodes > 3000)
   * - `0` or `undefined` / not set: never disable
   * Default: disabled (0).
   */
  disableCollisionAbove?: number;
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
  /** Maximum zoom level after zoomToFit (prevents over-zoom on few nodes). Default: 8 */
  zoomToFitMaxZoom?: number;
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

/** Event handler callbacks for user interactions with the graph */
export interface EventHandlers {
  /** Fired when a node is left-clicked */
  onNodeClick?: (node: GraphNode, event: MouseEvent) => void;
  /** Fired when a link/edge is left-clicked */
  onLinkClick?: (link: GraphLink, event: MouseEvent) => void;
  /** Fired when a node is right-clicked */
  onNodeRightClick?: (node: GraphNode, event: MouseEvent) => void;
  /** Fired when a link/edge is right-clicked */
  onLinkRightClick?: (link: GraphLink, event: MouseEvent) => void;
  /** Fired when a node is hovered (null when hover leaves) */
  onNodeHover?: (node: GraphNode | null) => void;
  /** Fired when a node drag ends */
  onNodeDragEnd?: (node: GraphNode) => void;
  /** Fired when pin state changes (nodes pinned/unpinned) */
  onPinChange?: (pinned: boolean) => void;
  /** Fired when a link is hovered (null when hover leaves) */
  onLinkHover?: (link: GraphLink | null) => void;
  /** Fired when the canvas background is left-clicked */
  onBackgroundClick?: (event: MouseEvent) => void;
  /** Fired when the canvas background is right-clicked */
  onBackgroundRightClick?: (event: MouseEvent) => void;
  /** Fired on zoom/pan with the current transform */
  onZoom?: (transform: Transform) => void;
  /** Fired when the force simulation finishes (engine stops) */
  onEngineStop?: () => void;
  /** Fired when the layout mode changes */
  onLayoutChange?: (layout: LayoutMode) => void;
}

/**
 * Main configuration object for the FalkorDB Canvas graph visualization.
 * All properties are optional — unset values use sensible defaults.
 */
export interface ForceGraphConfig {
  // ─── Dimensions & Colors ─────────────────────────────────────────────────────
  /** Canvas width in pixels. Auto-detected from container if not set. */
  width?: number;
  /** Canvas height in pixels. Auto-detected from container if not set. */
  height?: number;
  /** Canvas background color (CSS color string). Default: '#222222' */
  backgroundColor?: string;
  /** Foreground color for strokes and labels (CSS color string). Default: '#f0f0f0' */
  foregroundColor?: string;

  // ─── Layout ──────────────────────────────────────────────────────────────────
  /** Active layout algorithm: 'force' (physics), 'tree' (hierarchical), or 'radial' (circular rings). Default: 'force' */
  layoutMode?: LayoutMode;
  /** Per-layout-mode options (tree direction/spacing, radial direction/spacing, force link distance). */
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
  /** Enable/disable force simulation animation. When false, nodes are pinned in place. */
  animation?: boolean;
  /**
   * Ordered list of data property keys to use as node label text.
   * Each entry is either a plain string (fuzzy match, case-insensitive) or a
   * `[key, exactMatch]` tuple. The first matching non-empty property is used.
   * Falls back to `node.id` if no keys match.
   * @example ["name", "title"] — tries 'name' first, then 'title'
   * @example [["Name", true]] — exact match only for 'Name'
   */
  captionsKeys?: Array<string | [string, boolean]>;
  /** When true, display the property key prefix before the value in labels (e.g. "name: Foo"). Default: false */
  showPropertyKeyPrefix?: boolean;
  /** When true, nodes stay pinned at their position after being dragged. Default: false */
  pinOnDragEnd?: boolean;

  // ─── Selection & Custom Rendering ────────────────────────────────────────────
  /** Predicate that returns true if a link should be rendered in its "selected" style */
  isLinkSelected?: (link: GraphLink) => boolean;
  /** Predicate that returns true if a node should be rendered in its "selected" style */
  isNodeSelected?: (node: GraphNode) => boolean;
  /**
   * Predicate that returns true if a node should be rendered dimmed (reduced opacity).
   * Used to implement focus mode — all elements not in the focused set are dimmed.
   */
  isNodeDimmed?: (node: GraphNode) => boolean;
  /**
   * Predicate that returns true if a link should be rendered dimmed (reduced opacity).
   * Used to implement focus mode — all elements not in the focused set are dimmed.
   */
  isLinkDimmed?: (link: GraphLink) => boolean;
  /**
   * Opacity multiplier applied to dimmed nodes and links (0–1). Default: 0.15.
   */
  dimOpacity?: number;
  /**
   * Master switch for the dim/focus effect. When `false` (default), `isNodeDimmed`
   * and `isLinkDimmed` are never evaluated — the canvas renders at full opacity.
   * Set to `true` to activate focus mode dimming.
   */
  dimmed?: boolean;
  /** Returns a dash pattern array for a given link (use [] for solid lines) */
  linkLineDash?: (link: GraphLink) => number[];
  /** Custom node rendering overrides. When provided, replaces the built-in node drawing. */
  node?: {
    /** Custom draw function for nodes on the canvas */
    nodeCanvasObject: (node: GraphNode, ctx: CanvasRenderingContext2D) => void;
    /** Custom hit-area painting for pointer detection on nodes */
    nodePointerAreaPaint: (node: GraphNode, color: string, ctx: CanvasRenderingContext2D) => void;
  };
  /** Custom link rendering overrides. When provided, replaces the built-in link drawing. */
  link?: {
    /** Custom draw function for links on the canvas */
    linkCanvasObject: (link: GraphLink, ctx: CanvasRenderingContext2D, globalScale: number) => void;
    /** Custom hit-area painting for pointer detection on links */
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

/** Layout algorithm mode: 'force' (physics-based), 'tree' (hierarchical DAG), or 'radial' (concentric rings) */
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

/**
 * Internal graph node representation used by the canvas during rendering.
 * Extends force-graph's NodeObject with graph-specific properties.
 */
export type GraphNode = NodeObject & {
  /** Unique numeric identifier for the node */
  id: number;
  /** Node labels/categories (e.g. ['Person', 'Employee']) */
  labels: string[];
  /** Whether this node is currently visible on the canvas */
  visible: boolean;
  /** Expand state: [isExpanded, timestampOfLastToggle] — used for glow animation */
  expand: [boolean, Date];
  /** Cached two-line display text computed from captionsKeys */
  displayName: [string, string];
  /** Fill color for the node circle (CSS color string) */
  color: string;
  /** Border stroke color for the node (CSS color string, optional — overrides config.borderColor if set) */
  borderColor?: string;
  /** Radius of the node circle in world units */
  size: number;
  /** Arbitrary key-value properties on the node (used for label resolution via captionsKeys) */
  data: {
    [key: string]: any;
  };
  /** Current x position (world coordinates) */
  x?: number;
  /** Current y position (world coordinates) */
  y?: number;
  /** Target x position for animated layout transitions */
  layoutTargetX?: number;
  /** Target y position for animated layout transitions */
  layoutTargetY?: number;
  /** x velocity (force simulation) */
  vx?: number;
  /** y velocity (force simulation) */
  vy?: number;
  /** Fixed x position (pinned node) — set to pin, undefined to unpin */
  fx?: number;
  /** Fixed y position (pinned node) — set to pin, undefined to unpin */
  fy?: number;
  /** Whether this node has already been positioned by the initial layout pass */
  initialPositionCalculated?: boolean;
};

/**
 * Internal graph link/edge representation used by the canvas during rendering.
 */
export type GraphLink = {
  /** Unique numeric identifier for the link */
  id: number;
  /** Relationship type label (e.g. 'CALLS', 'DEFINES') */
  relationship: string;
  /** Source node (resolved reference) */
  source: GraphNode;
  /** Target node (resolved reference) */
  target: GraphNode;
  /** Whether this link is currently visible on the canvas */
  visible: boolean;
  /** Stroke color for the link line (CSS color string) */
  color: string;
  /** Curvature value for parallel edges and self-loops */
  curve: number;
  /** Arbitrary key-value properties on the link */
  data: {
    [key: string]: any;
  };
};

/** Internal graph data structure with resolved node/link references (used during rendering) */
export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

/**
 * Public node type for input data. Contains user-supplied properties
 * without the internal rendering state (positions, velocities, etc.).
 */
export type Node = Omit<
  GraphNode,
  "x" | "y" | "layoutTargetX" | "layoutTargetY" | "vx" | "vy" | "fx" | "fy" | "initialPositionCalculated" | "displayName" | "size" | "expand"
> & {
  /** Optional node radius override (defaults to built-in NODE_SIZE) */
  size?: number;
  /** Whether the node is in an expanded state (triggers glow animation on change) */
  expand?: boolean;
}

/**
 * Public link type for input data. References nodes by numeric ID
 * rather than resolved object references.
 */
export type Link = Omit<GraphLink, "curve" | "source" | "target"> & {
  /** Source node ID */
  source: number;
  /** Target node ID */
  target: number;
};

/** Public graph data structure passed to setData/setGraphData. Nodes reference each other by ID. */
export interface Data {
  nodes: Node[];
  links: Link[];
}

/** Captured viewport state (zoom level and center position) for save/restore */
export type ViewportState = {
  /** Current zoom level */
  zoom: number;
  /** X coordinate of the viewport center (world units) */
  centerX: number;
  /** Y coordinate of the viewport center (world units) */
  centerY: number;
} | undefined;

/** D3 zoom transform: k = zoom scale, x/y = translation offset */
export type Transform = { k: number, x: number, y: number };

/** Custom rendering mode relative to the built-in drawing: 'before' (draw under), 'after' (draw over), or 'replace' (skip built-in) */
export type CanvasRenderMode = 'before' | 'after' | 'replace';

// Force graph instance type from force-graph library
// The instance is created by calling ForceGraph as a function with a container element
export type ForceGraphInstance = import("force-graph").default<GraphNode, GraphLink> | undefined;
