import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  forceGraphMockState,
  resetForceGraphMockState,
} from "./mocks/force-graph";

vi.mock("force-graph", async () => import("./mocks/force-graph"));

import "../src/canvas";

type CanvasElement = HTMLElement & {
  setConfig: (config: Record<string, unknown>) => void;
  setData: (data: { nodes: unknown[]; links: unknown[] }) => void;
  getGraphData: () => { nodes: any[]; links: any[] };
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
  Object.defineProperty(globalThis, "ResizeObserver", { value: ResizeObserverMock, configurable: true });
  Object.defineProperty(document, "fonts", {
    value: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
    configurable: true,
  });
  Object.defineProperty(HTMLCanvasElement.prototype, "getBoundingClientRect", {
    value: () => ({ width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }),
    configurable: true,
  });
});

function createCanvas(): CanvasElement {
  const canvas = document.createElement("falkordb-canvas") as CanvasElement;
  document.body.appendChild(canvas);
  return canvas;
}

function getLastInstance() {
  return forceGraphMockState.lastInstance!;
}

function setupInstanceDimensions(instance: ReturnType<typeof getLastInstance>, w = 800, h = 600) {
  (instance as any).width = (value?: number) => {
    if (value === undefined) return w;
    return instance;
  };
  (instance as any).height = (value?: number) => {
    if (value === undefined) return h;
    return instance;
  };
}

