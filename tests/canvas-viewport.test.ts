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
  getViewport: () => { zoom: number; centerX: number; centerY: number } | undefined;
  setViewport: (viewport: { zoom: number; centerX: number; centerY: number }) => void;
  zoomToFit: (paddingMultiplier?: number) => void;
  getZoom: () => number;
  zoom: (zoomLevel: number) => void;
};

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

const SIMPLE_DATA = {
  nodes: [
    { id: 1, labels: ["A"], visible: true, color: "#f00", data: { name: "n1" } },
    { id: 2, labels: ["B"], visible: true, color: "#0f0", data: { name: "n2" } },
  ],
  links: [
    { id: 1, relationship: "R", source: 1, target: 2, visible: true, color: "#888", data: {} },
  ],
};

describe("viewport methods", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    resetForceGraphMockState();
  });

  it("getViewport returns current zoom and center", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);

    const viewport = canvas.getViewport();
    expect(viewport).toHaveProperty("zoom");
    expect(viewport).toHaveProperty("centerX");
    expect(viewport).toHaveProperty("centerY");
    expect(typeof viewport!.zoom).toBe("number");
    expect(typeof viewport!.centerX).toBe("number");
    expect(typeof viewport!.centerY).toBe("number");
  });

  it("setViewport updates zoom and center", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);

    canvas.setViewport({ centerX: 100, centerY: 200, zoom: 2 });
    const instance = getLastInstance();
    expect(instance.zoomValue).toBe(2);
    expect(instance.center.x).toBe(100);
    expect(instance.center.y).toBe(200);
  });

  it("getZoom returns the current zoom level", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);

    const instance = getLastInstance();
    instance.zoomValue = 2.5;
    const zoom = canvas.getZoom();
    expect(zoom).toBe(2.5);
  });

  it("zoom sets the zoom level", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);

    canvas.zoom(3);
    const instance = getLastInstance();
    expect(instance.zoomValue).toBe(3);
  });

  it("zoomToFit calls underlying force-graph method", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);

    canvas.zoomToFit(1);
    const instance = getLastInstance();
    expect(instance.zoomToFitCalls).toBe(1);
  });

  it("zoomToFit with default parameters", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);

    canvas.zoomToFit();
    const instance = getLastInstance();
    expect(instance.zoomToFitCalls).toBe(1);
  });
});

describe("onZoom updates culling bounds", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    resetForceGraphMockState();
  });

  it("zooming in tightens culling bounds (far nodes get culled)", () => {
    const canvas = createCanvas();
    canvas.setConfig({
      width: 800,
      height: 600,
      largeGraph: { enabled: true, lowZoomThreshold: 2, viewportPadding: 10 },
    });
    canvas.setData(SIMPLE_DATA);

    const instance = getLastInstance();
    setupInstanceDimensions(instance);
    const graphData = (canvas as any).getGraphData();

    // Place node at moderate distance
    graphData.nodes[0].x = 300;
    graphData.nodes[0].y = 0;
    graphData.nodes[0].size = 6;

    // Simulate zoom-in (k=2 means zoomed in 2x, viewport is smaller)
    instance.callbacks.onZoom?.({ k: 2, x: 0, y: 0 });

    const ctx = createCtxSpy();
    instance.callbacks.nodeCanvasObject!(graphData.nodes[0], ctx);

    // At k=2, visible area is 800/(2*2) = 200px from center,
    // node at x=300 should be outside bounds
    expect(ctx.arc).not.toHaveBeenCalled();
  });

  it("zooming out widens culling bounds (far nodes become visible)", () => {
    const canvas = createCanvas();
    canvas.setConfig({
      width: 800,
      height: 600,
      largeGraph: { enabled: true, lowZoomThreshold: 2, viewportPadding: 10 },
    });
    canvas.setData(SIMPLE_DATA);

    const instance = getLastInstance();
    setupInstanceDimensions(instance);
    const graphData = (canvas as any).getGraphData();

    // Place node at moderate distance
    graphData.nodes[0].x = 300;
    graphData.nodes[0].y = 0;
    graphData.nodes[0].size = 6;

    // Simulate zoom-out (k=0.5 means viewport shows wider area)
    instance.callbacks.onZoom?.({ k: 0.5, x: 0, y: 0 });

    const ctx = createCtxSpy();
    instance.callbacks.nodeCanvasObject!(graphData.nodes[0], ctx);

    // At k=0.5, visible area is 800/(2*0.5) = 800px from center,
    // node at x=300 should be inside bounds
    expect(ctx.arc).toHaveBeenCalled();
  });

  it("panning shifts culling bounds center", () => {
    const canvas = createCanvas();
    canvas.setConfig({
      width: 800,
      height: 600,
      largeGraph: { enabled: true, lowZoomThreshold: 2, viewportPadding: 10 },
    });
    canvas.setData(SIMPLE_DATA);

    const instance = getLastInstance();
    setupInstanceDimensions(instance);
    const graphData = (canvas as any).getGraphData();

    // Place node at (500, 0)
    graphData.nodes[0].x = 500;
    graphData.nodes[0].y = 0;
    graphData.nodes[0].size = 6;

    // Pan to center on (500, 0) so node is in view
    instance.callbacks.onZoom?.({ k: 1, x: 500, y: 0 });

    const ctx = createCtxSpy();
    instance.callbacks.nodeCanvasObject!(graphData.nodes[0], ctx);

    expect(ctx.arc).toHaveBeenCalled();
  });
});
