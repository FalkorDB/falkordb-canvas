type Translate = { x: number; y: number };

type CallbackMap = {
  onNodeClick?: (node: unknown, event: MouseEvent) => void;
  onLinkClick?: (link: unknown, event: MouseEvent) => void;
  onNodeRightClick?: (node: unknown, event: MouseEvent) => void;
  onLinkRightClick?: (link: unknown, event: MouseEvent) => void;
  onNodeHover?: (node: unknown | null, previousNode: unknown | null) => void;
  onNodeDrag?: (node: unknown, translate: Translate) => void;
  onNodeDragEnd?: (node: unknown, translate: Translate) => void;
  onLinkHover?: (link: unknown | null, previousLink: unknown | null) => void;
  onBackgroundClick?: (event: MouseEvent) => void;
  onBackgroundRightClick?: (event: MouseEvent) => void;
  onZoom?: (transform: { k: number; x: number; y: number }) => void;
  onEngineStop?: () => void;
  nodeCanvasObject?: (node: unknown, ctx: CanvasRenderingContext2D) => void;
  linkCanvasObject?: (link: unknown, ctx: CanvasRenderingContext2D, globalScale: number) => void;
  nodePointerAreaPaint?: (node: unknown, color: string, ctx: CanvasRenderingContext2D) => void;
  linkPointerAreaPaint?: (link: unknown, color: string, ctx: CanvasRenderingContext2D) => void;
};

class MockLinkForce {
  public distanceAccessor: unknown;

  public strengthValue: number | undefined;

  distance(accessor: unknown) {
    this.distanceAccessor = accessor;
    return this;
  }

  strength(value: number) {
    this.strengthValue = value;
    return this;
  }
}

class MockChargeForce {
  public strengthValue: number | undefined;

  strength(value: number) {
    this.strengthValue = value;
    return this;
  }
}

class MockSimulationForce {
  public velocityDecayValue: number | undefined;

  public alphaMinValue: number | undefined;

  velocityDecay(value: number) {
    this.velocityDecayValue = value;
    return this;
  }

  alphaMin(value: number) {
    this.alphaMinValue = value;
    return this;
  }
}

function createDefaultForce(name: string) {
  if (name === "link") return new MockLinkForce();
  if (name === "charge") return new MockChargeForce();
  if (name === "simulation") return new MockSimulationForce();
  return undefined;
}

export class MockForceGraphInstance {
  public callbacks: CallbackMap = {};

  public data: { nodes: unknown[]; links: unknown[] } = { nodes: [], links: [] };

  public cooldownTicksValue = 0;

  public cooldownTicksHistory: number[] = [];

  public d3ReheatSimulationCalls = 0;

  public d3VelocityDecayHistory: number[] = [];

  public d3AlphaMinHistory: number[] = [];

  public zoomToFitCalls = 0;

  public zoomToFitArgs: unknown[][] = [];

  public zoomValue = 1;

  public center = { x: 0, y: 0 };

  public forceMap = new Map<string, unknown>();

  public destroyed = false;

  constructor(private readonly container: HTMLElement) {}

  resetTracking() {
    this.cooldownTicksHistory = [];
    this.d3ReheatSimulationCalls = 0;
    this.d3VelocityDecayHistory = [];
    this.d3AlphaMinHistory = [];
    this.zoomToFitCalls = 0;
    this.zoomToFitArgs = [];
  }

  width(value?: number) {
    if (value === undefined) return 0;
    return this;
  }

  height(value?: number) {
    if (value === undefined) return 0;
    return this;
  }

  backgroundColor(value?: string) {
    if (value === undefined) return "";
    return this;
  }

  graphData(value?: { nodes: unknown[]; links: unknown[] }) {
    if (value === undefined) return this.data;
    this.data = value;
    return this;
  }

  nodeCanvasObjectMode(_value?: unknown) { return this; }

  linkCanvasObjectMode(_value?: unknown) { return this; }

  nodeLabel(_value?: unknown) { return this; }

  linkLabel(_value?: unknown) { return this; }

  linkDirectionalArrowLength(_value?: unknown) { return this; }

  linkWidth(_value?: unknown) { return this; }

  linkCurvature(_value?: unknown) { return this; }

  linkVisibility(_value?: unknown) { return this; }

  nodeVisibility(_value?: unknown) { return this; }

  cooldownTicks(value?: number) {
    if (value === undefined) return this.cooldownTicksValue;
    this.cooldownTicksValue = value;
    this.cooldownTicksHistory.push(value);
    return this;
  }

  cooldownTime(_value?: number) { return this; }

  enableNodeDrag(_value?: boolean) { return this; }

  enableZoomInteraction(_value?: boolean | ((event: MouseEvent) => boolean)) { return this; }

  enablePanInteraction(_value?: boolean | ((event: MouseEvent) => boolean)) { return this; }

