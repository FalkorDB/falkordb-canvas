import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  forceGraphMockState,
  resetForceGraphMockState,
} from "./mocks/force-graph";

vi.mock("force-graph", async () => import("./mocks/force-graph"));

import "../src/canvas";

type CanvasTestElement = HTMLElement & {
  setConfig: (config: Record<string, unknown>) => void;
  setData: (data: { nodes: NodeInput[]; links: LinkInput[] }) => void;
  setWidth: (w: number) => void;
  setHeight: (h: number) => void;
  getGraphData: () => { nodes: RuntimeNode[]; links: RuntimeLink[] };
};

type NodeInput = {
  id: number;
  labels: string[];
  visible: boolean;
  color: string;
  data: Record<string, unknown>;
};

type LinkInput = {
  id: number;
  relationship: string;
  source: number;
  target: number;
  visible: boolean;
  color: string;
  data: Record<string, unknown>;
};

type RuntimeNode = NodeInput & {
  x?: number;
  y?: number;
  size: number;
};

type RuntimeLink = LinkInput & {
  source: RuntimeNode;
  target: RuntimeNode;
  curve?: number;
};

function createCtxSpy() {
  return {
    beginPath: vi.fn(),
    arc: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    setLineDash: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    clip: vi.fn(),
    closePath: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    clearRect: vi.fn(),
    getLineDash: vi.fn(() => []),
    measureText: vi.fn(() => ({
      width: 10,
      actualBoundingBoxAscent: 2,
      actualBoundingBoxDescent: 1,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: 10,
    })),
    canvas: { width: 800, height: 600 },
    lineWidth: 1,
    strokeStyle: "#000",
    fillStyle: "#000",
    font: "12px sans-serif",
    textAlign: "center" as CanvasTextAlign,
    textBaseline: "middle" as CanvasTextBaseline,
    globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D;
}

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    disconnect() {}
  }

  Object.defineProperty(globalThis, "ResizeObserver", {
    value: ResizeObserverMock,
    configurable: true,
  });

  Object.defineProperty(document, "fonts", {
    value: {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
    configurable: true,
  });

  Object.defineProperty(HTMLCanvasElement.prototype, "getBoundingClientRect", {
    value: () => ({
      width: 1000, height: 600, top: 0, left: 0,
      right: 1000, bottom: 600, x: 0, y: 0, toJSON: () => ({}),
    }),
    configurable: true,
  });
});

function createCanvas(): CanvasTestElement {
  const canvas = document.createElement("falkordb-canvas") as CanvasTestElement;
  document.body.appendChild(canvas);
  return canvas;
}

function getLastInstance() {
  return forceGraphMockState.lastInstance!;
}

function triggerZoom(transform: { k: number; x: number; y: number }) {
  const instance = getLastInstance();
  instance.callbacks.onZoom?.(transform);
}

function setupInstanceDimensions(instance: ReturnType<typeof getLastInstance>, w = 800, h = 600) {
  instance.width = (value?: number) => {
    if (value === undefined) return w;
    return instance;
  };
  instance.height = (value?: number) => {
    if (value === undefined) return h;
    return instance;
  };
}

const SIMPLE_DATA = {
  nodes: [
    { id: 1, labels: ["A"], visible: true, color: "#f00", data: { name: "n1" } },
    { id: 2, labels: ["B"], visible: true, color: "#0f0", data: { name: "n2" } },
    { id: 3, labels: ["C"], visible: true, color: "#00f", data: { name: "n3" } },
  ],
  links: [
    { id: 1, relationship: "REL", source: 1, target: 2, visible: true, color: "#888", data: {} },
    { id: 2, relationship: "REL", source: 2, target: 3, visible: true, color: "#888", data: {} },
    { id: 3, relationship: "SELF", source: 1, target: 1, visible: true, color: "#888", data: {} },
  ],
};

