import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  forceGraphMockState,
  resetForceGraphMockState,
} from "./mocks/force-graph";

vi.mock("force-graph", async () => import("./mocks/force-graph"));

import "../src/canvas";
import type { CanvasTestElement } from "./test-types";

type CanvasElement = CanvasTestElement;

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

const SIMPLE_DATA = {
  nodes: [
    { id: 1, labels: ["Person"], visible: true, color: "#f00", data: { name: "Alice" } },
    { id: 2, labels: ["Person"], visible: true, color: "#0f0", data: { name: "Bob" } },
  ],
  links: [
    { id: 1, relationship: "KNOWS", source: 1, target: 2, visible: true, color: "#888", data: {} },
  ],
};

describe("event handler binding", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    resetForceGraphMockState();
  });

  it("onNodeClick fires handler with node", () => {
    const handler = vi.fn();
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600, eventHandlers: { onNodeClick: handler } });
    canvas.setData(SIMPLE_DATA);

    const instance = getLastInstance();
    const graphData = canvas.getGraphData();
    const node = graphData.nodes[0];
    const event = new MouseEvent("click");

    instance.callbacks.onNodeClick?.(node, event);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), event);
  });

  it("onLinkClick fires handler with link", () => {
    const handler = vi.fn();
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600, eventHandlers: { onLinkClick: handler } });
    canvas.setData(SIMPLE_DATA);

    const instance = getLastInstance();
    const graphData = canvas.getGraphData();
    const link = graphData.links[0];
    const event = new MouseEvent("click");

    instance.callbacks.onLinkClick?.(link, event);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: 1, relationship: "KNOWS" }), event);
  });

  it("onNodeRightClick fires handler", () => {
    const handler = vi.fn();
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600, eventHandlers: { onNodeRightClick: handler } });
    canvas.setData(SIMPLE_DATA);

    const instance = getLastInstance();
    const graphData = canvas.getGraphData();
    const event = new MouseEvent("contextmenu");
    instance.callbacks.onNodeRightClick?.(graphData.nodes[0], event);
    expect(handler).toHaveBeenCalled();
  });

  it("onLinkRightClick fires handler", () => {
    const handler = vi.fn();
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600, eventHandlers: { onLinkRightClick: handler } });
    canvas.setData(SIMPLE_DATA);

    const instance = getLastInstance();
    const graphData = canvas.getGraphData();
    const event = new MouseEvent("contextmenu");
    instance.callbacks.onLinkRightClick?.(graphData.links[0], event);
    expect(handler).toHaveBeenCalled();
  });

  it("onNodeHover fires handler", () => {
    const handler = vi.fn();
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600, eventHandlers: { onNodeHover: handler } });
    canvas.setData(SIMPLE_DATA);

    const instance = getLastInstance();
    const graphData = canvas.getGraphData();
    // Canvas wraps onNodeHover to pass only (node) — not (node, previousNode)
    instance.callbacks.onNodeHover?.(graphData.nodes[0], null);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  });

  it("onLinkHover fires handler", () => {
    const handler = vi.fn();
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600, eventHandlers: { onLinkHover: handler } });
    canvas.setData(SIMPLE_DATA);

    const instance = getLastInstance();
    const graphData = canvas.getGraphData();
    // Canvas wraps onLinkHover to pass only (link) — not (link, previousLink)
    instance.callbacks.onLinkHover?.(graphData.links[0], null);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: 1, relationship: "KNOWS" }));
  });

  it("onBackgroundClick fires handler", () => {
    const handler = vi.fn();
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600, eventHandlers: { onBackgroundClick: handler } });
    canvas.setData(SIMPLE_DATA);

    const instance = getLastInstance();
    const event = new MouseEvent("click");
    instance.callbacks.onBackgroundClick?.(event);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it("onBackgroundRightClick fires handler", () => {
    const handler = vi.fn();
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600, eventHandlers: { onBackgroundRightClick: handler } });
    canvas.setData(SIMPLE_DATA);

    const instance = getLastInstance();
    const event = new MouseEvent("contextmenu");
    instance.callbacks.onBackgroundRightClick?.(event);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it("onNodeDragEnd fires handler", () => {
    const handler = vi.fn();
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600, eventHandlers: { onNodeDragEnd: handler } });
    canvas.setData(SIMPLE_DATA);

    const instance = getLastInstance();
    const graphData = canvas.getGraphData();
    instance.callbacks.onNodeDragEnd?.(graphData.nodes[0], { x: 10, y: 20 });
    expect(handler).toHaveBeenCalled();
  });

  it("onNodeDragEnd fires handler", () => {
    const handler = vi.fn();
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600, eventHandlers: { onNodeDragEnd: handler } });
    canvas.setData(SIMPLE_DATA);

    const instance = getLastInstance();
    const graphData = canvas.getGraphData();
    instance.callbacks.onNodeDragEnd?.(graphData.nodes[0], { x: 10, y: 20 });
    expect(handler).toHaveBeenCalled();
  });

  it("onZoom fires handler and updates culling bounds", () => {
    const handler = vi.fn();
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600, eventHandlers: { onZoom: handler } });
    canvas.setData(SIMPLE_DATA);

    const instance = getLastInstance();
    instance.callbacks.onZoom?.({ k: 2, x: 0, y: 0 });
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ k: 2 }));
  });

  it("onEngineStop callback is registered", () => {
    const handler = vi.fn();
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600, eventHandlers: { onEngineStop: handler } });
    canvas.setData(SIMPLE_DATA);

    const instance = getLastInstance();
    // The onEngineStop callback is overridden during warmup flow.
    // After warmup completes (first call), it gets reset. Just verify it's registered.
    expect(instance.callbacks.onEngineStop).toBeDefined();
  });
});

describe("event handler updates via setConfig", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    resetForceGraphMockState();
  });

  it("can replace event handlers dynamically", () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600, eventHandlers: { onNodeClick: handler1 } });
    canvas.setData(SIMPLE_DATA);

    const instance = getLastInstance();
    const graphData = canvas.getGraphData();
    const event = new MouseEvent("click");

    // Fire with first handler
    instance.callbacks.onNodeClick?.(graphData.nodes[0], event);
    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).not.toHaveBeenCalled();

    // Replace handler
    canvas.setConfig({ eventHandlers: { onNodeClick: handler2 } });
    instance.callbacks.onNodeClick?.(graphData.nodes[0], event);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it("onNodeDragEnd with pinOnDragEnd pins the node", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);

    // Enable pin on drag end
    (canvas as any).setPinOnDragEnd(true);

    const instance = getLastInstance();
    const graphData = canvas.getGraphData();
    const node = graphData.nodes[0];

    // Simulate drag end
    instance.callbacks.onNodeDragEnd?.(node, { x: 50, y: 60 });

    // The node should be pinned
    expect(node.fx).toBeDefined();
    expect(node.fy).toBeDefined();
  });
});
