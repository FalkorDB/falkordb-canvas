import ForceGraph from "force-graph";
import * as d3 from "d3";
import {
  Data,
  ForceGraphInstance,
  GraphData,
  GraphLink,
  GraphNode,
  ForceGraphConfig,
  LayoutMode,
  LayoutOptions,
  ViewportState,
  Transform,
  CanvasRenderMode,
  InternalForceGraphConfig,
  NodeStyleConfig,
  LinkStyleConfig,
  SimulationConfig,
  InteractionConfig,
  LargeGraphConfig,
} from "./canvas-types.js";
import {
  dataToGraphData,
  DEFAULT_CANVAS_BACKGROUND,
  DEFAULT_CANVAS_FOREGROUND,
  getContrastTextColor,
  getNodeDisplayText,
  graphDataToData,
  LINK_DISTANCE,
  wrapTextForCircularNode,
} from "./canvas-utils.js";
import { isForceLayout, pinAllNodes, unpinAllNodes, computeTreePositions, computeRadialPositions } from "./layouts.js";

const PADDING = 2;

// ─── Default Sub-Configs ───────────────────────────────────────────────────────

const DEFAULT_NODE_STYLE: Required<NodeStyleConfig> = {
  fontFamily: 'SofiaSans',
  fontWeightUnselected: 400,
  fontWeightSelected: 700,
  fontSize: 2,
  textFillRatio: 0.85,
  strokeWidthSelected: 1,
  strokeWidthUnselected: 0.5,
  glowDuration: 10000,
  glowSpread: 12,
  glowSteps: 16,
  glowColor: [59, 130, 246],
  glowMaxOpacity: 0.6,
};

const DEFAULT_LINK_STYLE: Required<LinkStyleConfig> = {
  fontFamily: 'SofiaSans',
  fontSize: 2,
  fontWeightUnselected: 400,
  fontWeightSelected: 700,
  lineWidthSelected: 2,
  lineWidthUnselected: 1,
  arrowLengthSelected: 16,
  arrowLengthUnselected: 8,
  arrowWidthRatio: 1.6,
  arrowNotchRatio: 0.2,
  selfLoopCurveFactor: 11.67,
  parallelEdgeCurveMultiplier: 0.4,
  labelBackgroundPadding: 0.3,
  edgeGap: PADDING,
};

const DEFAULT_SIMULATION: Required<SimulationConfig> = {
  centerStrength: 0.03,
  chargeStrength: -400,
  velocityDecay: 0.4,
  alphaMin: 0.05,
  warmupTicks: 300,
  chargeDistanceMax: Infinity,
  disableCollisionAbove: 0,
};

const DEFAULT_INTERACTION: Required<InteractionConfig> = {
  tooltipFontSize: 12,
  tooltipPadding: '4px 8px',
  tooltipBorderRadius: '4px',
  tooltipZIndex: 1000,
  zoomToFitPadding: 0.1,
  zoomToFitMaxZoom: 8,
  zoomToFitDelay: 50,
  linkHitWidth: 10,
  contrastThreshold: 0.5,
};

const DEFAULT_LARGE_GRAPH: Required<LargeGraphConfig> = {
  enabled: true,
  viewportPadding: 0,
  lowZoomThreshold: 1,
  skipLabelsAtLowZoom: true,
  skipArrowsAtLowZoom: true,
  skipLinkLabelsAtLowZoom: true,
};

/** Axis-aligned bounding box in world-space coordinates. */
export type WorldBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

// Create styles for the web component
function createStyles(backgroundColor: string, foregroundColor: string, interaction: Required<import('./canvas-types.js').InteractionConfig>): HTMLStyleElement {
  const style = document.createElement("style");
  style.textContent = `
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    @keyframes pulse {
      0%, 100% {
        opacity: 1;
      }
      50% {
        opacity: 0.5;
      }
    }
    /* Force-graph tooltip styling */
    .float-tooltip-kap {
      position: absolute;
      pointer-events: none;
      background-color: ${backgroundColor};
      color: ${foregroundColor};
      padding: ${interaction.tooltipPadding};
      border-radius: ${interaction.tooltipBorderRadius};
      font-size: ${interaction.tooltipFontSize}px;
      white-space: nowrap;
      z-index: ${interaction.tooltipZIndex};
    }
  `;
  return style;
}

/**
 * FalkorDB Canvas — a Web Component (`<falkordb-canvas>`) that renders an
 * interactive force-directed graph visualization.
 *
 * Supports force, tree, and radial layouts; viewport culling for large graphs;
 * custom node/link rendering; and configurable styling.
 *
 * @example
 * ```html
 * <falkordb-canvas id="graph"></falkordb-canvas>
 * <script>
 *   const canvas = document.getElementById('graph');
 *   canvas.setConfig({ backgroundColor: '#1a1a2e' });
 *   canvas.setData({ nodes: [...], links: [...] });
 * </script>
 * ```
 */
class FalkorDBCanvas extends HTMLElement {
  private graph: ForceGraphInstance;

  private container: HTMLDivElement | null = null;

  private resizeObserver: ResizeObserver | null = null;

  private data: GraphData = { nodes: [], links: [] };

  private debugEnabled: boolean = false;

  private config: InternalForceGraphConfig = {
    // ─── Dimensions & Colors ─────────────────────────────────────────────────
    backgroundColor: DEFAULT_CANVAS_BACKGROUND,
    foregroundColor: DEFAULT_CANVAS_FOREGROUND,

    // ─── Layout ──────────────────────────────────────────────────────────────
    layoutMode: "force",
    layoutOptions: {},

    // ─── Style Sub-Configs ───────────────────────────────────────────────────
    nodeStyle: { ...DEFAULT_NODE_STYLE },
    linkStyle: { ...DEFAULT_LINK_STYLE },
    simulation: { ...DEFAULT_SIMULATION },
    interaction: { ...DEFAULT_INTERACTION },
    largeGraph: { ...DEFAULT_LARGE_GRAPH },

    // ─── Display Options ─────────────────────────────────────────────────────
    captionsKeys: [],
    showPropertyKeyPrefix: false,
    pinOnDragEnd: false,
    dimmed: false,
  } as InternalForceGraphConfig;

  private nodeMode: CanvasRenderMode = 'replace';

  private linkMode: CanvasRenderMode = 'replace';

  private nodeDegreeMap: Map<number, number> = new Map();

  // Per-node font size cache: computed once per node, read every frame.
  private nodeDisplayFontSize: Map<number, number> = new Map();

  private relationshipsTextCache: Map<
    string,
    {
      textWidth: number;
      textHeight: number;
    }
  > = new Map();

  /**
   * Cached world-space axis-aligned bounding box of the currently visible
   * viewport.  Updated on every zoom/pan event and on resize.
   * `null` means culling is disabled or not yet computed.
   */
  private cullingBounds: WorldBounds | null = null;

  /** Current zoom level, cached alongside cullingBounds. */
  private cullingZoom: number = 1;

  /** Last d3-zoom transform, cached so bounds can be recomputed on resize. */
  private lastTransform: Transform | null = null;

  private onFontsLoadingDone = () => {
    this.relationshipsTextCache.clear();
    this.nodeDisplayFontSize.clear();
    for (const node of this.data.nodes) {
      node.displayName = ["" , ""];
    }
    this.triggerRender();
  };

  /** Returns the configured edge gap (distance between edge tip and node border). */
  private get edgeGap(): number {
    return this.config.linkStyle.edgeGap;
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  /**
   * Enable or disable debug logging to the console.
   * @param enabled - Whether to enable debug logs
   */
  setDebug(enabled: boolean) {
    this.debugEnabled = enabled;
    // Always use console.log directly for the toggle message so it appears regardless of previous state
    console.log('[FalkorDBCanvas] Debug mode', enabled ? 'enabled' : 'disabled');
  }

  /**
   * Internal logging method that only logs when debug is enabled
   * @param args - Arguments to pass to console.log
   */
  private log(...args: unknown[]) {
    if (this.debugEnabled) {
      console.log('[FalkorDBCanvas]', ...args);
    }
  }

  connectedCallback() {
    // Read mode attributes when element is connected to DOM
    const nodeModeAttr = this.getAttribute('node-mode');
    if (nodeModeAttr === 'before' || nodeModeAttr === 'after' || nodeModeAttr === 'replace') {
      this.nodeMode = nodeModeAttr;
      this.log('Node render mode set to:', this.nodeMode);
    }

    const linkModeAttr = this.getAttribute('link-mode');
    if (linkModeAttr === 'before' || linkModeAttr === 'after' || linkModeAttr === 'replace') {
      this.linkMode = linkModeAttr;
      this.log('Link render mode set to:', this.linkMode);
    }

    this.log('Component connected to DOM');
    this.render();

    // Text measurements taken before the custom font finishes loading use the
    // fallback system font and produce wrong widths that get locked in the cache.
    // Re-measure on every font-load batch (including the initial one).
    document.fonts.addEventListener("loadingdone", this.onFontsLoadingDone);
  }

  disconnectedCallback() {
    this.log('Component disconnected from DOM');
    document.fonts.removeEventListener("loadingdone", this.onFontsLoadingDone);
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.graph) {
      this.graph._destructor();
    }
  }