describe("viewport culling", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    resetForceGraphMockState();
  });

  it("culling is disabled by default — offscreen nodes are still drawn", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);

    const instance = getLastInstance();
    setupInstanceDimensions(instance);

    // Position node far offscreen
    const data = canvas.getGraphData();
    data.nodes[0].x = -5000;
    data.nodes[0].y = 0;
    data.nodes[0].size = 6;

    // Trigger zoom — without largeGraph enabled, culling should not activate
    triggerZoom({ k: 1, x: 0, y: 0 });

    // Invoke the nodeCanvasObject callback for the offscreen node
    const ctx = createCtxSpy();
    const painter = instance.callbacks.nodeCanvasObject!;
    expect(painter).toBeDefined();
    painter(data.nodes[0], ctx);

    // Node should still be drawn (arc called) because culling is disabled
    expect(ctx.arc).toHaveBeenCalled();
  });

  it("enabled culling skips offscreen nodes and draws onscreen nodes", () => {
    const canvas = createCanvas();
    canvas.setConfig({
      width: 800,
      height: 600,
      largeGraph: { enabled: true, viewportPadding: 0 },
    });
    canvas.setData(SIMPLE_DATA);

    const instance = getLastInstance();
    setupInstanceDimensions(instance);

    const data = canvas.getGraphData();
    // Node at center of viewport (visible)
    data.nodes[0].x = 400;
    data.nodes[0].y = 300;
    data.nodes[0].size = 6;
    // Node far offscreen (should be culled)
    data.nodes[1].x = -5000;
    data.nodes[1].y = -5000;
    data.nodes[1].size = 6;

    // Identity transform: visible area is [0,800] x [0,600]
    triggerZoom({ k: 1, x: 0, y: 0 });

    const painter = instance.callbacks.nodeCanvasObject!;

    // Onscreen node should be drawn
    const ctxOn = createCtxSpy();
    painter(data.nodes[0], ctxOn);
    expect(ctxOn.arc).toHaveBeenCalled();

    // Offscreen node should be skipped
    const ctxOff = createCtxSpy();
    painter(data.nodes[1], ctxOff);
    expect(ctxOff.arc).not.toHaveBeenCalled();
  });

  it("culling bounds include viewport padding — borderline node is drawn", () => {
    const canvas = createCanvas();
    canvas.setConfig({
      width: 800,
      height: 600,
      largeGraph: { enabled: true, viewportPadding: 100 },
    });
    canvas.setData(SIMPLE_DATA);

    const instance = getLastInstance();
    setupInstanceDimensions(instance);

    const data = canvas.getGraphData();
    // Node just outside viewport but within padding
    // Identity transform: viewport [0,800]x[0,600], with padding: [-100,900]x[-100,700]
    data.nodes[0].x = -50;
    data.nodes[0].y = 300;
    data.nodes[0].size = 6;

    triggerZoom({ k: 1, x: 0, y: 0 });

    const ctx = createCtxSpy();
    const painter = instance.callbacks.nodeCanvasObject!;
    painter(data.nodes[0], ctx);

    // Node at x=-50 is within padded bounds [-100, 900], so it should be drawn
    expect(ctx.arc).toHaveBeenCalled();
  });

  it("disabling largeGraph stops culling — previously culled nodes are drawn", () => {
    const canvas = createCanvas();
    canvas.setConfig({
      width: 800,
      height: 600,
      largeGraph: { enabled: true, viewportPadding: 0 },
    });
    canvas.setData(SIMPLE_DATA);

    const instance = getLastInstance();
    setupInstanceDimensions(instance);

    const data = canvas.getGraphData();
    data.nodes[0].x = -5000;
    data.nodes[0].y = 0;
    data.nodes[0].size = 6;

    triggerZoom({ k: 1, x: 0, y: 0 });

    // Verify node is culled while enabled
    const ctx1 = createCtxSpy();
    instance.callbacks.nodeCanvasObject!(data.nodes[0], ctx1);
    expect(ctx1.arc).not.toHaveBeenCalled();

    // Disable culling
    canvas.setConfig({ largeGraph: { enabled: false } });

    // Now the same offscreen node should be drawn
    const ctx2 = createCtxSpy();
    instance.callbacks.nodeCanvasObject!(data.nodes[0], ctx2);
    expect(ctx2.arc).toHaveBeenCalled();
  });

  it("deep-merges largeGraph config — partial updates preserve other fields", () => {
    const canvas = createCanvas();
    canvas.setConfig({
      width: 800,
      height: 600,
      largeGraph: { enabled: true, viewportPadding: 50 },
    });
    canvas.setData(SIMPLE_DATA);

    const instance = getLastInstance();
    setupInstanceDimensions(instance);

    // Update only viewportPadding — enabled should remain true
    canvas.setConfig({ largeGraph: { viewportPadding: 200 } });

    const data = canvas.getGraphData();
    data.nodes[0].x = -5000;
    data.nodes[0].y = 0;
    data.nodes[0].size = 6;

    triggerZoom({ k: 1, x: 0, y: 0 });

    // Culling should still be active (enabled wasn't wiped)
    const ctx = createCtxSpy();
    instance.callbacks.nodeCanvasObject!(data.nodes[0], ctx);
    expect(ctx.arc).not.toHaveBeenCalled();
  });

  it("resize recomputes culling bounds using cached transform", () => {
    const canvas = createCanvas();
    canvas.setConfig({
      width: 800,
      height: 600,
      largeGraph: { enabled: true, viewportPadding: 0 },
    });
    canvas.setData(SIMPLE_DATA);

    const instance = getLastInstance();
    let mockWidth = 800;
    instance.width = (value?: number) => {
      if (value === undefined) return mockWidth;
      mockWidth = value;
      return instance;
    };
    instance.height = (value?: number) => {
      if (value === undefined) return 600;
      return instance;
    };

    const data = canvas.getGraphData();
    // Node at x=900 — outside 800px viewport but inside 1200px viewport
    data.nodes[0].x = 900;
    data.nodes[0].y = 300;
    data.nodes[0].size = 6;

    // With width=800, identity transform: bounds are [0,800]x[0,600]
    triggerZoom({ k: 1, x: 0, y: 0 });

    // Node at x=900 should be culled
    const ctx1 = createCtxSpy();
    instance.callbacks.nodeCanvasObject!(data.nodes[0], ctx1);
    expect(ctx1.arc).not.toHaveBeenCalled();

    // Resize to 1200px — bounds should recompute to [0,1200]x[0,600]
    canvas.setWidth(1200);
    expect(mockWidth).toBe(1200);

    // Now node at x=900 should be visible
    const ctx2 = createCtxSpy();
    instance.callbacks.nodeCanvasObject!(data.nodes[0], ctx2);
    expect(ctx2.arc).toHaveBeenCalled();
  });

  it("invalid transform (k<=0) clears culling bounds — nodes are drawn", () => {
    const canvas = createCanvas();
    canvas.setConfig({
      width: 800,
      height: 600,
      largeGraph: { enabled: true, viewportPadding: 0 },
    });
    canvas.setData(SIMPLE_DATA);

    const instance = getLastInstance();
    setupInstanceDimensions(instance);

    const data = canvas.getGraphData();
    data.nodes[0].x = 400;
    data.nodes[0].y = 300;
    data.nodes[0].size = 6;

    // First set valid bounds
    triggerZoom({ k: 1, x: 0, y: 0 });

    // Now trigger with k=0 — should clear bounds (not keep stale ones)
    triggerZoom({ k: 0, x: 0, y: 0 });

    // With null bounds, culling check passes (no bounds = no culling)
    const ctx = createCtxSpy();
    instance.callbacks.nodeCanvasObject!(data.nodes[0], ctx);
    expect(ctx.arc).toHaveBeenCalled();
  });

  it("zero-size canvas clears culling bounds", () => {
    const canvas = createCanvas();
    canvas.setConfig({
      width: 800,
      height: 600,
      largeGraph: { enabled: true },
    });
    canvas.setData(SIMPLE_DATA);

    const instance = getLastInstance();
    setupInstanceDimensions(instance, 0, 0);

    const data = canvas.getGraphData();
    data.nodes[0].x = 400;
    data.nodes[0].y = 300;
    data.nodes[0].size = 6;

    // With zero-size canvas, bounds should be cleared
    triggerZoom({ k: 1, x: 0, y: 0 });

    // Node should still be drawn (null bounds = no culling active)
    const ctx = createCtxSpy();
    instance.callbacks.nodeCanvasObject!(data.nodes[0], ctx);
    expect(ctx.arc).toHaveBeenCalled();
  });

  it("link culling skips offscreen links", () => {
    const canvas = createCanvas();
    canvas.setConfig({
      width: 800,
      height: 600,
      largeGraph: { enabled: true, viewportPadding: 0 },
    });
    canvas.setData(SIMPLE_DATA);

    const instance = getLastInstance();
    setupInstanceDimensions(instance);

    const data = canvas.getGraphData();
    // Position link endpoints far offscreen
    const link = data.links[0];
    link.source = { ...data.nodes[0], x: -5000, y: -5000, size: 6 } as RuntimeNode;
    link.target = { ...data.nodes[1], x: -4000, y: -4000, size: 6 } as RuntimeNode;

    triggerZoom({ k: 1, x: 0, y: 0 });

    const ctx = createCtxSpy();
    const linkPainter = instance.callbacks.linkCanvasObject!;
    linkPainter(link, ctx, 1);

    // Offscreen link should be skipped
    expect(ctx.moveTo).not.toHaveBeenCalled();
    expect(ctx.quadraticCurveTo).not.toHaveBeenCalled();
  });
});

