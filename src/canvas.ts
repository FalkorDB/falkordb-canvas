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
  wrapTextForCircularNode,
} from "./canvas-utils.js";

const NODE_SIZE = 6;
const PADDING = 2;

// Force constants
const LINK_DISTANCE = 50;
const MAX_LINK_DISTANCE = 80;
const LINK_STRENGTH = 0.5;
const MIN_LINK_STRENGTH = 0.3;
const COLLISION_STRENGTH = 1.35;
const CHARGE_STRENGTH = -5;
const CENTER_STRENGTH = 0.4;
const HIGH_DEGREE_PADDING = 1.25;
const DEGREE_STRENGTH_DECAY = 15;
const CROWDING_THRESHOLD = 10;

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

  private config: InternalForceGraphConfig = {
    backgroundColor: '#FFFFFF',
    foregroundColor: '#1A1A1A',
  };

  private nodeMode: CanvasRenderMode = 'after';

  private linkMode: CanvasRenderMode = 'after';

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

    // Read mode attributes once at initialization
    const nodeModeAttr = this.getAttribute('node-mode');
    if (nodeModeAttr === 'before' || nodeModeAttr === 'after' || nodeModeAttr === 'replace') {
      this.nodeMode = nodeModeAttr;
    }

    const linkModeAttr = this.getAttribute('link-mode');
    if (linkModeAttr === 'before' || linkModeAttr === 'after' || linkModeAttr === 'replace') {
      this.linkMode = linkModeAttr;
    }
  }

  connectedCallback() {
    this.render();
  }

  disconnectedCallback() {
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
    Object.assign(this.config, config);

    // Update event handlers if they were provided
    if (config.onNodeClick || config.onLinkClick || config.onNodeRightClick || config.onLinkRightClick ||
      config.onNodeHover || config.onLinkHover || config.onBackgroundClick || config.onBackgroundRightClick || config.onZoom ||
      config.onEngineStop || config.isNodeSelected || config.isLinkSelected || config.node || config.link) {
      this.updateEventHandlers();

      // If node or link rendering functions changed, trigger a canvas refresh
      if (config.node || config.link) {
        this.triggerRender();
      }
    }
  }

  setWidth(width: number) {
    if (this.config.width === width) return;
    this.config.width = width;
    if (this.graph) {
      this.graph.width(width);
    }
  }

  setHeight(height: number) {
    if (this.config.height === height) return;
    this.config.height = height;
    if (this.graph) {
      this.graph.height(height);
    }
  }

  setBackgroundColor(color: string) {
    if (this.config.backgroundColor === color) return;
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
    this.config.foregroundColor = color;
    this.updateTooltipStyles();
    this.triggerRender();
  }

  setIsLoading(isLoading: boolean) {
    if (this.config.isLoading === isLoading) return;
    this.config.isLoading = isLoading;
    this.updateLoadingState();
  }

  setCooldownTicks(ticks: number | undefined) {
    if (this.config.cooldownTicks === ticks) return;
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
    this.data = dataToGraphData(data);
    this.config.cooldownTicks = this.data.nodes.length > 0 ? undefined : 0;
    this.config.isLoading = this.data.nodes.length > 0;
    this.config.onLoadingChange?.(this.config.isLoading);

    // Update simulation state
    if (this.data.nodes.length > 0) {
      this.updateCanvasSimulationAttribute(true);
    }

    // Initialize graph if it hasn't been initialized yet
    if (!this.graph && this.container) {
      this.initGraph();
    }

    if (!this.graph) return;

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

    return {
      zoom,
      centerX,
      centerY,
    };
  }

  setViewport(viewport: ViewportState) {
    this.viewport = viewport;
  }

  getGraphData(): GraphData {
    return this.data;
  }

  setGraphData(data: GraphData) {
    this.data = data;

    this.config.cooldownTicks = 0;
    this.config.isLoading = false;

    if (!this.graph) return;

    this.calculateNodeDegree();
    this.setupForces();

    this.graph
      .graphData(this.data)
      .cooldownTicks(this.config.cooldownTicks ?? Infinity);

    if (this.viewport) {
      this.graph.zoom(this.viewport.zoom, 0);
      this.graph.centerAt(this.viewport.centerX, this.viewport.centerY, 0);
      this.viewport = undefined;
    }

    this.updateLoadingState();
  }

  getGraph(): ForceGraphInstance | undefined {
    return this.graph;
  }

  public getZoom(): number {
    return this.graph?.zoom() || 0;
  }

  public zoom(zoomLevel: number): ForceGraphInstance | undefined {
    if (!this.graph) return;

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

    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (this.graph && width > 0 && height > 0) {
          this.graph.width(width).height(height);
        }
      }
    });

    this.resizeObserver.observe(this.container);
  }

  private initGraph() {
    if (!this.container) return;

    this.calculateNodeDegree();

    // Initialize force-graph
    // Cast to any for the factory call pattern, result is properly typed as ForceGraphInstance
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.graph = (ForceGraph as any)()(this.container)
      .width(this.config.width || 800)
      .height(this.config.height || 600)
      .backgroundColor(this.config.backgroundColor)
      .graphData(this.data)
      .nodeRelSize(1)
      .nodeVal((node: GraphNode) => {
        const strokeWidth = this.config.isNodeSelected?.(node) ? 1.5 : 1;
        const radius = node.size + strokeWidth;
        return radius * radius;  // Return radius squared since force-graph does sqrt(val * relSize)
      })
      .nodeCanvasObjectMode(() => this.nodeMode)
      .linkCanvasObjectMode(() => this.linkMode)
      .nodeLabel((node: GraphNode) =>
        getNodeDisplayText(node)
      )
      .linkLabel((link: GraphLink) => link.relationship)
      .linkDirectionalArrowRelPos(1)
      .linkDirectionalArrowLength((link: GraphLink) => {
        if (link.source === link.target) return 0;
        return this.config.isLinkSelected?.(link) ? 4 : 2;
      })
      .linkDirectionalArrowColor((link: GraphLink) => link.color)
      .linkWidth((link: GraphLink) =>
        this.config.isLinkSelected?.(link) ? 2 : 1
      )
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
      .nodeCanvasObject((node: GraphNode, ctx: CanvasRenderingContext2D) => {
        if (this.config.node) {
          this.config.node.nodeCanvasObject(node, ctx);
        } else {
          this.drawNode(node, ctx);
        }
      })
      .linkCanvasObject((link: GraphLink, ctx: CanvasRenderingContext2D) => {
        if (this.config.link) {
          this.config.link.linkCanvasObject(link, ctx);
        } else {
          this.drawLink(link, ctx);
        }
      });

    // Only set pointer area paint if custom node/link configs are provided
    if (this.config.node) {
      this.graph?.nodePointerAreaPaint(this.config.node?.nodePointerAreaPaint);
    }

    if (this.config.link) {
      this.graph?.linkPointerAreaPaint(this.config.link?.linkPointerAreaPaint);
    };

    // Setup forces
    this.setupForces();
  }

  private setupForces() {
    const linkForce = this.graph?.d3Force("link");

    if (!linkForce) return;
    if (!this.graph) return;

    // Link force with dynamic distance and strength
    linkForce
      .distance((link: GraphLink) => {
        const sourceId = link.source.id;
        const targetId = link.target.id;
        const sourceDegree = this.nodeDegreeMap.get(sourceId) || 0;
        const targetDegree = this.nodeDegreeMap.get(targetId) || 0;
        const maxDegree = Math.max(sourceDegree, targetDegree);

        if (maxDegree >= CROWDING_THRESHOLD) {
          const extraDistance = Math.min(
            MAX_LINK_DISTANCE - LINK_DISTANCE,
            (maxDegree - CROWDING_THRESHOLD) * 1.5
          );
          const sumDegree = LINK_DISTANCE + extraDistance;
          
          if (sourceDegree >= CROWDING_THRESHOLD && targetDegree >= CROWDING_THRESHOLD) {
            return sumDegree * 2;
          }
          
          return sumDegree;
        }

        return LINK_DISTANCE;
      })
      .strength((link: GraphLink) => {
        const sourceId = link.source.id;
        const targetId = link.target.id;
        const sourceDegree = this.nodeDegreeMap.get(sourceId) || 0;
        const targetDegree = this.nodeDegreeMap.get(targetId) || 0;
        const maxDegree = Math.max(sourceDegree, targetDegree);

        if (maxDegree <= DEGREE_STRENGTH_DECAY) {
          return LINK_STRENGTH;
        }

        const strengthReduction = Math.max(
          0,
          (maxDegree - DEGREE_STRENGTH_DECAY) / DEGREE_STRENGTH_DECAY
        );
        const scaledStrength =
          MIN_LINK_STRENGTH +
          (LINK_STRENGTH - MIN_LINK_STRENGTH) * Math.exp(-strengthReduction);

        return Math.max(MIN_LINK_STRENGTH, scaledStrength);
      });

    // Collision force
    this.graph.d3Force(
      "collision",
      d3
        .forceCollide((node: GraphNode) => {
          // Use node.size as base
          const baseSize = node.size;

          // Add extra radius based on node degree (connections)
          const degree = this.nodeDegreeMap.get(node.id) || 0;
          return baseSize + Math.sqrt(degree) * HIGH_DEGREE_PADDING;
        })
        .strength(COLLISION_STRENGTH)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .iterations(2) as any
    );

    // Center force
    const centerForce = this.graph.d3Force("center");
    if (centerForce) {
      centerForce.strength(CENTER_STRENGTH);
    }

    // Charge force
    const chargeForce = this.graph.d3Force("charge");
    if (chargeForce) {
      chargeForce.strength(CHARGE_STRENGTH).distanceMax(300);
    }
  }

  private drawNode(node: GraphNode, ctx: CanvasRenderingContext2D) {

    if (!node.x || !node.y) {
      node.x = 0;
      node.y = 0;
    }

    ctx.lineWidth = this.config.isNodeSelected?.(node) ? 1.5 : 1;
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
      const text = getNodeDisplayText(node);
      const textRadius = NODE_SIZE - PADDING / 2;
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

  private drawLink(link: GraphLink, ctx: CanvasRenderingContext2D) {
    const start = link.source;
    const end = link.target;

    if (!start.x || !start.y || !end.x || !end.y) {
      start.x = 0;
      start.y = 0;
      end.x = 0;
      end.y = 0;
    }

    let textX;
    let textY;
    let angle;

    if (start.id === end.id) {
      const radius = NODE_SIZE * (link.curve || 0) * 6.2;
      const angleOffset = -Math.PI / 4;
      textX = start.x + radius * Math.cos(angleOffset);
      textY = start.y + radius * Math.sin(angleOffset);
      angle = -angleOffset;
    } else {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

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
    }

    ctx.font = "400 2px SofiaSans";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";

    let cached = this.relationshipsTextCache.get(link.relationship);

    if (!cached) {
      const { width, actualBoundingBoxAscent, actualBoundingBoxDescent } =
        ctx.measureText(link.relationship);
      // Calculate visual center offset from baseline
      const visualCenter = (actualBoundingBoxAscent - actualBoundingBoxDescent) / 2;
      cached = {
        textWidth: width,
        textHeight: actualBoundingBoxAscent + actualBoundingBoxDescent,
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

    const bgWidth = textWidth * 0.6;
    const bgHeight = textHeight * 0.6;
    // Offset background to match text visual center
    const bgYOffset = textYOffset - textHeight / 2;
    ctx.fillRect(
      -bgWidth / 2,
      bgYOffset,
      bgWidth,
      bgHeight
    );

    // Draw text with alphabetic baseline, positioned so visual center is at y=0
    ctx.fillStyle = getContrastTextColor(this.config.backgroundColor);
    ctx.fillText(link.relationship, 0, textYOffset);
    ctx.restore();
  }

  private updateLoadingState() {
    if (!this.loadingOverlay) return;

    if (this.config.isLoading) {
      this.loadingOverlay.style.display = "flex";
    } else {
      this.loadingOverlay.style.display = "none";
    }
  }

  private handleEngineStop() {
    if (!this.graph) return;

    // If already stopped, don't do anything
    if (this.config.cooldownTicks === 0) return;

    const nodeCount = this.data.nodes.length;
    const paddingMultiplier = nodeCount < 2 ? 4 : 1;
    this.zoomToFit(paddingMultiplier);

    // Stop the force simulation after centering (only if autoStopOnSettle is true)
    if (this.config.autoStopOnSettle !== false) {
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
      }, 1000);
    } else {
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
      .nodeCanvasObject((node: GraphNode, ctx: CanvasRenderingContext2D) => {
        if (this.config.node) {
          this.config.node.nodeCanvasObject(node, ctx);
        } else {
          this.drawNode(node, ctx);
        }
      })
      .linkCanvasObject((link: GraphLink, ctx: CanvasRenderingContext2D) => {
        if (this.config.link) {
          this.config.link.linkCanvasObject(link, ctx);
        } else {
          this.drawLink(link, ctx);
        }
      });

    if (this.config.node) {
      this.graph.nodePointerAreaPaint((node: GraphNode, color: string, ctx: CanvasRenderingContext2D) => {
        this.config.node!.nodePointerAreaPaint(node, color, ctx);
      });
    } else {
      this.graph.nodePointerAreaPaint();
    }

    if (this.config.link) {
      this.graph.linkPointerAreaPaint((link: GraphLink, color: string, ctx: CanvasRenderingContext2D) => {
        this.config.link!.linkPointerAreaPaint(link, color, ctx);
      });
    } else {
      this.graph.linkPointerAreaPaint();
    }
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