  /**
   * Update the canvas configuration. Accepts a partial config object —
   * only the provided fields are changed; others retain their current values.
   * Nested objects (nodeStyle, linkStyle, simulation, interaction, largeGraph) are deep-merged.
   *
   * @param config - Partial configuration to apply
   */
  setConfig(config: Partial<ForceGraphConfig>) {
    this.log('Setting config:', config);

    // If captionsKeys or showPropertyKeyPrefix changed, invalidate cached display names and font sizes
    // so text is recomputed with the new keys on the next render.
    if ((config.captionsKeys && JSON.stringify(config.captionsKeys) !== JSON.stringify(this.config.captionsKeys))
      || (config.showPropertyKeyPrefix !== undefined && config.showPropertyKeyPrefix !== this.config.showPropertyKeyPrefix)) {
      this.nodeDisplayFontSize.clear();
      for (const node of this.data.nodes) {
        node.displayName = ["", ""];
      }
    }

    // Deep-merge all nested object configs to preserve sibling fields on partial updates
    const mergeTargets = [
      ['largeGraph', config.largeGraph],
      ['nodeStyle', config.nodeStyle],
      ['linkStyle', config.linkStyle],
      ['simulation', config.simulation],
      ['interaction', config.interaction],
      ['eventHandlers', config.eventHandlers],
    ] as const;

    for (const [key, value] of mergeTargets) {
      if (value && typeof value === 'object') {
        (this.config as any)[key] = { ...(this.config as any)[key], ...value };
      }
    }

    // Shallow-assign top-level scalar/function fields (after deep-merge to avoid clobbering nested objects)
    const { largeGraph, nodeStyle, linkStyle, simulation, interaction, eventHandlers, layoutOptions, ...scalarConfig } = config;
    Object.assign(this.config, scalarConfig);

    if (config.layoutOptions) {
      const lo = config.layoutOptions;
      if (lo.tree) this.config.layoutOptions.tree = { ...this.config.layoutOptions.tree, ...lo.tree };
      if (lo.radial) this.config.layoutOptions.radial = { ...this.config.layoutOptions.radial, ...lo.radial };
      if (lo.force) this.config.layoutOptions.force = { ...this.config.layoutOptions.force, ...lo.force };
    }

    // Clear cached font sizes and display names when node style changes so text gets recalculated
    if (config.nodeStyle) {
      this.nodeDisplayFontSize.clear();
      for (const node of this.data.nodes) {
        node.displayName = ["", ""];
      }
    }

    // Clear cached link label metrics when link style changes
    if (config.linkStyle) {
      this.relationshipsTextCache.clear();
    }

    // Re-apply simulation forces when simulation config changes
    if (config.simulation && this.graph) {
      this.setupForces();
    }

    // Recompute or clear culling bounds when largeGraph config changes.
    if ('largeGraph' in config) {
      if (this.config.largeGraph?.enabled) {
        this.recomputeCullingBoundsIfNeeded();
      } else {
        this.cullingBounds = null;
      }
    }

    // Update event handlers if they were provided
    if (config.eventHandlers) {
      this.log('Updating event handlers');
      this.updateEventHandlers();
    }

    // Apply background/foreground colors through their dedicated methods
    // which also update the force-graph instance and tooltip styles.
    if (config.backgroundColor && this.graph) {
      this.graph.backgroundColor(this.config.backgroundColor);
    }
    if (config.backgroundColor || config.foregroundColor || config.interaction) {
      this.updateTooltipStyles();
    }

    // Always trigger a re-render so visual changes apply immediately
    this.triggerRender();
  }

  /**
   * Set the canvas width in pixels.
   * @param width - Width in pixels
   */
  setWidth(width: number) {
    if (this.config.width === width) return;
    this.log('Setting width to:', width);
    this.config.width = width;
    if (this.graph) {
      this.graph.width(width);
      this.recomputeCullingBoundsIfNeeded();
    }
  }

  /**
   * Set the canvas height in pixels.
   * @param height - Height in pixels
   */
  setHeight(height: number) {
    if (this.config.height === height) return;
    this.log('Setting height to:', height);
    this.config.height = height;
    if (this.graph) {
      this.graph.height(height);
      this.recomputeCullingBoundsIfNeeded();
    }
  }

  /**
   * Set the canvas background color.
   * @param color - CSS color string (hex, hsl, etc.)
   */
  setBackgroundColor(color: string) {
    if (this.config.backgroundColor === color) return;
    this.log('Setting background color to:', color);
    this.config.backgroundColor = color;
    if (this.graph) {
      this.graph.backgroundColor(color);
    }
    this.updateTooltipStyles();
  }

  /**
   * Set the foreground color used for strokes, labels, and borders.
   * @param color - CSS color string (hex, hsl, etc.)
   */
  setForegroundColor(color: string) {
    if (this.config.foregroundColor === color) return;
    this.log('Setting foreground color to:', color);
    this.config.foregroundColor = color;
    this.updateTooltipStyles();
    this.triggerRender();
  }

  /**
   * Enable or disable the force simulation animation.
   * When disabled, nodes are frozen in place.
   * @param enabled - Whether animation/simulation should run
   */
  setAnimation(enabled: boolean) {
    if (this.config.animation === enabled) return;
    this.config.animation = enabled;
    if (!this.graph) return;

    if (enabled && isForceLayout(this.config.layoutMode) && !this.config.pinOnDragEnd) {
      // Turn animation on: unpin nodes and let the simulation run
      const graphNodes = this.graph.graphData().nodes as GraphNode[];
      unpinAllNodes(graphNodes);
      unpinAllNodes(this.data.nodes);
      this.graph.cooldownTicks(Infinity);
      this.graph.d3ReheatSimulation();
      this.updateCanvasSimulationAttribute(true);
    } else if (!enabled) {
      // Turn animation off: freeze the simulation and pin nodes in place
      this.graph.cooldownTicks(0);
      const graphNodes = this.graph.graphData().nodes as GraphNode[];
      pinAllNodes(graphNodes);
      pinAllNodes(this.data.nodes);
      this.updateCanvasSimulationAttribute(false);
    }
  }

  /**
   * Enable or disable the dim/focus effect.
   * When enabled, nodes and links for which `isNodeDimmed`/`isLinkDimmed` return
   * `true` are rendered at reduced opacity (`dimOpacity`).
   * When disabled (default), all elements render at full opacity regardless of
   * the dim predicates.
   * @param enabled - Whether to activate focus-mode dimming
   */
  setDimmed(enabled: boolean) {
    if (this.config.dimmed === enabled) return;
    this.config.dimmed = enabled;
    this.triggerRender();
  }



  /**
   * Set whether nodes should remain pinned after being dragged.
   * When enabled, all existing nodes are pinned and simulation stops.
   * When disabled, nodes are unpinned and simulation may resume (if animation is on).
   * @param pin - Whether to pin nodes on drag end
   */
  setPinOnDragEnd(pin: boolean) {
    if (this.config.pinOnDragEnd === pin) return;
    this.config.pinOnDragEnd = pin;
    if (pin) {
      pinAllNodes(this.data.nodes);
      if (this.graph) {
        this.graph.cooldownTicks(0);
        this.updateCanvasSimulationAttribute(false);
      }
    } else {
      unpinAllNodes(this.data.nodes);
      if (this.graph) {
        // If animation is on and force layout, let simulation keep running
        if (this.config.animation && isForceLayout(this.config.layoutMode)) {
          this.graph.cooldownTicks(Infinity);
          this.graph.d3ReheatSimulation();
          this.updateCanvasSimulationAttribute(true);
        }
      }
    }
    this.config.eventHandlers?.onPinChange?.(pin);
  }

  /**
   * Switch to a different layout algorithm and recompute positions.
   * @param layoutMode - The layout to apply: 'force', 'tree', or 'radial'
   */
  setLayout(layoutMode: LayoutMode) {
    this.config.layoutMode = layoutMode;
    this.config.eventHandlers?.onLayoutChange?.(layoutMode);
    this.applyLayout();
  }

  /**
   * Update layout-specific options (direction, spacing, etc.) and recompute positions.
   * Only the provided sub-options are changed; others retain their current values.
   * @param options - Partial layout options to merge in
   */
  setLayoutOptions(options: Partial<LayoutOptions>) {
    // Deep merge each layout-specific section
    if (options.tree) {
      this.config.layoutOptions.tree = { ...this.config.layoutOptions.tree, ...options.tree };
    }
    if (options.radial) {
      this.config.layoutOptions.radial = { ...this.config.layoutOptions.radial, ...options.radial };
    }
    if (options.force) {
      this.config.layoutOptions.force = { ...this.config.layoutOptions.force, ...options.force };
    }
    this.applyLayout();
  }

  private applyLayout(zoomToFit = true) {
    if (!this.graph) return;

    const layoutMode = this.config.layoutMode;
    const layoutOptions = this.config.layoutOptions;

    if (layoutMode === 'tree') {
      unpinAllNodes(this.data.nodes);
      computeTreePositions(this.data, layoutOptions);

      // Pin nodes and render
      this.config.pinOnDragEnd = true;
      this.config.eventHandlers?.onPinChange?.(true);
      this.graph.cooldownTicks(0);
      this.graph.warmupTicks(0);
      this.graph.graphData(this.data);
      this.updateCanvasSimulationAttribute(false);
    } else if (layoutMode === 'radial') {
      // Deterministic radial layout — each level forms a perfect circle
      this.graph.dagMode(null as any);
      unpinAllNodes(this.data.nodes);
      computeRadialPositions(this.data, layoutOptions);

      // Pin nodes and render
      this.config.pinOnDragEnd = true;
      this.config.eventHandlers?.onPinChange?.(true);
      this.graph.cooldownTicks(0);
      this.graph.warmupTicks(0);
      this.graph.graphData(this.data);
      this.updateCanvasSimulationAttribute(false);
    } else {
      // Force layout — restore all forces, let simulation run
      this.graph.dagMode(null as any);
      this.graph.d3Force('link', d3.forceLink());
      this.graph.d3Force('center', d3.forceCenter(0, 0));
      this.graph.d3Force('centerX', d3.forceX(0).strength(this.config.simulation.centerStrength));
      this.graph.d3Force('centerY', d3.forceY(0).strength(this.config.simulation.centerStrength));
      this.setupForces();

      this.config.pinOnDragEnd = false;
      this.config.eventHandlers?.onPinChange?.(false);

      this.runForceWarmup();
    }

    // Delay zoomToFit so force-graph renders the new positions first
    if (zoomToFit) {
      setTimeout(() => this.zoomToFit(), this.config.interaction.zoomToFitDelay);
    }
  }