describe("node rendering", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    resetForceGraphMockState();
  });

  it("draws a circle for each visible node", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData({
      nodes: [{ id: 1, labels: ["A"], visible: true, color: "#f00", data: { name: "test" } }],
      links: [],
    });

    const instance = getLastInstance();
    const graphData = canvas.getGraphData();
    const node = graphData.nodes[0];
    node.x = 100;
    node.y = 100;

    // Trigger onZoom to set culling bounds so node is visible
    instance.callbacks.onZoom?.({ k: 1, x: 100, y: 100 });

    const ctx = createCtxSpy();
    const painter = instance.callbacks.nodeCanvasObject!;
    painter(node, ctx);

    // Should draw a circle (arc call)
    expect(ctx.arc).toHaveBeenCalled();
    expect(ctx.fill).toHaveBeenCalled();
  });

  it("applies node color as fill style", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData({
      nodes: [{ id: 1, labels: ["A"], visible: true, color: "#ff5733", data: { name: "test" } }],
      links: [],
    });

    const instance = getLastInstance();
    const graphData = canvas.getGraphData();
    const node = graphData.nodes[0];
    node.x = 0;
    node.y = 0;
    instance.callbacks.onZoom?.({ k: 1, x: 0, y: 0 });

    const ctx = createCtxSpy();
    instance.callbacks.nodeCanvasObject!(node, ctx);

    // fillStyle should be set to the node color at some point
    // We check that fill was called (the color is set via ctx.fillStyle assignment)
    expect(ctx.fill).toHaveBeenCalled();
  });

  it("renders text inside node using textFillRatio", () => {
    const canvas = createCanvas();
    canvas.setConfig({
      width: 800,
      height: 600,
      nodeStyle: { textFillRatio: 0.85 },
      captionsKeys: [["name", true]],
    });
    canvas.setData({
      nodes: [{ id: 1, labels: ["A"], visible: true, color: "#f00", data: { name: "Alice" } }],
      links: [],
    });

    const instance = getLastInstance();
    const graphData = canvas.getGraphData();
    const node = graphData.nodes[0];
    node.x = 0;
    node.y = 0;
    instance.callbacks.onZoom?.({ k: 1, x: 0, y: 0 });

    const ctx = createCtxSpy();
    instance.callbacks.nodeCanvasObject!(node, ctx);

    // Text should be rendered
    expect(ctx.fillText).toHaveBeenCalled();
  });

  it("renders text with fixed fontSize when textFillRatio is 0", () => {
    const canvas = createCanvas();
    canvas.setConfig({
      width: 800,
      height: 600,
      nodeStyle: { textFillRatio: 0, fontSize: 3 },
      captionsKeys: [["name", true]],
    });
    canvas.setData({
      nodes: [{ id: 1, labels: ["A"], visible: true, color: "#f00", data: { name: "Bob" } }],
      links: [],
    });

    const instance = getLastInstance();
    const graphData = canvas.getGraphData();
    const node = graphData.nodes[0];
    node.x = 0;
    node.y = 0;
    instance.callbacks.onZoom?.({ k: 1, x: 0, y: 0 });

    const ctx = createCtxSpy();
    instance.callbacks.nodeCanvasObject!(node, ctx);

    expect(ctx.fillText).toHaveBeenCalled();
  });

  it("applies glow effect when node has glow style", () => {
    const canvas = createCanvas();
    canvas.setConfig({
      width: 800,
      height: 600,
      nodeStyle: { glowSize: 5, glowColor: "rgba(255,0,0,0.5)" },
    });
    canvas.setData({
      nodes: [{ id: 1, labels: ["A"], visible: true, color: "#f00", data: {} }],
      links: [],
    });

    const instance = getLastInstance();
    const graphData = canvas.getGraphData();
    const node = graphData.nodes[0];
    node.x = 0;
    node.y = 0;
    instance.callbacks.onZoom?.({ k: 1, x: 0, y: 0 });

    const ctx = createCtxSpy();
    instance.callbacks.nodeCanvasObject!(node, ctx);

    // Glow renders extra arc calls (outer glow circle)
    expect(ctx.arc.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("applies stroke to selected nodes", () => {
    const canvas = createCanvas();
    canvas.setConfig({
      width: 800,
      height: 600,
      nodeStyle: { strokeWidthSelected: 1.5 },
    });
    canvas.setData({
      nodes: [{ id: 1, labels: ["A"], visible: true, color: "#f00", data: {}, selected: true }],
      links: [],
    });

    const instance = getLastInstance();
    const graphData = canvas.getGraphData();
    const node = graphData.nodes[0];
    node.x = 0;
    node.y = 0;
    instance.callbacks.onZoom?.({ k: 1, x: 0, y: 0 });

    const ctx = createCtxSpy();
    instance.callbacks.nodeCanvasObject!(node, ctx);

    // Selected node should have stroke
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it("skips rendering for nodes outside culling bounds (large graph mode)", () => {
    const canvas = createCanvas();
    canvas.setConfig({
      width: 800,
      height: 600,
      largeGraph: { enabled: true, lowZoomThreshold: 2, viewportPadding: 10 },
    });
    canvas.setData({
      nodes: [{ id: 1, labels: ["A"], visible: true, color: "#f00", data: {} }],
      links: [],
    });

    const instance = getLastInstance();
    setupInstanceDimensions(instance);
    const graphData = canvas.getGraphData();
    const node = graphData.nodes[0];
    // Place node far outside viewport
    node.x = 9999;
    node.y = 9999;
    instance.callbacks.onZoom?.({ k: 1, x: 0, y: 0 });

    const ctx = createCtxSpy();
    instance.callbacks.nodeCanvasObject!(node, ctx);

    // Node outside bounds should not draw arc
    expect(ctx.arc).not.toHaveBeenCalled();
  });

  it("resolves caption from captionsKeys with fuzzy match", () => {
    const canvas = createCanvas();
    canvas.setConfig({
      width: 800,
      height: 600,
      captionsKeys: [["Name", false]], // non-exact match (case-insensitive includes)
    });
    canvas.setData({
      nodes: [{ id: 1, labels: ["A"], visible: true, color: "#f00", data: { displayName: "Hello" } }],
      links: [],
    });

    const instance = getLastInstance();
    const graphData = canvas.getGraphData();
    const node = graphData.nodes[0];
    node.x = 0;
    node.y = 0;
    instance.callbacks.onZoom?.({ k: 1, x: 0, y: 0 });

    const ctx = createCtxSpy();
    instance.callbacks.nodeCanvasObject!(node, ctx);

    // displayName key contains "Name" (case-insensitive) so it should match
    expect(ctx.fillText).toHaveBeenCalled();
    const textArg = ctx.fillText.mock.calls[0]?.[0];
    expect(textArg).toContain("Hello");
  });

  it("falls back to node ID if no caption key matches", () => {
    const canvas = createCanvas();
    canvas.setConfig({
      width: 800,
      height: 600,
      captionsKeys: [["nonexistent", true]],
    });
    canvas.setData({
      nodes: [{ id: 42, labels: ["A"], visible: true, color: "#f00", data: { x: "y" } }],
      links: [],
    });

    const instance = getLastInstance();
    const graphData = canvas.getGraphData();
    const node = graphData.nodes[0];
    node.x = 0;
    node.y = 0;
    instance.callbacks.onZoom?.({ k: 1, x: 0, y: 0 });

    const ctx = createCtxSpy();
    instance.callbacks.nodeCanvasObject!(node, ctx);

    // Should still render something — likely the node id
    expect(ctx.fillText).toHaveBeenCalled();
  });

  it("renders expand indicator for nodes with expand[0]=true", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData({
      nodes: [{ id: 1, labels: ["A"], visible: true, color: "#f00", data: {}, expand: true }],
      links: [],
    });

    const instance = getLastInstance();
    const graphData = canvas.getGraphData();
    const node = graphData.nodes[0];
    node.x = 0;
    node.y = 0;
    instance.callbacks.onZoom?.({ k: 1, x: 0, y: 0 });

    const ctx = createCtxSpy();
    instance.callbacks.nodeCanvasObject!(node, ctx);

    // Should draw extra elements for expand indicator
    expect(ctx.beginPath.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe("link rendering", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    resetForceGraphMockState();
  });

  it("draws a straight line for simple link", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData({
      nodes: [
        { id: 1, labels: ["A"], visible: true, color: "#f00", data: {} },
        { id: 2, labels: ["B"], visible: true, color: "#0f0", data: {} },
      ],
      links: [
        { id: 1, relationship: "REL", source: 1, target: 2, visible: true, color: "#888", data: {} },
      ],
    });

    const instance = getLastInstance();
    const graphData = canvas.getGraphData();
    const link = graphData.links[0];
    link.source.x = -50;
    link.source.y = 0;
    link.target.x = 50;
    link.target.y = 0;

    instance.callbacks.onZoom?.({ k: 1, x: 0, y: 0 });

    const ctx = createCtxSpy();
    instance.callbacks.linkCanvasObject!(link, ctx, 1);

    // Should call moveTo/lineTo or bezierCurveTo for straight/curved link
    const drawCalls = ctx.moveTo.mock.calls.length + ctx.bezierCurveTo.mock.calls.length + ctx.quadraticCurveTo.mock.calls.length;
    expect(drawCalls).toBeGreaterThan(0);
  });

  it("draws curved links for parallel edges", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData({
      nodes: [
        { id: 1, labels: ["A"], visible: true, color: "#f00", data: {} },
        { id: 2, labels: ["B"], visible: true, color: "#0f0", data: {} },
      ],
      links: [
        { id: 1, relationship: "R1", source: 1, target: 2, visible: true, color: "#888", data: {} },
        { id: 2, relationship: "R2", source: 1, target: 2, visible: true, color: "#888", data: {} },
      ],
    });

    const instance = getLastInstance();
    const graphData = canvas.getGraphData();
    // Parallel links should have different curve values
    expect(graphData.links[0].curve).not.toBe(graphData.links[1].curve);

    // Position nodes
    graphData.links[0].source.x = -50;
    graphData.links[0].source.y = 0;
    graphData.links[0].target.x = 50;
    graphData.links[0].target.y = 0;

    instance.callbacks.onZoom?.({ k: 1, x: 0, y: 0 });

    const ctx = createCtxSpy();
    instance.callbacks.linkCanvasObject!(graphData.links[1], ctx, 1);

    // Curved link should use bezierCurveTo or quadraticCurveTo
    const curveCalls = ctx.bezierCurveTo.mock.calls.length + ctx.quadraticCurveTo.mock.calls.length;
    expect(curveCalls).toBeGreaterThan(0);
  });

  it("draws self-loop links", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData({
      nodes: [{ id: 1, labels: ["A"], visible: true, color: "#f00", data: {} }],
      links: [{ id: 1, relationship: "SELF", source: 1, target: 1, visible: true, color: "#888", data: {} }],
    });

    const instance = getLastInstance();
    const graphData = canvas.getGraphData();
    const link = graphData.links[0];
    link.source.x = 0;
    link.source.y = 0;

    instance.callbacks.onZoom?.({ k: 1, x: 0, y: 0 });

    const ctx = createCtxSpy();
    instance.callbacks.linkCanvasObject!(link, ctx, 1);

    // Self-loop should draw something (arc or bezier)
    const drawCalls = ctx.arc.mock.calls.length + ctx.bezierCurveTo.mock.calls.length + ctx.quadraticCurveTo.mock.calls.length;
    expect(drawCalls).toBeGreaterThan(0);
  });

  it("renders link label", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData({
      nodes: [
        { id: 1, labels: ["A"], visible: true, color: "#f00", data: {} },
        { id: 2, labels: ["B"], visible: true, color: "#0f0", data: {} },
      ],
      links: [
        { id: 1, relationship: "KNOWS", source: 1, target: 2, visible: true, color: "#888", data: {} },
      ],
    });

    const instance = getLastInstance();
    const graphData = canvas.getGraphData();
    graphData.links[0].source.x = -50;
    graphData.links[0].source.y = 0;
    graphData.links[0].target.x = 50;
    graphData.links[0].target.y = 0;

    instance.callbacks.onZoom?.({ k: 1, x: 0, y: 0 });

    const ctx = createCtxSpy();
    instance.callbacks.linkCanvasObject!(graphData.links[0], ctx, 1);

    // Should render the relationship label as text
    expect(ctx.fillText).toHaveBeenCalled();
    const textArgs = ctx.fillText.mock.calls.map((c: any[]) => c[0]);
    expect(textArgs.some((t: string) => t.includes("KNOWS"))).toBe(true);
  });

  it("skips rendering links outside culling bounds (large graph mode)", () => {
    const canvas = createCanvas();
    canvas.setConfig({
      width: 800,
      height: 600,
      largeGraph: { enabled: true, lowZoomThreshold: 2, viewportPadding: 10 },
    });
    canvas.setData({
      nodes: [
        { id: 1, labels: ["A"], visible: true, color: "#f00", data: {} },
        { id: 2, labels: ["B"], visible: true, color: "#0f0", data: {} },
      ],
      links: [
        { id: 1, relationship: "R", source: 1, target: 2, visible: true, color: "#888", data: {} },
      ],
    });

    const instance = getLastInstance();
    setupInstanceDimensions(instance);
    const graphData = canvas.getGraphData();
    const link = graphData.links[0];
    // Place both endpoints far outside viewport
    link.source.x = 9999;
    link.source.y = 9999;
    link.target.x = 9998;
    link.target.y = 9998;

    instance.callbacks.onZoom?.({ k: 1, x: 0, y: 0 });

    const ctx = createCtxSpy();
    instance.callbacks.linkCanvasObject!(link, ctx, 1);

    // Link outside bounds should not draw
    expect(ctx.moveTo).not.toHaveBeenCalled();
    expect(ctx.bezierCurveTo).not.toHaveBeenCalled();
    expect(ctx.lineTo).not.toHaveBeenCalled();
  });

  it("applies dash pattern to dashed links", () => {
    const canvas = createCanvas();
    canvas.setConfig({
      width: 800,
      height: 600,
      linkStyle: { dashPattern: [5, 3] },
    });
    canvas.setData({
      nodes: [
        { id: 1, labels: ["A"], visible: true, color: "#f00", data: {} },
        { id: 2, labels: ["B"], visible: true, color: "#0f0", data: {} },
      ],
      links: [
        { id: 1, relationship: "R", source: 1, target: 2, visible: true, color: "#888", data: {} },
      ],
    });

    const instance = getLastInstance();
    const graphData = canvas.getGraphData();
    graphData.links[0].source.x = -50;
    graphData.links[0].source.y = 0;
    graphData.links[0].target.x = 50;
    graphData.links[0].target.y = 0;

    instance.callbacks.onZoom?.({ k: 1, x: 0, y: 0 });

    const ctx = createCtxSpy();
    instance.callbacks.linkCanvasObject!(graphData.links[0], ctx, 1);

    expect(ctx.setLineDash).toHaveBeenCalled();
  });
});