  onNodeClick(callback: (node: unknown, event: MouseEvent) => void) {
    this.callbacks.onNodeClick = callback;
    return this;
  }

  onLinkClick(callback: (link: unknown, event: MouseEvent) => void) {
    this.callbacks.onLinkClick = callback;
    return this;
  }

  onNodeRightClick(callback: (node: unknown, event: MouseEvent) => void) {
    this.callbacks.onNodeRightClick = callback;
    return this;
  }

  onLinkRightClick(callback: (link: unknown, event: MouseEvent) => void) {
    this.callbacks.onLinkRightClick = callback;
    return this;
  }

  onNodeHover(callback: (node: unknown | null, previousNode: unknown | null) => void) {
    this.callbacks.onNodeHover = callback;
    return this;
  }

  onNodeDrag(callback: (node: unknown, translate: Translate) => void) {
    this.callbacks.onNodeDrag = callback;
    return this;
  }

  onNodeDragEnd(callback: (node: unknown, translate: Translate) => void) {
    this.callbacks.onNodeDragEnd = callback;
    return this;
  }

  onLinkHover(callback: (link: unknown | null, previousLink: unknown | null) => void) {
    this.callbacks.onLinkHover = callback;
    return this;
  }

  onBackgroundClick(callback: (event: MouseEvent) => void) {
    this.callbacks.onBackgroundClick = callback;
    return this;
  }

  onBackgroundRightClick(callback: (event: MouseEvent) => void) {
    this.callbacks.onBackgroundRightClick = callback;
    return this;
  }

  onZoom(callback: (transform: { k: number; x: number; y: number }) => void) {
    this.callbacks.onZoom = callback;
    return this;
  }

  onEngineStop(callback: () => void) {
    this.callbacks.onEngineStop = callback;
    return this;
  }

  nodeCanvasObject(callback?: unknown) {
    if (callback) this.callbacks.nodeCanvasObject = callback as (node: unknown, ctx: CanvasRenderingContext2D) => void;
    return this;
  }

  linkCanvasObject(callback?: unknown) {
    if (callback) this.callbacks.linkCanvasObject = callback as (link: unknown, ctx: CanvasRenderingContext2D, globalScale: number) => void;
    return this;
  }

  nodePointerAreaPaint(callback?: (node: unknown, color: string, ctx: CanvasRenderingContext2D) => void) {
    if (!callback) return this.callbacks.nodePointerAreaPaint;
    this.callbacks.nodePointerAreaPaint = callback;
    return this;
  }

  linkPointerAreaPaint(callback?: (link: unknown, color: string, ctx: CanvasRenderingContext2D) => void) {
    if (!callback) return this.callbacks.linkPointerAreaPaint;
    this.callbacks.linkPointerAreaPaint = callback;
    return this;
  }

  d3Force(name: string, force?: unknown) {
    if (arguments.length > 1) {
      this.forceMap.set(name, force);
      return this;
    }

    if (!this.forceMap.has(name)) {
      this.forceMap.set(name, createDefaultForce(name));
    }

    return this.forceMap.get(name);
  }

  d3VelocityDecay(value: number) {
    this.d3VelocityDecayHistory.push(value);
    return this;
  }

  d3AlphaMin(value: number) {
    this.d3AlphaMinHistory.push(value);
    return this;
  }

  d3ReheatSimulation() {
    this.d3ReheatSimulationCalls += 1;
    return this;
  }

  zoomToFit(...args: unknown[]) {
    this.zoomToFitCalls += 1;
    this.zoomToFitArgs.push(args);
    return this;
  }

  centerAt(x?: number, y?: number, _durationMs?: number) {
    if (x === undefined && y === undefined) return this.center;
    if (x !== undefined) this.center.x = x;
    if (y !== undefined) this.center.y = y;
    return this;
  }

  zoom(value?: number, _durationMs?: number) {
    if (value === undefined) return this.zoomValue;
    this.zoomValue = value;
    return this;
  }

  _destructor() {
    this.destroyed = true;
  }

  ensureCanvasElement() {
    let canvas = this.container.querySelector("canvas");
    if (!canvas) {
      canvas = document.createElement("canvas");
      this.container.appendChild(canvas);
    }
  }
}

export const forceGraphMockState: {
  instances: MockForceGraphInstance[];
  lastInstance: MockForceGraphInstance | undefined;
} = {
  instances: [],
  lastInstance: undefined,
};

export function resetForceGraphMockState() {
  forceGraphMockState.instances = [];
  forceGraphMockState.lastInstance = undefined;
}

const ForceGraphMockFactory = () => (container: HTMLElement) => {
  const instance = new MockForceGraphInstance(container);
  instance.ensureCanvasElement();
  forceGraphMockState.instances.push(instance);
  forceGraphMockState.lastInstance = instance;
  return instance;
};

export default ForceGraphMockFactory;