  /**
   * Get the current graph data as a plain Data object (nodes reference by ID, no internal state).
   * @returns A copy of the current graph data
   */
  getData(): Data {
    return graphDataToData(this.data);
  }

  /**
   * Replace the entire graph data. Computes layout positions for all nodes
   * and auto-zooms to fit. This is a full replacement — use `setGraphData` for
   * incremental updates that preserve existing node positions.
   *
   * @param data - The new graph data (nodes + links)
   */
  setData(data: Data) {
    this.log('setData called with', data.nodes.length, 'nodes and', data.links.length, 'links');
    // Convert data and apply circular layout to new nodes only
    this.data = dataToGraphData(data, undefined, undefined, this.config.linkStyle.parallelEdgeCurveMultiplier);

    // Initialize graph if it hasn't been initialized yet
    if (!this.graph && this.container) {
      this.log('Initializing graph');
      this.initGraph();
    }

    if (!this.graph) return;

    this.log('Calculating node degrees and setting up forces');
    this.calculateNodeDegree();
    this.setupForces();

    if (this.data.nodes.length === 0) {
      this.graph.graphData(this.data);
      return;
    }

    // Apply layout based on mode
    const layoutMode = this.config.layoutMode;
    const layoutOptions = this.config.layoutOptions;

    this.graph.dagMode(null as any);

    if (layoutMode === 'tree') {
      computeTreePositions(this.data, layoutOptions);
      this.graph.cooldownTicks(0);
      this.graph.warmupTicks(0);
      this.graph.graphData(this.data);
      this.updateCanvasSimulationAttribute(false);
    } else if (layoutMode === 'radial') {
      // Deterministic radial layout — positions computed directly
      computeRadialPositions(this.data, layoutOptions);
      this.config.pinOnDragEnd = true;
      this.config.eventHandlers?.onPinChange?.(true);
      this.graph.cooldownTicks(0);
      this.graph.warmupTicks(0);
      this.graph.graphData(this.data);
      this.updateCanvasSimulationAttribute(false);
    } else {
      // Force layout
      this.runForceWarmup();
    }

    // Auto zoom to fit (delay to let positions render)
    const nodeCount = this.data.nodes.length;
    setTimeout(() => {
      this.zoomToFit(1);
      // For very small graphs the force simulation may push nodes far apart,
      // producing a near-zero zoom that makes them invisible.
      // zoomToFit is now synchronous, so this.graph.zoom() reflects the new
      // value immediately and we can enforce a readable minimum.
      if (nodeCount > 0 && nodeCount <= 3 && this.graph) {
        const z = this.graph.zoom() ?? 1;
        if (z < 1.0) this.graph.zoom(1.0);
      }
    }, this.config.interaction.zoomToFitDelay);
  }

  /**
   * Get the current viewport state (zoom level and center position).
   * Returns undefined if the graph hasn't been initialized yet.
   */
  getViewport(): ViewportState {
    if (!this.graph) return undefined;

    const { x: centerX, y: centerY } = this.graph.centerAt();
    const zoom = this.graph.zoom();

    this.log('Getting viewport - zoom:', zoom, 'center:', centerX, centerY);
    return {
      zoom,
      centerX,
      centerY,
    };
  }

  /**
   * Restore a previously saved viewport state (zoom and center).
   * @param viewport - The viewport state to restore
   */
  setViewport(viewport: ViewportState) {
    this.log('Setting viewport:', viewport);
    if (!viewport || !this.graph) return;
    this.graph.centerAt(viewport.centerX, viewport.centerY, 0);
    this.graph.zoom(viewport.zoom, 0);
  }

  /**
   * Get the internal graph data with resolved references (GraphNode/GraphLink objects).
   * Useful for reading current positions and runtime state.
   */
  getGraphData(): GraphData {
    return this.data;
  }

  /**
   * Trigger a repaint after in-place property mutations on nodes/links
   * (e.g. visibility, color, size, data attributes).
   * For deterministic layouts (tree, radial), recomputes positions
   * to account for any size changes.
   */
  refresh() {
    // Clear font size cache so text re-fits updated node sizes
    this.nodeDisplayFontSize.clear();
    // Clear display names so text re-wraps for the new node sizes
    for (const node of this.data.nodes) {
      node.displayName = ["", ""];
    }
    // Clear link label cache in case link colors/properties changed
    this.relationshipsTextCache.clear();

    const layoutMode = this.config.layoutMode;
    if (layoutMode === 'tree' || layoutMode === 'radial') {
      // Recompute layout to handle node size changes
      this.applyLayout(false);
    } else {
      this.triggerRender();
    }
  }

  /**
   * Incrementally update the graph data. Preserves positions of existing nodes,
   * positions new nodes near their connected parent, and removes nodes/links
   * that are no longer in the input. Recomputes layout for tree/radial modes.
   *
   * @param data - The updated graph data (full replacement, but positions are preserved)
   */
  setGraphData(data: Data) {
    this.log('setGraphData called with', data.nodes.length, 'nodes and', data.links.length, 'links');

    const existingNodesMap = new Map(this.data.nodes.map(n => [n.id, n]));
    const incomingNodeIds = new Set(data.nodes.map(n => n.id));

    // Track removals before converting
    const removedNodes = this.data.nodes.filter(n => !incomingNodeIds.has(n.id)).length;

    // Use dataToGraphData with existing nodes map — reuses existing nodes, creates new ones
    const prevNodeCount = existingNodesMap.size;
    const converted = dataToGraphData(data, undefined, existingNodesMap, this.config.linkStyle.parallelEdgeCurveMultiplier);
    const hasNewNodes = converted.nodes.length > prevNodeCount - removedNodes;
    const hasNewLinks = converted.links.length > this.data.links.filter(l => 
      incomingNodeIds.has(l.source.id) && incomingNodeIds.has(l.target.id)
    ).length - removedNodes;

    this.data = converted;

    // Invalidate display caches — reused nodes may have new color/size/data
    // that affects text wrapping or font sizing.
    this.nodeDisplayFontSize.clear();
    for (const node of this.data.nodes) {
      node.displayName = ["", ""];
    }
    this.relationshipsTextCache.clear();

    if (!this.graph) return;

    this.calculateNodeDegree();

    if (hasNewNodes) {
      if (isForceLayout(this.config.layoutMode)) {
        // Force layout: position new nodes near their connected parent, then warmup
        const newNodes = this.data.nodes.filter(n => !existingNodesMap.has(n.id));
        const newNodeIds = new Set(newNodes.map(n => n.id));
        for (const node of newNodes) {
          const parentLink = this.data.links.find(l =>
            (l.source.id === node.id && !newNodeIds.has(l.target.id)) ||
            (l.target.id === node.id && !newNodeIds.has(l.source.id))
          );
          if (parentLink) {
            const parent = newNodeIds.has(parentLink.source.id) ? parentLink.target : parentLink.source;
            const angle = Math.random() * 2 * Math.PI;
            const dist = 40 + Math.random() * 30;
            node.x = (parent.x ?? 0) + Math.cos(angle) * dist;
            node.y = (parent.y ?? 0) + Math.sin(angle) * dist;
          }
        }

        this.graph.dagMode(null as any);
        this.graph.d3Force('link', d3.forceLink());
        this.setupForces();
        this.runForceWarmup();
      } else {
        // Non-force layout (tree/radial): reapply the current layout
        this.applyLayout(false);
      }
    } else if (hasNewLinks && !isForceLayout(this.config.layoutMode)) {
      // New edges change the tree structure — recompute positions
      this.applyLayout(false);
    } else if (removedNodes > 0 && !isForceLayout(this.config.layoutMode)) {
      // Nodes were removed (collapse) — recompute layout to close gaps
      this.applyLayout(false);
    } else {
      this.graph.graphData(this.data);
      this.triggerRender();
    }
  }

  /**
   * Get the underlying force-graph library instance for advanced customization.
   * Returns undefined if the graph hasn't been initialized.
   */
  getGraph(): ForceGraphInstance | undefined {
    return this.graph;
  }

  /** Get the current zoom level */
  public getZoom(): number {
    return this.graph?.zoom() || 0;
  }

  /**
   * Get viewport culling statistics for debugging large-graph performance.
   * Shows how many nodes/links are visible vs total.
   */
  public getCullingStats(): { enabled: boolean; bounds: WorldBounds | null; zoom: number; visibleNodes: number; totalNodes: number; visibleLinks: number; totalLinks: number } {
    const enabled = this.config.largeGraph?.enabled ?? false;
    const totalNodes = this.data.nodes.length;
    const totalLinks = this.data.links.length;
    let visibleNodes = totalNodes;
    let visibleLinks = totalLinks;
    if (enabled && this.cullingBounds) {
      visibleNodes = this.data.nodes.filter(n => this.isNodeInCullingBounds(n)).length;
      visibleLinks = this.data.links.filter(l => this.isLinkInCullingBounds(l)).length;
    }
    return {
      enabled,
      bounds: this.cullingBounds,
      zoom: this.cullingZoom,
      visibleNodes,
      totalNodes,
      visibleLinks,
      totalLinks,
    };
  }