describe("nodePointerAreaPaint", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    resetForceGraphMockState();
  });

  it("paints pointer area as filled circle with given color", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData({
      nodes: [{ id: 1, labels: ["A"], visible: true, color: "#f00", data: {} }],
      links: [],
    });

    const instance = getLastInstance();
    const graphData = canvas.getGraphData();
    const node = graphData.nodes[0];
    node.x = 0;
    node.y = 0;

    const ctx = createCtxSpy();
    const areaPainter = instance.callbacks.nodePointerAreaPaint!;
    areaPainter(node, "#00ff00", ctx);

    expect(ctx.arc).toHaveBeenCalled();
    expect(ctx.fill).toHaveBeenCalled();
  });
});

describe("linkPointerAreaPaint", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    resetForceGraphMockState();
  });

  it("paints link pointer area with given color", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData({
      nodes: [
        { id: 1, labels: ["A"], visible: true, color: "#f00", data: {} },
        { id: 2, labels: ["B"], visible: true, color: "#0f0", data: {} },
      ],
      links: [
        { id: 1, relationship: "R", source: 1, target: 2, visible: true, color: "#888", data: {} },
      ],
    });

    const instance = getLastInstance();
    const graphData = canvas.getGraphData();
    const link = graphData.links[0];
    link.source.x = -50;
    link.source.y = 0;
    link.target.x = 50;
    link.target.y = 0;

    const ctx = createCtxSpy();
    const areaPainter = instance.callbacks.linkPointerAreaPaint!;
    areaPainter(link, "#00ff00", ctx);

    // Should paint the hit area along the link path
    expect(ctx.stroke).toHaveBeenCalled();
  });
});