describe("low-zoom draw skipping", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    resetForceGraphMockState();
  });

  it("labels are skipped below lowZoomThreshold", () => {
    const canvas = createCanvas();
    canvas.setConfig({
      width: 800,
      height: 600,
      largeGraph: {
        enabled: true,
        lowZoomThreshold: 0.5,
        skipLabelsAtLowZoom: true,
      },
    });
    canvas.setData(SIMPLE_DATA);

    const instance = getLastInstance();
    setupInstanceDimensions(instance);

    const data = canvas.getGraphData();
    data.nodes[0].x = 400;
    data.nodes[0].y = 300;
    data.nodes[0].size = 6;

    // Zoom below threshold (0.3 < 0.5) — labels should be skipped
    triggerZoom({ k: 0.3, x: 0, y: 0 });
    const ctxLow = createCtxSpy();
    instance.callbacks.nodeCanvasObject!(data.nodes[0], ctxLow);
    // Node circle is still drawn
    expect(ctxLow.arc).toHaveBeenCalled();
    // But label text is skipped
    expect(ctxLow.fillText).not.toHaveBeenCalled();

    // Zoom above threshold (0.8 > 0.5) — labels should be drawn
    triggerZoom({ k: 0.8, x: 0, y: 0 });
    const ctxHigh = createCtxSpy();
    instance.callbacks.nodeCanvasObject!(data.nodes[0], ctxHigh);
    expect(ctxHigh.arc).toHaveBeenCalled();
    expect(ctxHigh.fillText).toHaveBeenCalled();
  });

  it("custom lowZoomThreshold is respected", () => {
    const canvas = createCanvas();
    canvas.setConfig({
      width: 800,
      height: 600,
      largeGraph: {
        enabled: true,
        lowZoomThreshold: 0.8,
        skipLabelsAtLowZoom: true,
      },
    });
    canvas.setData(SIMPLE_DATA);

    const instance = getLastInstance();
    setupInstanceDimensions(instance);

    const data = canvas.getGraphData();
    data.nodes[0].x = 400;
    data.nodes[0].y = 300;
    data.nodes[0].size = 6;

    // At 0.7 — below custom threshold of 0.8 — labels skipped
    triggerZoom({ k: 0.7, x: 0, y: 0 });
    const ctxLow = createCtxSpy();
    instance.callbacks.nodeCanvasObject!(data.nodes[0], ctxLow);
    expect(ctxLow.arc).toHaveBeenCalled();
    expect(ctxLow.fillText).not.toHaveBeenCalled();

    // At 0.9 — above threshold — labels drawn
    triggerZoom({ k: 0.9, x: 0, y: 0 });
    const ctxHigh = createCtxSpy();
    instance.callbacks.nodeCanvasObject!(data.nodes[0], ctxHigh);
    expect(ctxHigh.arc).toHaveBeenCalled();
    expect(ctxHigh.fillText).toHaveBeenCalled();
  });
});