  /**
   * Programmatically set the zoom level.
   * @param zoomLevel - The desired zoom scale (1 = 100%)
   */
  public zoom(zoomLevel: number): ForceGraphInstance | undefined {
    if (!this.graph) return;

    this.log('Setting zoom level to:', zoomLevel);
    return this.graph.zoom(zoomLevel);
  }

  /**
   * Pan the viewport so the given world-space coordinates are at the center.
   * @param x - World X coordinate
   * @param y - World Y coordinate
   * @param duration - Transition duration in ms (default 0 = instant)
   */
  public centerAt(x: number, y: number, duration = 0): void {
    this.graph?.centerAt(x, y, duration);
  }

  /**
   * Zoom the viewport to fit all visible nodes (or a filtered subset).
   * Respects maxZoom and padding configuration.
   *
   * @param paddingMultiplier - Multiplier for the configured padding (default 1)
   * @param filter - Optional filter function to zoom only to specific nodes
   */
  /**
   * Zoom the viewport to fit all visible nodes (or a filtered subset).
   *
   * Unlike the underlying force-graph `zoomToFit`, this implementation is
   * **synchronous**: it computes the bounding box, derives the fit zoom, and
   * calls `centerAt` + `zoom` directly so callers can read the new zoom level
   * immediately after the call returns.
   *
   * @param zoomMultiplier - Scale factor applied to the computed fit-zoom (0–2).
   *   `1` uses the natural fit zoom, `>1` zooms in further, `<1` zooms out further.
   *   Default: `1`.
   * @param filter - Optional predicate to zoom only to a subset of nodes.
   */
  public zoomToFit(zoomMultiplier = 1, filter?: (node: GraphNode) => boolean) {
    if (!this.graph || !this.shadowRoot) return;

    // Get canvas from shadow DOM
    const canvas = this.shadowRoot.querySelector("canvas") as HTMLCanvasElement;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const nodes = filter ? this.data.nodes.filter(filter) : this.data.nodes;

    if (nodes.length === 0) return;

    // Compute node bounding box
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of nodes) {
      if (n.x !== undefined && n.y !== undefined) {
        minX = Math.min(minX, n.x);
        maxX = Math.max(maxX, n.x);
        minY = Math.min(minY, n.y);
        maxY = Math.max(maxY, n.y);
      }
    }

    // No node had valid coordinates yet (layout hasn't run); fall back to the library default.
    if (!isFinite(minX)) {
      const padding = Math.min(rect.width, rect.height) * this.config.interaction.zoomToFitPadding;
      this.graph.zoomToFit(0, padding, filter);
      return;
    }

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const worldWidth = maxX - minX;
    const worldHeight = maxY - minY;
    const maxZoom = this.config.interaction.zoomToFitMaxZoom ?? 8;

    let zoom: number;
    if (worldWidth === 0 && worldHeight === 0) {
      // Single node or all nodes overlapping: zoom to max
      zoom = maxZoom;
    } else {
      // Compute natural fit zoom with the configured edge padding
      const minDimension = Math.min(rect.width, rect.height);
      const padding = minDimension * this.config.interaction.zoomToFitPadding;
      const availableW = Math.max(rect.width - 2 * padding, 0);
      const availableH = Math.max(rect.height - 2 * padding, 0);
      zoom = Math.min(availableW / worldWidth, availableH / worldHeight);
    }

    // Apply the caller-supplied multiplier then clamp to the configured max
    zoom = Math.min(zoom * zoomMultiplier, maxZoom);
    // Never collapse to zero (can happen with extreme zoomMultiplier values)
    zoom = Math.max(zoom, 0.01);

