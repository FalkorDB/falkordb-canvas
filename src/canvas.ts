/* eslint-disable no-param-reassign */

import ForceGraph from "force-graph";
import * as d3 from "d3";
import {
  Data,
  ForceGraphInstance,
  GraphData,
  GraphLink,
  GraphNode,
  ForceGraphConfig,
  ViewportState,
  Transform,
  CanvasRenderMode,
  InternalForceGraphConfig,
} from "./canvas-types.js";
import {
  dataToGraphData,
  getContrastTextColor,
  getNodeDisplayText,
  graphDataToData,
  LINK_DISTANCE,
  wrapTextForCircularNode,
} from "./canvas-utils.js";

const PADDING = 2;

// Force constants
const CHARGE_STRENGTH = -400;
const CENTER_STRENGTH = 0.03;
const VELOCITY_DECAY = 0.4;
const ALPHA_MIN = 0.05;

// Create styles for the web component
function createStyles(backgroundColor: string, foregroundColor: string): HTMLStyleElement {
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
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      white-space: nowrap;
      z-index: 1000;
    }
  `;
  return style;
}

class FalkorDBCanvas extends HTMLElement {
  private graph: ForceGraphInstance;

  private container: HTMLDivElement | null = null;

  private loadingOverlay: HTMLDivElement | null = null;

  private resizeObserver: ResizeObserver | null = null;

  private data: GraphData = { nodes: [], links: [] };

  private debugEnabled: boolean = false;

  private config: InternalForceGraphConfig = {
    backgroundColor: '#FFFFFF',
    foregroundColor: '#1A1A1A',
    captionsKeys: [],
    showPropertyKeyPrefix: false,
  };

  private nodeMode: CanvasRenderMode = 'replace';

  private linkMode: CanvasRenderMode = 'replace';

  private nodeDegreeMap: Map<number, number> = new Map();

  private relationshipsTextCache: Map<
    string,
    {
      textWidth: number;
      textHeight: number;
      textYOffset: number;
    }
  > = new Map();

  private viewport: ViewportState;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  /**
   * Enable or disable debug logging
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
  }

  disconnectedCallback() {
    this.log('Component disconnected from DOM');
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.graph) {
      // eslint-disable-next-line no-underscore-dangle
      this.graph._destructor();
    }
  }

  setConfig(config: Partial<ForceGraphConfig>) {
    this.log('Setting config:', config);
    Object.assign(this.config, config);

    // Update event handlers if they were provided
    if (config.onNodeClick || config.onLinkClick || config.onNodeRightClick || config.onLinkRightClick ||
      config.onNodeHover || config.onLinkHover || config.onBackgroundClick || config.onBackgroundRightClick || config.onZoom ||
      config.onEngineStop || config.isNodeSelected || config.isLinkSelected || config.linkLineDash || config.node || config.link) {
      this.log('Updating event handlers');
      this.updateEventHandlers();
    }
  }

  setWidth(width: number) {
    if (this.config.width === width) return;
    this.log('Setting width to:', width);
    this.config.width = width;
    if (this.graph) {
      this.graph.width(width);
    }
  }

  setHeight(height: number) {
    if (this.config.height === height) return;
    this.log('Setting height to:', height);
    this.config.height = height;
    if (this.graph) {
      this.graph.height(height);
    }
  }

  setBackgroundColor(color: string) {
    if (this.config.backgroundColor === color) return;
    this.log('Setting background color to:', color);
    this.config.backgroundColor = color;
    if (this.graph) {
      this.graph.backgroundColor(color);
    }
    if (this.loadingOverlay) {
      this.loadingOverlay.style.background = color;
    }
    this.updateTooltipStyles();
  }

  setForegroundColor(color: string) {
    if (this.config.foregroundColor === color) return;
    this.log('Setting foreground color to:', color);
    this.config.foregroundColor = color;
    this.updateTooltipStyles();
    this.triggerRender();
  }

  setIsLoading(isLoading: boolean) {
    if (this.config.isLoading === isLoading) return;
    this.log('Setting loading state to:', isLoading);
    this.config.isLoading = isLoading;
    this.updateLoadingState();
  }

  setCooldownTicks(ticks: number | undefined) {
    if (this.config.cooldownTicks === ticks) return;
    this.log('Setting cooldown ticks to:', ticks);
    this.config.cooldownTicks = ticks;
    if (this.graph) {
      this.graph.cooldownTicks(ticks ?? Infinity);
    }

    this.updateCanvasSimulationAttribute(ticks !== 0);
  }

  getData(): Data {
    return graphDataToData(this.data);
  }

  setData(data: Data) {
    this.log('setData called with', data.nodes.length, 'nodes and', data.links.length, 'links');
    // Convert data and apply circular layout to new nodes only
    this.data = dataToGraphData(data);

    this.config.cooldownTicks = this.data.nodes.length > 0 ? undefined : 0;
    this.config.isLoading = this.data.nodes.length > 0;
    this.log('Loading state:', this.config.isLoading);
    this.config.onLoadingChange?.(this.config.isLoading);

    // Update simulation state
    if (this.data.nodes.length > 0) {
      this.updateCanvasSimulationAttribute(true);
    }

    // Initialize graph if it hasn't been initialized yet
    if (!this.graph && this.container) {
      this.log('Initializing graph');
      this.initGraph();
    }

    if (!this.graph) return;

    this.log('Calculating node degrees and setting up forces');
    this.calculateNodeDegree();
    this.setupForces();

    // Update graph data and properties
    this.graph
      .graphData(this.data)
      .cooldownTicks(this.config.cooldownTicks ?? Infinity);

    this.updateLoadingState();
  }

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

  setViewport(viewport: ViewportState) {
    this.log('Setting viewport:', viewport);
    this.viewport = viewport;
  }

  getGraphData(): GraphData {
    return this.data;
  }

  setGraphData(data: GraphData) {
    this.log('setGraphData called with', data.nodes.length, 'nodes and', data.links.length, 'links');
    this.data = data;

    if (!this.graph) return;

    this.calculateNodeDegree();
    this.setupForces();

    this.graph
      .graphData(this.data)

    if (this.viewport) {
      this.log('Applying viewport:', this.viewport);
      this.graph.zoom(this.viewport.zoom, 0);
      this.graph.centerAt(this.viewport.centerX, this.viewport.centerY, 0);
      this.viewport = undefined;
    }
  }

  getGraph(): ForceGraphInstance | undefined {
    return this.graph;
  }

  public getZoom(): number {
    return this.graph?.zoom() || 0;
  }

  public zoom(zoomLevel: number): ForceGraphInstance | undefined {
    if (!this.graph) return;

    this.log('Setting zoom level to:', zoomLevel);
    return this.graph.zoom(zoomLevel);
  }

  public zoomToFit(paddingMultiplier = 1, filter?: (node: GraphNode) => boolean) {
    if (!this.graph || !this.shadowRoot) return;

    // Get canvas from shadow DOM
    const canvas = this.shadowRoot.querySelector("canvas") as HTMLCanvasElement;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();

    // Calculate padding as 10% of the smallest canvas dimension
    const minDimension = Math.min(rect.width, rect.height);
    const padding = minDimension * 0.1;

    this.log('Zooming to fit with padding multiplier:', paddingMultiplier, 'padding:', padding * paddingMultiplier);
    // Use the force-graph's built-in zoomToFit method
    this.graph.zoomToFit(500, padding * paddingMultiplier, filter);
  }

  private triggerRender() {
    if (!this.graph || this.graph.cooldownTicks() !== 0) return;

    // If simulation is stopped (0), trigger one tick to re-render
    this.graph.cooldownTicks(1);
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

  private createLoadingOverlay(): HTMLDivElement {
    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position: absolute;
      inset: 0;
      display: none;
      align-items: center;
      justify-content: center;
      background: ${this.config.backgroundColor};
      z-index: 10;
    `;

    // Create skeleton loading structure (matching Spinning component pattern)
    const skeletonContainer = document.createElement("div");
    skeletonContainer.style.cssText = `
      display: flex;
      align-items: center;
      gap: 1rem;
    `;

    // Create circular skeleton (matching h-12 w-12 rounded-full)
    const circle = document.createElement("div");
    circle.style.cssText = `
      height: 3rem;
      width: 3rem;
      border-radius: 9999px;
      background-color: #CCCCCC;
      animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    `;

    // Create lines container (matching space-y-2)
    const linesContainer = document.createElement("div");
    linesContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    `;

    // Create first line (matching h-4 w-[250px])
    const line1 = document.createElement("div");
    line1.style.cssText = `
      height: 1rem;
      width: 250px;
      border-radius: 0.375rem;
      background-color: #CCCCCC;
      animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    `;

    // Create second line (matching h-4 w-[200px])
    const line2 = document.createElement("div");
    line2.style.cssText = `
      height: 1rem;
      width: 200px;
      border-radius: 0.375rem;
      background-color: #CCCCCC;
      animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    `;

    linesContainer.appendChild(line1);
    linesContainer.appendChild(line2);
    skeletonContainer.appendChild(circle);
    skeletonContainer.appendChild(linesContainer);
    overlay.appendChild(skeletonContainer);

    return overlay;
  }

  private render() {
    if (!this.shadowRoot) return;

    this.log('Rendering canvas component');
    // Create container
    this.container = document.createElement("div");
    this.container.style.width = "100%";
    this.container.style.height = "100%";
    this.container.style.position = "relative";

    // Create loading overlay
    this.loadingOverlay = this.createLoadingOverlay();

    // Add styles using standalone function
    const style = createStyles(this.config.backgroundColor, this.config.foregroundColor);

    this.shadowRoot.appendChild(style);
    this.shadowRoot.appendChild(this.container);
    this.initGraph();
    this.container.appendChild(this.loadingOverlay);
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      .linkLineDash((link: GraphLink) => this.config.linkLineDash?.(link) ?? null)
      .linkCurvature("curve")
      .linkVisibility("visible")
      .nodeVisibility("visible")
      .cooldownTicks(this.config.cooldownTicks ?? Infinity) // undefined = infinite
      .cooldownTime(this.config.cooldownTime ?? 2000)
      .enableNodeDrag(true)
      .enableZoomInteraction(true)
      .enablePanInteraction(true)
      .onNodeClick((node: GraphNode, event: MouseEvent) => {
        if (this.config.onNodeClick) {
          this.config.onNodeClick(node, event);
        }
      })
      .onLinkClick((link: GraphLink, event: MouseEvent) => {
        if (this.config.onLinkClick) {
          this.config.onLinkClick(link, event);
        }
      })
      .onNodeRightClick((node: GraphNode, event: MouseEvent) => {
        if (this.config.onNodeRightClick) {
          this.config.onNodeRightClick(node, event);
        }
      })
      .onLinkRightClick((link: GraphLink, event: MouseEvent) => {
        if (this.config.onLinkRightClick) {
          this.config.onLinkRightClick(link, event);
        }
      })
      .onNodeHover((node: GraphNode | null) => {
        if (this.config.onNodeHover) {
          this.config.onNodeHover(node);
        }
      })
      .onLinkHover((link: GraphLink | null) => {
        if (this.config.onLinkHover) {
          this.config.onLinkHover(link);
        }
      })
      .onBackgroundClick((event: MouseEvent) => {
        if (this.config.onBackgroundClick) {
          this.config.onBackgroundClick(event);
        }
      })
      .onBackgroundRightClick((event: MouseEvent) => {
        if (this.config.onBackgroundRightClick) {
          this.config.onBackgroundRightClick(event);
        }
      })
      .onZoom((transform: Transform) => {
        if (this.config.onZoom) {
          this.config.onZoom(transform);
        }
      })
      .onEngineStop(() => {
        this.handleEngineStop();
        if (this.config.onEngineStop) {
          this.config.onEngineStop();
        }
      })
      .linkLineDash((link: GraphLink) => this.config.linkLineDash?.(link) ?? null)
      .nodeCanvasObject((node: GraphNode, ctx: CanvasRenderingContext2D) => {
        if (this.config.node) {
          this.config.node.nodeCanvasObject(node, ctx);
        } else {
          this.drawNode(node, ctx);
        }
      })
      .linkCanvasObject((link: GraphLink, ctx: CanvasRenderingContext2D, globalScale: number) => {
        if (this.config.link) {
          this.config.link.linkCanvasObject(link, ctx);
        } else {
          this.drawLink(link, ctx, globalScale);
        }
      })
      .nodePointerAreaPaint((node: GraphNode, color: string, ctx: CanvasRenderingContext2D) => {
        if (this.config.node) {
          this.config.node?.nodePointerAreaPaint(node, color, ctx);
        } else {
          this.pointerNode(node, color, ctx);
        }

      })
      .linkPointerAreaPaint((link: GraphLink, color: string, ctx: CanvasRenderingContext2D) => {
        if (this.config.link) {
          this.config.link?.linkPointerAreaPaint(link, color, ctx);
        } else {
          this.pointerLink(link, color, ctx);
        }
      });


    // Setup forces
    this.setupForces();
    this.log('Force graph initialization complete');
  }

  private setupForces() {
    this.log('Setting up force simulation');
    const linkForce = this.graph?.d3Force("link");

    if (!linkForce) return;
    if (!this.graph) return;

    // distance based on node size + constant
    linkForce
      .distance((link: GraphLink) => {
        const sourceSize = link.source.size;
        const targetSize = link.target.size;
        return sourceSize + targetSize + LINK_DISTANCE * 2;
      });

    // Collision force - node size + padding
    this.graph.d3Force(
      "collide",
      d3.forceCollide((node: GraphNode) => node.size + 25)
    );

    // Center forces - separate X and Y forces
    this.graph.d3Force(
      "centerX",
      d3.forceX(0).strength(CENTER_STRENGTH)
    );

    this.graph.d3Force(
      "centerY",
      d3.forceY(0).strength(CENTER_STRENGTH)
    );

    // Charge force
    const chargeForce = this.graph.d3Force("charge");
    if (chargeForce) {
      chargeForce.strength(CHARGE_STRENGTH);
    }

    // Set velocity decay and alpha min
    // Access the underlying d3 simulation
    const simulation = this.graph.d3Force('simulation');
    if (simulation && typeof simulation === 'object') {
      // @ts-ignore - accessing d3 simulation methods
      if (simulation.velocityDecay) simulation.velocityDecay(VELOCITY_DECAY);
      // @ts-ignore
      if (simulation.alphaMin) simulation.alphaMin(ALPHA_MIN);
    }
    this.log('Force simulation setup complete');
  }

  private drawNode(node: GraphNode, ctx: CanvasRenderingContext2D) {
    if (node.x == null || node.y == null) return;

    ctx.lineWidth = this.config.isNodeSelected?.(node) ? 1 : 0.5;
    ctx.strokeStyle = this.config.foregroundColor;
    ctx.fillStyle = node.color;

    const radius = node.size + ctx.lineWidth / 2;

    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(node.x, node.y, node.size, 0, 2 * Math.PI, false);
    ctx.fill();

    // Draw text
    ctx.fillStyle = getContrastTextColor(node.color);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "400 2px SofiaSans";

    let [line1, line2] = node.displayName;

    if (!line1 && !line2) {
      const text = getNodeDisplayText(node, this.config.captionsKeys, this.config.showPropertyKeyPrefix);
      const textRadius = node.size - PADDING / 2;
      [line1, line2] = wrapTextForCircularNode(ctx, text, textRadius);
      node.displayName = [line1, line2];
    }

    const textMetrics = ctx.measureText(line1);
    const textHeight =
      textMetrics.actualBoundingBoxAscent +
      textMetrics.actualBoundingBoxDescent;
    const halfTextHeight = (textHeight / 2) * 1.5;

    if (line1) {
      ctx.fillText(line1, node.x, line2 ? node.y - halfTextHeight : node.y);
    }
    if (line2) {
      ctx.fillText(line2, node.x, node.y + halfTextHeight);
    }
  }

  private pointerNode(node: GraphNode, color: string, ctx: CanvasRenderingContext2D) {
    if (node.x == null || node.y == null) return;

    const radius = node.size + PADDING;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
    ctx.fill();
  }

  private drawLink(link: GraphLink, ctx: CanvasRenderingContext2D, globalScale: number) {
    const start = link.source;
    const end = link.target;

    if (start.x == null || start.y == null || end.x == null || end.y == null) return;

    let textX;
    let textY;
    let angle;

    if (start.id === end.id) {
      const nodeSize = start.size || 6;
      const d = (link.curve || 0) * nodeSize * 11.67;

      ctx.lineWidth = (this.config.isLinkSelected?.(link) ? 2 : 1) / globalScale;

      // The visible outer edge of the node border is nodeSize + strokeWidth
      // (stroke is centered on nodeSize + strokeWidth/2, so outer edge = nodeSize + strokeWidth).
      const nodeStrokeWidth = this.config.isNodeSelected?.(start) ? 1 : 0.5;
      const borderRadius = nodeSize + nodeStrokeWidth;

      // Binary search for tArrow near 1.0 where the curve is at distance borderRadius
      // from the node center (i.e. on the outer edge of the node border stroke).
      // Bezier parametric form: Bx(t)=sx+3(1-t)t²d, By(t)=sy-3(1-t)²td
      // dist(t) = 3*(1-t)*t*|d|*sqrt(t² + (1-t)²)
      const ARROW_WH_RATIO = 1.6;
      const ARROW_VLEN_RATIO = 0.2;
      const arrowLen = this.config.isLinkSelected?.(link) ? 4 : 2;
      const arrowHalfWidth = arrowLen / ARROW_WH_RATIO / 2;
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

      // Tangent at tArrow (direction the curve travels toward the node)
      const tdx = 3 * d * tArrow * (2 - 3 * tArrow);
      const tdy = -3 * d * uArrow * (1 - 3 * tArrow);
      const tLen = Math.sqrt(tdx * tdx + tdy * tdy);

      // Guard against zero-length tangent vector (e.g. when d ≈ 0) to avoid NaN
      // normals and invalid arrowhead geometry. Also skip when d is too small to
      // place the arrowhead at the node border (canReachBorder is false).
      if (tLen !== 0 && canReachBorder) {
        const nx = tdx / tLen;
        const ny = tdy / tLen;

        ctx.fillStyle = link.color;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(
          tipX - nx * arrowLen + ny * arrowHalfWidth,
          tipY - ny * arrowLen - nx * arrowHalfWidth,
        );
        ctx.lineTo(
          tipX - nx * arrowLen * (1 - ARROW_VLEN_RATIO),
          tipY - ny * arrowLen * (1 - ARROW_VLEN_RATIO),
        );
        ctx.lineTo(
          tipX - nx * arrowLen - ny * arrowHalfWidth,
          tipY - ny * arrowLen + nx * arrowHalfWidth,
        );
        ctx.fill();
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
      if (distance === 0) return;

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

      // --- Draw the regular link line and arrowhead ---
      const ARROW_WH_RATIO = 1.6;
      const ARROW_VLEN_RATIO = 0.2;
      // Scale arrow geometry by 1/globalScale so arrowheads remain visually
      // consistent across zoom levels, matching ctx.lineWidth / globalScale.
      const baseArrowLen = this.config.isLinkSelected?.(link) ? 4 : 2;
      const arrowLen = baseArrowLen / globalScale;
      const arrowHalfWidth = arrowLen / ARROW_WH_RATIO / 2;

      // Binary-search for tArrow near 1.0 where the quadratic bezier
      // Q(t) = (1-t)²·start + 2(1-t)t·control + t²·end
      // is at distance borderRadius from the target node centre.
      const endNodeSize = end.size || 6;
      const endNodeStrokeWidth = this.config.isNodeSelected?.(end) ? 1 : 0.5;
      const borderRadius = endNodeSize + endNodeStrokeWidth;
      const borderRadiusSq = borderRadius * borderRadius;

      // When borderRadius is small relative to the chord length, the bezier and
      // chord diverge only near t=1, so a linear approximation is accurate and
      // avoids the per-frame search cost on large graphs.
      let tArrow: number;
      if (borderRadius / distance < 0.02) {
        tArrow = Math.min(1, Math.max(0, 1 - borderRadius / distance));
      } else {
        let lo = 0.5, hi = 1.0;
        for (let i = 0; i < 10; i++) {
          const mid = (lo + hi) / 2;
          const um = 1 - mid;
          const qx = um * um * start.x + 2 * um * mid * controlX + mid * mid * end.x;
          const qy = um * um * start.y + 2 * um * mid * controlY + mid * mid * end.y;
          const dxEnd = qx - end.x;
          const dyEnd = qy - end.y;
          if (dxEnd * dxEnd + dyEnd * dyEnd > borderRadiusSq) lo = mid;
          else hi = mid;
          if (hi - lo < 1e-3) break;
        }
        tArrow = (lo + hi) / 2;
      }
      const uArrow = 1 - tArrow;

      // Tip = Q(tArrow)
      const tipX = uArrow * uArrow * start.x + 2 * uArrow * tArrow * controlX + tArrow * tArrow * end.x;
      const tipY = uArrow * uArrow * start.y + 2 * uArrow * tArrow * controlY + tArrow * tArrow * end.y;

      // Clipped quadratic bezier [0, tArrow] via De Casteljau:
      //   new control = lerp(start, control, tArrow)
      const clippedCtrlX = start.x + tArrow * (controlX - start.x);
      const clippedCtrlY = start.y + tArrow * (controlY - start.y);

      ctx.strokeStyle = link.color;
      ctx.lineWidth = (this.config.isLinkSelected?.(link) ? 2 : 1) / globalScale;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.quadraticCurveTo(clippedCtrlX, clippedCtrlY, tipX, tipY);
      ctx.stroke();

      // Arrowhead tangent at tArrow: Q'(t) = 2(1-t)(control-start) + 2t(end-control)
      const atx = 2 * uArrow * (controlX - start.x) + 2 * tArrow * (end.x - controlX);
      const aty = 2 * uArrow * (controlY - start.y) + 2 * tArrow * (end.y - controlY);
      const atLen = Math.sqrt(atx * atx + aty * aty);

      if (atLen !== 0) {
        const nx = atx / atLen;
        const ny = aty / atLen;

        ctx.fillStyle = link.color;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - nx * arrowLen + ny * arrowHalfWidth, tipY - ny * arrowLen - nx * arrowHalfWidth);
        ctx.lineTo(
          tipX - nx * arrowLen * (1 - ARROW_VLEN_RATIO),
          tipY - ny * arrowLen * (1 - ARROW_VLEN_RATIO),
        );
        ctx.lineTo(tipX - nx * arrowLen - ny * arrowHalfWidth, tipY - ny * arrowLen + nx * arrowHalfWidth);
        ctx.fill();
      }
    }

    ctx.font = "400 2px SofiaSans";
    ctx.textAlign = "center";
    // Draw text with alphabetic baseline, positioned so visual center is at y=0
    ctx.textBaseline = "alphabetic";

    let cached = this.relationshipsTextCache.get(link.relationship);

    if (!cached) {
      const metrics = ctx.measureText(link.relationship);
      // Use font-level metrics for consistent height across all texts
      const fontAscent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent;
      const fontDescent = metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent;
      // Calculate visual center offset from baseline using font-level metrics
      const visualCenter = (fontAscent - fontDescent) / 2;
      cached = {
        textWidth: metrics.width,
        textHeight: fontAscent + fontDescent,
        textYOffset: visualCenter,
      };
      this.relationshipsTextCache.set(link.relationship, cached);
    }

    const { textWidth, textHeight, textYOffset } = cached;

    ctx.save();
    ctx.translate(textX, textY);
    ctx.rotate(angle);

    // Draw background centered on the link line (y=0)
    ctx.fillStyle = this.config.backgroundColor;

    // Offset background to match text visual center
    ctx.fillRect(
      -textWidth / 2,
      -textHeight / 2,
      textWidth,
      textHeight
    );

    ctx.fillStyle = getContrastTextColor(this.config.backgroundColor);
    ctx.fillText(link.relationship, 0, textYOffset);
    ctx.restore();
  }

  private pointerLink(link: GraphLink, color: string, ctx: CanvasRenderingContext2D) {
    const start = link.source;
    const end = link.target;

    if (start.x == null || start.y == null || end.x == null || end.y == null) return;

    ctx.strokeStyle = color;
    const basePointerWidth = 10; // Desired on-screen pointer area thickness
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
      // Self-loop: replicate the cubic bezier from drawLink
      const nodeSize = start.size || 6;
      const d = (link.curve || 0) * nodeSize * 11.67;
      ctx.moveTo(start.x, start.y);
      ctx.bezierCurveTo(start.x, start.y - d, start.x + d, start.y, start.x, start.y);
    } else {
      // Regular link: replicate the quadratic bezier from drawLink
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
        ctx.moveTo(start.x, start.y);
        ctx.quadraticCurveTo(controlX, controlY, end.x, end.y);
      }
    }

    ctx.stroke();
  }

  private updateLoadingState() {
    if (!this.loadingOverlay) return;

    if (this.config.isLoading) {
      this.log('Showing loading overlay');
      this.loadingOverlay.style.display = "flex";
    } else {
      this.log('Hiding loading overlay');
      this.loadingOverlay.style.display = "none";
    }
  }

  private handleEngineStop() {
    if (!this.graph) return;

    this.log('Engine stopped');
    // If already stopped, just ensure any leftover loading state is cleared and return
    if (this.config.cooldownTicks === 0) {
      if (this.config.isLoading) {
        this.log('Clearing leftover loading state on already-stopped engine');
        this.config.isLoading = false;
        this.config.onLoadingChange?.(this.config.isLoading);
        this.updateLoadingState();
      }
      return;
    }

    const nodeCount = this.data.nodes.length;
    const paddingMultiplier = nodeCount < 2 ? 4 : 1;
    this.log('Auto-zooming to fit with padding multiplier:', paddingMultiplier);
    this.zoomToFit(paddingMultiplier);

    // Stop the force simulation after centering (only if autoStopOnSettle is true)
    if (this.config.autoStopOnSettle !== false) {
      this.log('Auto-stopping simulation on settle');
      setTimeout(() => {
        if (!this.graph) return;
        // Stop loading
        this.config.isLoading = false;
        this.config.onLoadingChange?.(this.config.isLoading);
        this.updateLoadingState();

        // Stop the simulation
        this.config.cooldownTicks = 0;
        this.graph.cooldownTicks(0);

        // Update simulation state
        this.updateCanvasSimulationAttribute(false);
        this.log('Simulation stopped');
      }, 1000);
    } else {
      this.log('Not auto-stopping simulation (autoStopOnSettle is false)');
      // Just update loading state without stopping
      this.config.isLoading = false;
      this.config.onLoadingChange?.(this.config.isLoading);
      this.updateLoadingState();
    }
  }

  private updateEventHandlers() {
    if (!this.graph) return;

    this.graph
      .onNodeClick((node: GraphNode, event: MouseEvent) => {
        if (this.config.onNodeClick) {
          this.config.onNodeClick(node, event);
        }
      })
      .onLinkClick((link: GraphLink, event: MouseEvent) => {
        if (this.config.onLinkClick) {
          this.config.onLinkClick(link, event);
        }
      })
      .onNodeRightClick((node: GraphNode, event: MouseEvent) => {
        if (this.config.onNodeRightClick) {
          this.config.onNodeRightClick(node, event);
        }
      })
      .onLinkRightClick((link: GraphLink, event: MouseEvent) => {
        if (this.config.onLinkRightClick) {
          this.config.onLinkRightClick(link, event);
        }
      })
      .onNodeHover((node: GraphNode | null) => {
        if (this.config.onNodeHover) {
          this.config.onNodeHover(node);
        }
      })
      .onLinkHover((link: GraphLink | null) => {
        if (this.config.onLinkHover) {
          this.config.onLinkHover(link);
        }
      })
      .onBackgroundClick((event: MouseEvent) => {
        if (this.config.onBackgroundClick) {
          this.config.onBackgroundClick(event);
        }
      })
      .onBackgroundRightClick((event: MouseEvent) => {
        if (this.config.onBackgroundRightClick) {
          this.config.onBackgroundRightClick(event);
        }
      })
      .onZoom((transform: Transform) => {
        if (this.config.onZoom) {
          this.config.onZoom(transform);
        }
      })
      .onEngineStop(() => {
        this.handleEngineStop();
        if (this.config.onEngineStop) {
          this.config.onEngineStop();
        }
      })
      .linkLineDash((link: GraphLink) => this.config.linkLineDash?.(link) ?? null)
      .nodeCanvasObject((node: GraphNode, ctx: CanvasRenderingContext2D) => {
        if (this.config.node) {
          this.config.node.nodeCanvasObject(node, ctx);
        } else {
          this.drawNode(node, ctx);
        }
      })
      .linkCanvasObject((link: GraphLink, ctx: CanvasRenderingContext2D, globalScale: number) => {
        if (this.config.link) {
          this.config.link.linkCanvasObject(link, ctx);
        } else {
          this.drawLink(link, ctx, globalScale);
        }
      })
      .nodePointerAreaPaint((node: GraphNode, color: string, ctx: CanvasRenderingContext2D) => {
        if (this.config.node) {
          this.config.node.nodePointerAreaPaint(node, color, ctx);
        } else {
          this.pointerNode(node, color, ctx);
        }
      })
      .linkPointerAreaPaint((link: GraphLink, color: string, ctx: CanvasRenderingContext2D) => {
        if (this.config.link) {
          this.config.link.linkPointerAreaPaint(link, color, ctx);
        } else {
          this.pointerLink(link, color, ctx);
        }
      });
  }

  private updateTooltipStyles() {
    if (!this.shadowRoot) return;

    const existingStyle = this.shadowRoot.querySelector('style');
    if (existingStyle) {
      const newStyle = createStyles(this.config.backgroundColor, this.config.foregroundColor);
      existingStyle.textContent = newStyle.textContent;
    }
  }
}

// Define the custom element
if (typeof window !== "undefined" && !customElements.get("falkordb-canvas")) {
  customElements.define("falkordb-canvas", FalkorDBCanvas);
}

export default FalkorDBCanvas;