    this.log('Zooming to fit: center=(', centerX, ',', centerY, ') zoom=', zoom, ' multiplier=', zoomMultiplier);
    this.graph.centerAt(centerX, centerY, 0);
    this.graph.zoom(zoom);
  }

  private triggerRender() {
    if (!this.graph) return;

    // Temporarily disable auto-pause so force-graph renders a frame even though
    // the simulation is stopped.  Restore after two animation frames.
    this.graph.autoPauseRedraw(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.graph?.autoPauseRedraw(true);
      });
    });
  }

  private updateCanvasSimulationAttribute(isRunning: boolean) {
    if (!this.shadowRoot) return;

    const canvas = this.shadowRoot.querySelector("canvas") as HTMLCanvasElement;

    if (canvas) {
      canvas.setAttribute('data-engine-status', isRunning ? "running" : "stopped");
    }
  }

  private calculateNodeDegree() {
    this.log('Calculating node degrees for', this.data.nodes.length, 'nodes');
    this.nodeDegreeMap.clear();
    const { nodes, links } = this.data;

    nodes.forEach((node) => this.nodeDegreeMap.set(node.id, 0));

    links.forEach((link) => {
      const sourceId = link.source.id;
      const targetId = link.target.id;

      this.nodeDegreeMap.set(
        sourceId,
        (this.nodeDegreeMap.get(sourceId) || 0) + 1
      );
      this.nodeDegreeMap.set(
        targetId,
        (this.nodeDegreeMap.get(targetId) || 0) + 1
      );
    });
  }

  private render() {
    if (!this.shadowRoot) return;

    this.log('Rendering canvas component');
    // Create container
    this.container = document.createElement("div");
    this.container.style.width = "100%";
    this.container.style.height = "100%";
    this.container.style.position = "relative";

    // Add styles using standalone function
    const style = createStyles(this.config.backgroundColor, this.config.foregroundColor, this.config.interaction);

    this.shadowRoot.appendChild(style);
    this.shadowRoot.appendChild(this.container);

    this.initGraph();
    this.setupResizeObserver();
  }

  private setupResizeObserver() {
    if (!this.container) return;

    this.log('Setting up resize observer');
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (this.graph && width > 0 && height > 0) {
          this.log('Container resized to:', width, 'x', height);
          this.graph.width(width).height(height);
          this.recomputeCullingBoundsIfNeeded();
        }
      }
    });

    this.resizeObserver.observe(this.container);
  }

  private initGraph() {
    if (!this.container) return;

    this.log('Initializing force graph with', this.data.nodes.length, 'nodes and', this.data.links.length, 'links');
    this.calculateNodeDegree();

    // Initialize force-graph
    // Cast to any for the factory call pattern, result is properly typed as ForceGraphInstance
    this.graph = (ForceGraph as any)()(this.container)
      .width(this.config.width || 800)
      .height(this.config.height || 600)
      .backgroundColor(this.config.backgroundColor)
      .graphData(this.data)
      .nodeCanvasObjectMode(() => this.nodeMode)
      .linkCanvasObjectMode(() => this.linkMode)
      .nodeLabel((node: GraphNode) =>
        getNodeDisplayText(node, this.config.captionsKeys, this.config.showPropertyKeyPrefix)
      )
      .linkLabel((link: GraphLink) => link.relationship)
      .linkDirectionalArrowLength(0)
      .linkWidth(0)
      .linkCurvature("curve")
      .linkVisibility("visible")
      .nodeVisibility("visible")
      .cooldownTicks(0)
      .cooldownTime(Infinity)
      .enableNodeDrag(true)
      .enableZoomInteraction(true)
      .enablePanInteraction(true);

    this.bindEventHandlers();

    // Setup forces
    this.setupForces();
    this.log('Force graph initialization complete');
  }

  /**
   * Run the force simulation warmup synchronously and show the result.
   * Resets node positions so d3 computes a fresh layout, then pins if needed.
   * @param freeNodeIds - if provided, only these nodes are free to move; all others are pinned.
   */
  private runForceWarmup(freeNodeIds?: Set<number>) {
    if (!this.graph) return;

    if (freeNodeIds) {
      // Local warmup: only unpin specified nodes, keep the rest pinned
      this.data.nodes.forEach(n => {
        if (freeNodeIds.has(n.id)) {
          delete n.fx; delete n.fy; n.vx = 0; n.vy = 0;
        } else {
          n.fx = n.x; n.fy = n.y;
        }
      });
      // Disable center forces during local warmup — free nodes should cluster
      // around their parent, not get pulled to origin
      this.graph.d3Force('centerX', null);
      this.graph.d3Force('centerY', null);
    } else {
      // Full warmup: unpin all nodes
      this.data.nodes.forEach(n => { delete n.fx; delete n.fy; n.vx = 0; n.vy = 0; });
    }

    this.graph.cooldownTicks(0);
    this.graph.warmupTicks(this.config.simulation.warmupTicks);

    if (this.config.animation) {
      this.graph.graphData(this.data);
      // Restore center forces after graphData applies
      if (freeNodeIds) {
        this.graph.d3Force('centerX', d3.forceX(0).strength(this.config.simulation.centerStrength));
        this.graph.d3Force('centerY', d3.forceY(0).strength(this.config.simulation.centerStrength));
      }
      this.graph.cooldownTicks(Infinity);
      this.graph.d3ReheatSimulation();
      this.updateCanvasSimulationAttribute(true);
    } else {
      // Pin all nodes once the engine stops
      this.graph.onEngineStop(() => {
        pinAllNodes(this.data.nodes);
        this.graph!.onEngineStop(() => {});
        // Restore center forces after warmup settles
        if (freeNodeIds) {
          this.graph!.d3Force('centerX', d3.forceX(0).strength(this.config.simulation.centerStrength));
          this.graph!.d3Force('centerY', d3.forceY(0).strength(this.config.simulation.centerStrength));
        }
      });
      this.graph.graphData(this.data);
      this.updateCanvasSimulationAttribute(false);
    }
  }

  private setupForces() {
    this.log('Setting up force simulation');
    const linkForce = this.graph?.d3Force("link");

    if (!linkForce) return;
    if (!this.graph) return;

    const linkDist = this.config.layoutOptions.force?.linkDistance ?? LINK_DISTANCE;
    const collisionPad = this.config.layoutOptions.force?.collisionPadding ?? 25;

    // distance based on node size + constant
    linkForce
      .distance((link: GraphLink) => {
        const sourceSize = link.source.size;
        const targetSize = link.target.size;
        return sourceSize + targetSize + linkDist * 2;
      });

    // Collision force - node size + padding (can be disabled for large graphs)
    const nodeCount = this.graph.graphData()?.nodes?.length ?? 0;
    const disableCollisionAbove = this.config.simulation.disableCollisionAbove;
    if (disableCollisionAbove > 0 && nodeCount > disableCollisionAbove) {
      this.graph.d3Force("collide", null);
    } else {
      this.graph.d3Force(
        "collide",
        d3.forceCollide((node: GraphNode) => node.size + collisionPad)
      );
    }

    // Center forces - separate X and Y forces
    this.graph.d3Force(
      "centerX",
      d3.forceX(0).strength(this.config.simulation.centerStrength)
    );

    this.graph.d3Force(
      "centerY",
      d3.forceY(0).strength(this.config.simulation.centerStrength)
    );

    // Charge force
    const chargeForce = this.graph.d3Force("charge");
    if (chargeForce) {
      chargeForce.strength(this.config.simulation.chargeStrength);
      // Limit charge interaction distance for performance on large graphs
      const distMaxConfig = this.config.simulation.chargeDistanceMax;
      let distMax: number;
      if (distMaxConfig === "auto") {
        distMax = Math.sqrt(nodeCount) * 30;
      } else {
        distMax = distMaxConfig;
      }
      if (chargeForce.distanceMax) {
        // Always update the setter; use Infinity to reset to unlimited when the
        // cap is cleared (distMaxConfig === undefined).
        chargeForce.distanceMax(isFinite(distMax) ? distMax : Infinity);
      }
    }

    // Set velocity decay and alpha min
    // Access the underlying d3 simulation
    const simulation = this.graph.d3Force('simulation');
    if (simulation && typeof simulation === 'object') {
      // @ts-ignore - accessing d3 simulation methods
      if (simulation.velocityDecay) simulation.velocityDecay(this.config.simulation.velocityDecay);
      // @ts-ignore
      if (simulation.alphaMin) simulation.alphaMin(this.config.simulation.alphaMin);
    }
    this.log('Force simulation setup complete');
  }

  /**
   * Recompute the world-space culling bounds from force-graph's `onZoom` callback.
   *
   * force-graph passes { k, x, y } where x,y are the world-space coordinates
   * of the viewport center (from centerAt()), NOT raw d3 translation values.
   * The viewport spans w/k world units wide and h/k tall, centered on (x, y).
   */
  private updateCullingBounds(transform: Transform) {
    this.lastTransform = transform;
    if (!this.config.largeGraph?.enabled) {
      this.cullingBounds = null;
      return;
    }

    const w = this.graph?.width() ?? 0;
    const h = this.graph?.height() ?? 0;
    const { k, x: cx, y: cy } = transform;

    if (k <= 0 || w <= 0 || h <= 0) {
      this.cullingBounds = null;
      this.cullingZoom = 1;
      return;
    }

    const padding = this.config.largeGraph?.viewportPadding ?? 0;
    const halfW = w / (2 * k);
    const halfH = h / (2 * k);

    this.cullingBounds = {
      minX: cx - halfW - padding,
      maxX: cx + halfW + padding,
      minY: cy - halfH - padding,
      maxY: cy + halfH + padding,
    };
    this.cullingZoom = k;
  }

  /** Recompute culling bounds using the last known transform (e.g. after resize). */
  private recomputeCullingBoundsIfNeeded() {
    if (!this.config.largeGraph?.enabled) return;
    if (this.lastTransform) {
      this.updateCullingBounds(this.lastTransform);
    } else if (this.graph) {
      // Seed from current graph state before first onZoom fires.
      const k = this.graph.zoom() ?? 1;
      const center = this.graph.centerAt() ?? { x: 0, y: 0 };
      const w = this.graph.width() ?? 0;
      const h = this.graph.height() ?? 0;
      if (k > 0 && w > 0 && h > 0) {
        this.updateCullingBounds({ k, x: center.x, y: center.y });
      }
    }
  }

  /**
   * Returns `true` when the node is (at least partially) inside the current
   * culling viewport, or when culling is disabled / bounds are not yet known.
   */
  private isNodeInCullingBounds(node: GraphNode): boolean {
    if (!this.cullingBounds) return true;
    const { minX, maxX, minY, maxY } = this.cullingBounds;
    const r = node.size + PADDING;
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    return x + r >= minX && x - r <= maxX && y + r >= minY && y - r <= maxY;
  }

  /**
   * Returns `true` when a link's visual representation overlaps the current
   * culling viewport, or when culling is disabled / bounds are not yet known.
   *
   * For straight / quadratic-bezier links the test uses the convex-hull bounding
   * box of (source, control point, target), which is always a conservative
   * (never-false-negative) bound.  For self-loops the test uses a square of
   * side ≈ the loop diameter centred on the node.
   */
  private isLinkInCullingBounds(link: GraphLink): boolean {
    if (!this.cullingBounds) return true;
    const { minX, maxX, minY, maxY } = this.cullingBounds;

    const sx = link.source.x ?? 0;
    const sy = link.source.y ?? 0;
    const ex = link.target.x ?? 0;
    const ey = link.target.y ?? 0;

    if (link.source.id === link.target.id) {
      // Self-loop: the cubic bezier extends roughly |curve| * nodeSize * factor
      // away from the node centre. Use that as a conservative radius.
      const nodeSize = link.source.size;
      const loopRadius = Math.abs(link.curve || 1) * nodeSize * this.config.linkStyle.selfLoopCurveFactor;
      return (
        sx + loopRadius >= minX && sx - loopRadius <= maxX &&
        sy + loopRadius >= minY && sy - loopRadius <= maxY
      );
    }

    // Compute quadratic-bezier control point (same formula as drawLink).
    const dx = ex - sx;
    const dy = ey - sy;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance === 0) {
      // Co-located nodes: just check the point.
      return sx >= minX && sx <= maxX && sy >= minY && sy <= maxY;
    }

    const curvature = link.curve ?? 0;
    const perpX = dy / distance;
    const perpY = -dx / distance;
    const cx = (sx + ex) / 2 + perpX * curvature * distance;
    const cy = (sy + ey) / 2 + perpY * curvature * distance;

    // Convex-hull AABB of the three control points.
    const lMinX = Math.min(sx, ex, cx);
    const lMaxX = Math.max(sx, ex, cx);
    const lMinY = Math.min(sy, ey, cy);
    const lMaxY = Math.max(sy, ey, cy);

    return lMaxX >= minX && lMinX <= maxX && lMaxY >= minY && lMinY <= maxY;
  }

  private drawNode(node: GraphNode, ctx: CanvasRenderingContext2D) {

    if (node.x === undefined || node.y === undefined) {
      node.x = 0;
      node.y = 0;
    }

    // Viewport culling: skip nodes that are entirely outside the visible area.
    if (this.config.largeGraph?.enabled && !this.isNodeInCullingBounds(node)) return;

    // Focus mode dimming: reduce opacity for nodes outside the focused set.
    const isDimmed = this.config.dimmed === true && (this.config.isNodeDimmed?.(node) ?? false);
    if (isDimmed) {
      ctx.save();
      ctx.globalAlpha = this.config.dimOpacity ?? 0.15;
    }

    ctx.lineWidth = this.config.isNodeSelected?.(node) ? this.config.nodeStyle.strokeWidthSelected : this.config.nodeStyle.strokeWidthUnselected;
    ctx.strokeStyle = node.borderColor ?? this.config.foregroundColor;
    ctx.fillStyle = node.color;

    const radius = node.size + ctx.lineWidth / 2;

    // Draw glow after expand/collapse state change
    const [, expandTime] = node.expand;
    const expandAge = Date.now() - expandTime.getTime();
    const glowDuration = this.config.nodeStyle.glowDuration;
    if (expandAge < glowDuration) {
      ctx.save();
      const glowRadius = this.config.nodeStyle.glowSpread;
      const steps = this.config.nodeStyle.glowSteps;
      const [gr, gg, gb] = this.config.nodeStyle.glowColor;
      const glowMaxOpacity = this.config.nodeStyle.glowMaxOpacity;
      for (let i = steps; i >= 1; i--) {
        const t = i / steps;
        const spread = t * glowRadius;
        const alpha = glowMaxOpacity * (1 - t) * (1 - t);
        ctx.strokeStyle = `rgba(${gr}, ${gg}, ${gb}, ${alpha})`;
        ctx.lineWidth = glowRadius / steps;
        ctx.beginPath();
        ctx.arc(node.x!, node.y!, radius + spread, 0, 2 * Math.PI, false);
        ctx.stroke();
      }
      ctx.restore();
      setTimeout(() => {
        this.triggerRender();
      }, glowDuration - expandAge);
    }

    ctx.beginPath();
    ctx.arc(node.x!, node.y!, radius, 0, 2 * Math.PI, false);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(node.x, node.y, node.size, 0, 2 * Math.PI, false);
    ctx.fill();

    // Low-zoom optimisation: skip labels when zoomed out beyond threshold.
    // lowZoomThreshold is the zoom level below which details are hidden (e.g. 0.5 = skip at half zoom).
    const nodeZoomThreshold = this.config.largeGraph.lowZoomThreshold;
    const skipLabels = this.config.largeGraph.enabled &&
      this.config.largeGraph.skipLabelsAtLowZoom  &&
      this.cullingZoom <= nodeZoomThreshold;
    if (skipLabels) {
      if (isDimmed) ctx.restore();
      return;
    }

    // Draw text
    ctx.fillStyle = getContrastTextColor(node.color, this.config.interaction.contrastThreshold);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    let [line1, line2] = node.displayName;
    const textRadius = node.size - PADDING / 2;

    if (!line1 && !line2) {
      const text = getNodeDisplayText(node, this.config.captionsKeys, this.config.showPropertyKeyPrefix);

      const nodeFontWeight = this.config.isNodeSelected?.(node) ? this.config.nodeStyle.fontWeightSelected : this.config.nodeStyle.fontWeightUnselected;
      const baseFontSize = this.config.nodeStyle.fontSize;

      // Measure at the base size for line-wrapping decisions.
      ctx.font = `${nodeFontWeight} ${baseFontSize}px ${this.config.nodeStyle.fontFamily}`;
      [line1, line2] = wrapTextForCircularNode(ctx, text, textRadius);

      let chosenSize = baseFontSize;

      if (this.config.nodeStyle.textFillRatio > 0 && !line2) {
        // Auto-size mode: scale text to fill textFillRatio × nodeRadius.
        // Measure at a large reference size (20px) where canvas metrics are precise.
        const REF = 20;
        ctx.font = `${nodeFontWeight} ${REF}px ${this.config.nodeStyle.fontFamily}`;
        const refMetrics = ctx.measureText(line1);
        const visualWidth = (refMetrics.actualBoundingBoxLeft ?? 0)
          + (refMetrics.actualBoundingBoxRight ?? 0);
        const refWidth = Math.max(visualWidth, refMetrics.width);
        const refHeight = (refMetrics.actualBoundingBoxAscent ?? 0)
          + (refMetrics.actualBoundingBoxDescent ?? 0);

        // Inscribed-rectangle-in-circle constraint: every corner of the text
        // bounding box must lie inside the circle.
        const r = this.config.nodeStyle.textFillRatio * textRadius;
        if (refWidth > 0 && refHeight > 0) {
          const diagonal = Math.sqrt(refWidth * refWidth + refHeight * refHeight);
          chosenSize = REF * (2 * r / diagonal);
        } else if (refWidth > 0) {
          chosenSize = REF * (2 * r / refWidth);
        }
      }
      // else: fixed fontSize mode — chosenSize stays as baseFontSize.

      ctx.font = `${nodeFontWeight} ${chosenSize}px ${this.config.nodeStyle.fontFamily}`;
      node.displayName = [line1, line2];
      this.nodeDisplayFontSize.set(node.id, chosenSize);
    } else {
      // Cache hit: the font size was stored when displayName was first computed.
      const nodeFontWeight = this.config.isNodeSelected?.(node) ? this.config.nodeStyle.fontWeightSelected : this.config.nodeStyle.fontWeightUnselected;
      const chosenSize = this.nodeDisplayFontSize.get(node.id) ?? this.config.nodeStyle.fontSize;
      ctx.font = `${nodeFontWeight} ${chosenSize}px ${this.config.nodeStyle.fontFamily}`;
    }

    const textMetrics = ctx.measureText(line1);
    const textHeight =
      textMetrics.actualBoundingBoxAscent +
      textMetrics.actualBoundingBoxDescent;
    const halfTextHeight = (textHeight / 2) * 1.5;

    if (line1) {
      // textBaseline="middle" centers on the em-box midpoint, but for glyphs
      // without descenders (e.g. digits) the visual center sits above that.
      // Nudge down by (ascent − descent) / 2 to true-center the rendered pixels.
      const yCorrection = line2
        ? 0
        : (textMetrics.actualBoundingBoxAscent - textMetrics.actualBoundingBoxDescent) / 2;
      ctx.fillText(line1, node.x, line2 ? node.y - halfTextHeight : node.y + yCorrection);
    }
    if (line2) {
      ctx.fillText(line2, node.x, node.y + halfTextHeight);
    }

    // Restore opacity after dimmed draw.
    if (isDimmed) {
      ctx.restore();
    }
  }

  private pointerNode(node: GraphNode, color: string, ctx: CanvasRenderingContext2D) {
    if (node.x === undefined || node.y === undefined) {
      node.x = 0;
      node.y = 0;
    };

    // Viewport culling: skip hit-test painting for offscreen nodes.
    if (this.config.largeGraph?.enabled && !this.isNodeInCullingBounds(node)) return;

    const radius = node.size + PADDING;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
    ctx.fill();
  }

  private drawLink(link: GraphLink, ctx: CanvasRenderingContext2D, globalScale: number) {
    const start = link.source;
    const end = link.target;

    if (start.x === undefined || start.y === undefined || end.x === undefined || end.y === undefined) {
      start.x = 0;
      start.y = 0;
      end.x = 0;
      end.y = 0;
    }

    // Viewport culling: skip links whose visual extent is entirely outside the
    // visible area.  The check is conservative (convex-hull AABB) so it never
    // produces false negatives.
    if (this.config.largeGraph?.enabled && !this.isLinkInCullingBounds(link)) return;

    // Focus mode dimming: reduce opacity for links outside the focused set.
    const isLinkDimmed = this.config.dimmed === true && (this.config.isLinkDimmed?.(link) ?? false);
    if (isLinkDimmed) {
      ctx.save();
      ctx.globalAlpha = this.config.dimOpacity ?? 0.15;
    }

    let textX;
    let textY;
    let angle;

    const isLinkSelected = this.config.isLinkSelected?.(link) ?? false;
    const arrowLen = isLinkSelected ? this.config.linkStyle.arrowLengthSelected : this.config.linkStyle.arrowLengthUnselected;

    // Low-zoom flags – evaluated once per link draw.
    // lowZoomThreshold is the zoom level below which details are hidden (e.g. 0.5 = skip at half zoom).
    const lowZoomThreshold = this.config.largeGraph.lowZoomThreshold;
    const atLowZoom = this.config.largeGraph.enabled && this.cullingZoom <= lowZoomThreshold;
    const skipArrows = atLowZoom && this.config.largeGraph.skipArrowsAtLowZoom;
    const skipLinkLabels = atLowZoom && this.config.largeGraph.skipLinkLabelsAtLowZoom;

    // Deferred arrowhead — drawn after the label so it is never covered by
    // the label background rect (which happens for short links where the
    // bezier midpoint and the arrow tip are at almost the same position).
    let pendingArrow: { tipX: number; tipY: number; nx: number; ny: number; arrowLen: number; arrowHalfWidth: number } | null = null;

    if (start.id === end.id) {
      const nodeSize = start.size;
      const d = (link.curve || 0) * nodeSize * this.config.linkStyle.selfLoopCurveFactor;

      ctx.lineWidth = (isLinkSelected ? this.config.linkStyle.lineWidthSelected : this.config.linkStyle.lineWidthUnselected) / globalScale;
      if (this.config.linkLineDash) ctx.setLineDash(this.config.linkLineDash(link));

      // The visible outer edge of the node border is nodeSize + strokeWidth
      // (stroke is centered on nodeSize + strokeWidth/2, so outer edge = nodeSize + strokeWidth).
      const nodeStrokeWidth = this.config.isNodeSelected?.(start) ? this.config.nodeStyle.strokeWidthSelected : this.config.nodeStyle.strokeWidthUnselected;
      const borderRadius = nodeSize + nodeStrokeWidth + this.edgeGap;

      // Binary search for tArrow near 1.0 where the curve is at distance borderRadius
      // from the node center (i.e. on the outer edge of the node border stroke).
      // Bezier parametric form: Bx(t)=sx+3(1-t)t²d, By(t)=sy-3(1-t)²td
      // dist(t) = 3*(1-t)*t*|d|*sqrt(t² + (1-t)²)
      const arrowHalfWidth = arrowLen / this.config.linkStyle.arrowWidthRatio / 2;
      let lo = 0.5, hi = 1.0;
      const absD = Math.abs(d);
      // Max reachable distance in [0.5, 1.0] is ≈ 0.53 * |d| (at t = 0.5).
      // If |d| is too small to reach borderRadius, skip the arrowhead entirely.
      const maxReachableDist = 3 * 0.5 * 0.5 * absD * Math.sqrt(0.5);
      const canReachBorder = absD > 0 && maxReachableDist >= borderRadius;
      if (canReachBorder) {
        for (let i = 0; i < 20; i++) {
          const mid = (lo + hi) / 2;
          const um = 1 - mid;
          const dist = 3 * um * mid * absD * Math.sqrt(mid * mid + um * um);
          if (dist > borderRadius) lo = mid;
          else hi = mid;
        }
      }
      const tArrow = (lo + hi) / 2;
      const uArrow = 1 - tArrow;
      const tipX = start.x + 3 * uArrow * tArrow * tArrow * d;
      const tipY = start.y - 3 * uArrow * uArrow * tArrow * d;

      ctx.strokeStyle = link.color;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      if (canReachBorder) {
        // Clip the bezier stroke at tArrow using De Casteljau subdivision so
        // the stroke stops exactly at the arrowhead tip and does not continue
        // through it. Split control points for the [0, tArrow] segment:
        //   CP1 = (sx,              sy - tArrow*d)
        //   CP2 = (sx + tArrow²*d,  sy - 2*tArrow*(1-tArrow)*d)
        //   End = B(tArrow) = (tipX, tipY)
        ctx.bezierCurveTo(
          start.x,
          start.y - tArrow * d,
          start.x + tArrow * tArrow * d,
          start.y - 2 * tArrow * uArrow * d,
          tipX,
          tipY,
        );
      } else {
        // d is too small to reach the node border — draw the full self-loop
        // back to the source node (t=1.0) so the loop is always complete.
        // Full bezier: P0=(sx,sy), P1=(sx,sy-d), P2=(sx+d,sy), P3=(sx,sy)
        ctx.bezierCurveTo(start.x, start.y - d, start.x + d, start.y, start.x, start.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Tangent at tArrow (direction the curve travels toward the node)
      const tdx = 3 * d * tArrow * (2 - 3 * tArrow);
      const tdy = -3 * d * uArrow * (1 - 3 * tArrow);
      const tLen = Math.sqrt(tdx * tdx + tdy * tdy);

      // Guard against zero-length tangent vector (e.g. when d ≈ 0) to avoid NaN
      // normals and invalid arrowhead geometry. Also skip when d is too small to
      // place the arrowhead at the node border (canReachBorder is false).
      if (!skipArrows && tLen !== 0 && canReachBorder) {
        const nx = tdx / tLen;
        const ny = tdy / tLen;
        pendingArrow = { tipX, tipY, nx, ny, arrowLen, arrowHalfWidth };
      }

      // Midpoint of cubic bezier: P0=(sx,sy), P1=(sx,sy-d), P2=(sx+d,sy), P3=(sx,sy)
      textX = start.x + 0.375 * d;
      textY = start.y - 0.375 * d;
      // Tangent at midpoint is (0.75d, 0.75d), angle always resolves to PI/4
      angle = Math.atan2(0.75 * d, 0.75 * d);
      if (angle > Math.PI / 2) angle = -(Math.PI - angle);
      if (angle < -Math.PI / 2) angle = -(-Math.PI - angle);
    } else {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Guard: skip drawing when source and target are co-located (e.g. during
      // simulation start-up). perpX/perpY would be NaN and propagate through
      // all downstream bezier and arrowhead calculations.
      if (distance === 0) {
        if (isLinkDimmed) ctx.restore();
        return;
      }

      const perpX = dy / distance;
      const perpY = -dx / distance;

      const curvature = link.curve || 0;
      const controlX =
        (start.x + end.x) / 2 + perpX * curvature * distance * 1.0;
      const controlY =
        (start.y + end.y) / 2 + perpY * curvature * distance * 1.0;

      const t = 0.5;
      const oneMinusT = 1 - t;
      textX =
        oneMinusT * oneMinusT * start.x +
        2 * oneMinusT * t * controlX +
        t * t * end.x;
      textY =
        oneMinusT * oneMinusT * start.y +
        2 * oneMinusT * t * controlY +
        t * t * end.y;

      const tangentX =
        2 * oneMinusT * (controlX - start.x) + 2 * t * (end.x - controlX);
      const tangentY =
        2 * oneMinusT * (controlY - start.y) + 2 * t * (end.y - controlY);
      angle = Math.atan2(tangentY, tangentX);

      if (angle > Math.PI / 2) angle = -(Math.PI - angle);
      if (angle < -Math.PI / 2) angle = -(-Math.PI - angle);

      // Draw regular link line and arrowhead
      const arrowHalfWidth = arrowLen / this.config.linkStyle.arrowWidthRatio / 2;

      // Target-side clip: place edge tip at borderRadius from node center
      // along the bezier tangent direction. Near t=1 the bezier is linear,
      // so t offset = borderRadius / (2 * |control - end|).
      const endNodeSize = end.size;
      const borderRadius = endNodeSize + (this.config.isNodeSelected?.(end) ? this.config.nodeStyle.strokeWidthSelected : this.config.nodeStyle.strokeWidthUnselected) + this.edgeGap;

      const ceX = controlX - end.x;
      const ceY = controlY - end.y;
      const ctrlEndDist = Math.sqrt(ceX * ceX + ceY * ceY);
      const tArrow = Math.max(0.5, 1 - borderRadius / (2 * ctrlEndDist));
      const uArrow = 1 - tArrow;

      const tipX = uArrow * uArrow * start.x + 2 * uArrow * tArrow * controlX + tArrow * tArrow * end.x;
      const tipY = uArrow * uArrow * start.y + 2 * uArrow * tArrow * controlY + tArrow * tArrow * end.y;

      // Source-side clip: place edge start at srcBorderRadius from node center
      const startNodeSize = start.size;
      const srcBorderRadius = startNodeSize + (this.config.isNodeSelected?.(start) ? 1 : 0.5) + this.edgeGap;

      const csX = controlX - start.x;
      const csY = controlY - start.y;
      const ctrlStartDist = Math.sqrt(csX * csX + csY * csY);
      const tStart = Math.min(0.5, srcBorderRadius / (2 * ctrlStartDist));

      // Gap start point: Q(tStart)
      const uS = 1 - tStart;
      const gapStartX = uS * uS * start.x + 2 * uS * tStart * controlX + tStart * tStart * end.x;
      const gapStartY = uS * uS * start.y + 2 * uS * tStart * controlY + tStart * tStart * end.y;

      // Sub-bezier [tStart, tArrow] control point via De Casteljau:
      //   Right sub-bezier at tStart → NewP1 = lerp(control, end, tStart)
      //   Left sub-curve at tArrow' = (tArrow-tStart)/(1-tStart) → ctrl = lerp(gapStart, NewP1, tArrow')
      const tArrowPrime = tStart < tArrow ? (tArrow - tStart) / (1 - tStart) : 0;
      const newP1X = (1 - tStart) * controlX + tStart * end.x;
      const newP1Y = (1 - tStart) * controlY + tStart * end.y;
      const subCtrlX = (1 - tArrowPrime) * gapStartX + tArrowPrime * newP1X;
      const subCtrlY = (1 - tArrowPrime) * gapStartY + tArrowPrime * newP1Y;

      ctx.strokeStyle = link.color;
      ctx.lineWidth = (isLinkSelected ? this.config.linkStyle.lineWidthSelected : this.config.linkStyle.lineWidthUnselected) / globalScale;

      ctx.setLineDash(this.config.linkLineDash?.(link) ?? []);
      ctx.beginPath();
      ctx.moveTo(gapStartX, gapStartY);
      ctx.quadraticCurveTo(subCtrlX, subCtrlY, tipX, tipY);
      ctx.stroke();
      ctx.setLineDash([]);

      const atx = 2 * uArrow * (controlX - start.x) + 2 * tArrow * (end.x - controlX);
      const aty = 2 * uArrow * (controlY - start.y) + 2 * tArrow * (end.y - controlY);
      const atLen = Math.sqrt(atx * atx + aty * aty);

      if (!skipArrows && atLen !== 0) {
        const nx = atx / atLen;
        const ny = aty / atLen;
        pendingArrow = { tipX, tipY, nx, ny, arrowLen, arrowHalfWidth };
      }
    }

    ctx.font = isLinkSelected ? `${this.config.linkStyle.fontWeightSelected} ${this.config.linkStyle.fontSize}px ${this.config.linkStyle.fontFamily}` : `${this.config.linkStyle.fontWeightUnselected} ${this.config.linkStyle.fontSize}px ${this.config.linkStyle.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (!skipLinkLabels) {
      const cacheKey = `${link.relationship}_${isLinkSelected ? "700" : "400"}`;
      let cached = this.relationshipsTextCache.get(cacheKey);

      if (!cached) {
        const metrics = ctx.measureText(link.relationship);
        const bgPadding = this.config.linkStyle.labelBackgroundPadding;

        cached = {
          textWidth: metrics.width + bgPadding * 2,
          textHeight: this.config.linkStyle.fontSize + bgPadding * 2,
        };
        this.relationshipsTextCache.set(cacheKey, cached);
      }

      const { textWidth, textHeight } = cached;

      ctx.save();
      ctx.translate(textX, textY);
      ctx.rotate(angle);

      ctx.fillStyle = this.config.backgroundColor;
      ctx.fillRect(
        -textWidth / 2,
        -textHeight / 2,
        textWidth,
        textHeight
      );

      ctx.fillStyle = getContrastTextColor(this.config.backgroundColor, this.config.interaction.contrastThreshold);
      ctx.fillText(link.relationship, 0, 0);
      ctx.restore();
    }

    // Draw arrowhead last so it always appears on top of the label background.
    if (pendingArrow) {
      const { tipX, tipY, nx, ny, arrowLen: aLen, arrowHalfWidth: aHW } = pendingArrow;
      ctx.fillStyle = link.color;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX - nx * aLen + ny * aHW, tipY - ny * aLen - nx * aHW);
      ctx.lineTo(tipX - nx * aLen * (1 - this.config.linkStyle.arrowNotchRatio), tipY - ny * aLen * (1 - this.config.linkStyle.arrowNotchRatio));
      ctx.lineTo(tipX - nx * aLen - ny * aHW, tipY - ny * aLen + nx * aHW);
      ctx.fill();
    }

    // Restore opacity after dimmed draw.
    if (isLinkDimmed) {
      ctx.restore();
    }
  }

  private pointerLink(link: GraphLink, color: string, ctx: CanvasRenderingContext2D) {
    const start = link.source;
    const end = link.target;

    if (start.x == null || start.y == null || end.x == null || end.y == null) return;

    // Viewport culling: skip hit-test painting for offscreen links.
    if (this.config.largeGraph?.enabled && !this.isLinkInCullingBounds(link)) return;

    ctx.strokeStyle = color;
    const basePointerWidth = this.config.interaction.linkHitWidth;
    const transform = typeof ctx.getTransform === 'function' ? ctx.getTransform() : null;
    if (transform) {
      const scaleX = Math.hypot(transform.a, transform.c);
      const scaleY = Math.hypot(transform.b, transform.d);
      const avgScale = (scaleX + scaleY) / 2 || 1;
      ctx.lineWidth = basePointerWidth / avgScale;
    } else {
      ctx.lineWidth = basePointerWidth;
    }
    ctx.beginPath();

    if (start.id === end.id) {
      // Self-loop: replicate exact cubic bezier clip from drawLink
      const nodeSize = start.size;
      const d = (link.curve || 0) * nodeSize * this.config.linkStyle.selfLoopCurveFactor;

      const nodeStrokeWidth = this.config.isNodeSelected?.(start) ? this.config.nodeStyle.strokeWidthSelected : this.config.nodeStyle.strokeWidthUnselected;
      const borderRadius = nodeSize + nodeStrokeWidth + this.edgeGap;
      const absD = Math.abs(d);
      const maxReachableDist = 3 * 0.5 * 0.5 * absD * Math.sqrt(0.5);
      const canReachBorder = absD > 0 && maxReachableDist >= borderRadius;

      ctx.moveTo(start.x, start.y);
      if (canReachBorder) {
        let lo = 0.5, hi = 1.0;
        for (let i = 0; i < 20; i++) {
          const mid = (lo + hi) / 2;
          const um = 1 - mid;
          const dist = 3 * um * mid * absD * Math.sqrt(mid * mid + um * um);
          if (dist > borderRadius) lo = mid;
          else hi = mid;
        }
        const tArrow = (lo + hi) / 2;
        const uArrow = 1 - tArrow;
        const tipX = start.x + 3 * uArrow * tArrow * tArrow * d;
        const tipY = start.y - 3 * uArrow * uArrow * tArrow * d;
        ctx.bezierCurveTo(
          start.x,
          start.y - tArrow * d,
          start.x + tArrow * tArrow * d,
          start.y - 2 * tArrow * uArrow * d,
          tipX,
          tipY,
        );
      } else {
        ctx.bezierCurveTo(start.x, start.y - d, start.x + d, start.y, start.x, start.y);
      }
    } else {
      // Regular link: replicate exact quadratic bezier clip from drawLink
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const curvature = link.curve || 0;

      if (distance === 0) {
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
      } else {
        const perpX = dy / distance;
        const perpY = -dx / distance;
        const controlX = (start.x + end.x) / 2 + perpX * curvature * distance;
        const controlY = (start.y + end.y) / 2 + perpY * curvature * distance;

        // Target-side clip: constant gap from node center along tangent direction
        const endNodeSize = end.size;
        const borderRadius = endNodeSize + (this.config.isNodeSelected?.(end) ? this.config.nodeStyle.strokeWidthSelected : this.config.nodeStyle.strokeWidthUnselected) + this.edgeGap;

        const ceX = controlX - end.x;
        const ceY = controlY - end.y;
        const ctrlEndDist = Math.sqrt(ceX * ceX + ceY * ceY);
        const tArrow = Math.max(0.5, 1 - borderRadius / (2 * ctrlEndDist));
        const uArrow = 1 - tArrow;
        const tipX = uArrow * uArrow * start.x + 2 * uArrow * tArrow * controlX + tArrow * tArrow * end.x;
        const tipY = uArrow * uArrow * start.y + 2 * uArrow * tArrow * controlY + tArrow * tArrow * end.y;

        // Source-side clip: constant gap from node center along tangent direction
        const startNodeSize = start.size;
        const srcBorderRadius = startNodeSize + (this.config.isNodeSelected?.(start) ? 1 : 0.5) + this.edgeGap;

        const csX = controlX - start.x;
        const csY = controlY - start.y;
        const ctrlStartDist = Math.sqrt(csX * csX + csY * csY);
        const tStart = Math.min(0.5, srcBorderRadius / (2 * ctrlStartDist));

        const uS = 1 - tStart;
        const gapStartX = uS * uS * start.x + 2 * uS * tStart * controlX + tStart * tStart * end.x;
        const gapStartY = uS * uS * start.y + 2 * uS * tStart * controlY + tStart * tStart * end.y;

        const tArrowPrime = tStart < tArrow ? (tArrow - tStart) / (1 - tStart) : 0;
        const newP1X = (1 - tStart) * controlX + tStart * end.x;
        const newP1Y = (1 - tStart) * controlY + tStart * end.y;
        const subCtrlX = (1 - tArrowPrime) * gapStartX + tArrowPrime * newP1X;
        const subCtrlY = (1 - tArrowPrime) * gapStartY + tArrowPrime * newP1Y;

        ctx.moveTo(gapStartX, gapStartY);
        ctx.quadraticCurveTo(subCtrlX, subCtrlY, tipX, tipY);
      }
    }

    ctx.stroke();
  }

  private handleEngineStop() {
    if (!this.graph) return;
    this.log('Engine stopped');
    this.updateCanvasSimulationAttribute(false);
    this.config.eventHandlers?.onEngineStop?.();
  }

  private updateEventHandlers() {
    this.bindEventHandlers();
  }

  private bindEventHandlers() {
    if (!this.graph) return;

    this.graph
      .onNodeClick((node: GraphNode, event: MouseEvent) => {
        this.config.eventHandlers?.onNodeClick?.(node, event);
        this.triggerRender();
      })
      .onLinkClick((link: GraphLink, event: MouseEvent) => {
        this.config.eventHandlers?.onLinkClick?.(link, event);
        this.triggerRender();
      })
      .onNodeRightClick((node: GraphNode, event: MouseEvent) => {
        this.config.eventHandlers?.onNodeRightClick?.(node, event);
        this.triggerRender();
      })
      .onLinkRightClick((link: GraphLink, event: MouseEvent) => {
        this.config.eventHandlers?.onLinkRightClick?.(link, event);
        this.triggerRender();
      })
      .onNodeDragEnd((node: GraphNode, translate: {x: number, y: number}) => {
        if (this.config.pinOnDragEnd && node.fx !== undefined && node.fy !== undefined) {
          // Node is pinned — snap back to original position
          node.x = (node.x ?? 0) - translate.x;
          node.y = (node.y ?? 0) - translate.y;
          node.fx = node.x;
          node.fy = node.y;
          node.vx = 0;
          node.vy = 0;
        } else if (this.config.pinOnDragEnd) {
          // Pin mode but node wasn't pinned yet — pin at drop position
          node.fx = node.x;
          node.fy = node.y;
        }
        this.config.eventHandlers?.onNodeDragEnd?.(node);
      })
      .onNodeHover((node: GraphNode | null) => {
        this.config.eventHandlers?.onNodeHover?.(node);
      })
      .onLinkHover((link: GraphLink | null) => {
        this.config.eventHandlers?.onLinkHover?.(link);
      })
      .onBackgroundClick((event: MouseEvent) => {
        this.config.eventHandlers?.onBackgroundClick?.(event);
        this.triggerRender();
      })
      .onBackgroundRightClick((event: MouseEvent) => {
        this.config.eventHandlers?.onBackgroundRightClick?.(event);
      })
      .onZoom((transform: Transform) => {
        this.updateCullingBounds(transform);
        this.config.eventHandlers?.onZoom?.(transform);
      })
      .onEngineStop(() => {
        this.handleEngineStop();
        this.config.eventHandlers?.onEngineStop?.();
      })
      .nodeCanvasObject((node: GraphNode, ctx: CanvasRenderingContext2D) => {
        if (this.config.node) {
          this.config.node.nodeCanvasObject(node, ctx);
          // Schedule re-render if the node has an active glow (expand/collapse animation)
          const [, expandTime] = node.expand;
          const expandAge = Date.now() - expandTime.getTime();
          const glowDuration = this.config.nodeStyle.glowDuration;
          if (expandAge < glowDuration) {
            setTimeout(() => {
              this.triggerRender();
            }, Math.min(100, glowDuration - expandAge));
          }
        } else {
          this.drawNode(node, ctx);
        }
      })
      .linkCanvasObject((link: GraphLink, ctx: CanvasRenderingContext2D, globalScale: number) => {
        if (this.config.link) {
          this.config.link.linkCanvasObject(link, ctx, globalScale);
        } else {
          this.drawLink(link, ctx, globalScale);
        }
      });

    if (this.config.node) {
      this.graph.nodePointerAreaPaint((node: GraphNode, color: string, ctx: CanvasRenderingContext2D) => {
        this.config.node!.nodePointerAreaPaint(node, color, ctx);
      });
    } else {
      this.graph.nodePointerAreaPaint((node: GraphNode, color: string, ctx: CanvasRenderingContext2D) => {
        this.pointerNode(node, color, ctx);
      });
    }

    if (this.config.link) {
      this.graph.linkPointerAreaPaint((link: GraphLink, color: string, ctx: CanvasRenderingContext2D) => {
        this.config.link!.linkPointerAreaPaint(link, color, ctx);
      });
    } else {
      this.graph.linkPointerAreaPaint((link: GraphLink, color: string, ctx: CanvasRenderingContext2D) => {
        this.pointerLink(link, color, ctx);
      });
    }
  }

  private updateTooltipStyles() {
    if (!this.shadowRoot) return;

    const existingStyle = this.shadowRoot.querySelector('style');
    if (existingStyle) {
      const newStyle = createStyles(this.config.backgroundColor, this.config.foregroundColor, this.config.interaction);
      existingStyle.textContent = newStyle.textContent;
    }
  }
}

// Define the custom element
if (typeof window !== "undefined" && !customElements.get("falkordb-canvas")) {
  customElements.define("falkordb-canvas", FalkorDBCanvas);
}

export default FalkorDBCanvas;
