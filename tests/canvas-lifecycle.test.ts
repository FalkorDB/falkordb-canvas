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
  getData: () => { nodes: unknown[]; links: unknown[] };
  getGraphData: () => { nodes: any[]; links: any[] };
  destroy: () => void;
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

describe("lifecycle", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    resetForceGraphMockState();
  });

  it("custom element is registered", () => {
    const element = document.createElement("falkordb-canvas");
    expect(element.constructor.name).not.toBe("HTMLElement");
  });

  it("connectedCallback creates force-graph instance", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    expect(forceGraphMockState.lastInstance).toBeDefined();
  });

  it("disconnectedCallback destroys force-graph instance", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData({ nodes: [], links: [] });
    const instance = getLastInstance();

    document.body.removeChild(canvas);
    expect(instance.destroyed).toBe(true);
  });

  it("can be re-attached to DOM", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData({ nodes: [], links: [] });

    document.body.removeChild(canvas);
    document.body.appendChild(canvas);

    // Should create a new instance
    const newInstance = getLastInstance();
    expect(newInstance).toBeDefined();
  });

  it("destroy method cleans up", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData({ nodes: [], links: [] });

    if (canvas.destroy) {
      canvas.destroy();
    }
  });
});

describe("edge cases", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    resetForceGraphMockState();
  });

  it("handles empty graph data", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData({ nodes: [], links: [] });

    const data = canvas.getData();
    expect(data.nodes).toEqual([]);
    expect(data.links).toEqual([]);
  });

  it("handles single node with no links", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData({
      nodes: [{ id: 1, labels: ["Alone"], visible: true, color: "#f00", data: { name: "lonely" } }],
      links: [],
    });

    const data = canvas.getData();
    expect(data.nodes.length).toBe(1);
    expect(data.links.length).toBe(0);
  });

  it("handles large number of nodes", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });

    const nodes = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      labels: ["N"],
      visible: true,
      color: "#f00",
      data: { idx: i },
    }));
    const links = Array.from({ length: 99 }, (_, i) => ({
      id: i + 1,
      relationship: "NEXT",
      source: i + 1,
      target: i + 2,
      visible: true,
      color: "#888",
      data: {},
    }));

    canvas.setData({ nodes, links });
    const data = canvas.getData();
    expect(data.nodes.length).toBe(100);
    expect(data.links.length).toBe(99);
  });

  it("handles nodes with empty labels array", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData({
      nodes: [{ id: 1, labels: [], visible: true, color: "#f00", data: {} }],
      links: [],
    });

    const data = canvas.getData();
    expect(data.nodes.length).toBe(1);
  });

  it("handles nodes with empty data object", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData({
      nodes: [{ id: 1, labels: ["A"], visible: true, color: "#f00", data: {} }],
      links: [],
    });

    const data = canvas.getData();
    expect(data.nodes.length).toBe(1);
  });

  it("handles complete graph (all nodes connected to all others)", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });

    const nodes = [
      { id: 1, labels: ["A"], visible: true, color: "#f00", data: {} },
      { id: 2, labels: ["B"], visible: true, color: "#0f0", data: {} },
      { id: 3, labels: ["C"], visible: true, color: "#00f", data: {} },
    ];
    const links = [
      { id: 1, relationship: "R", source: 1, target: 2, visible: true, color: "#888", data: {} },
      { id: 2, relationship: "R", source: 1, target: 3, visible: true, color: "#888", data: {} },
      { id: 3, relationship: "R", source: 2, target: 3, visible: true, color: "#888", data: {} },
    ];

    canvas.setData({ nodes, links });
    const graphData = canvas.getGraphData();
    expect(graphData.nodes.length).toBe(3);
    expect(graphData.links.length).toBe(3);
  });

  it("handles multiple self-loops on same node", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });

    canvas.setData({
      nodes: [{ id: 1, labels: ["A"], visible: true, color: "#f00", data: {} }],
      links: [
        { id: 1, relationship: "S1", source: 1, target: 1, visible: true, color: "#888", data: {} },
        { id: 2, relationship: "S2", source: 1, target: 1, visible: true, color: "#888", data: {} },
        { id: 3, relationship: "S3", source: 1, target: 1, visible: true, color: "#888", data: {} },
      ],
    });

    const graphData = canvas.getGraphData();
    expect(graphData.links.length).toBe(3);
    // All self-loops should have different curves
    const curves = graphData.links.map((l: any) => l.curve);
    const uniqueCurves = new Set(curves);
    expect(uniqueCurves.size).toBe(3);
  });

  it("setData replaces all previous data", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });

    canvas.setData({
      nodes: [
        { id: 1, labels: ["A"], visible: true, color: "#f00", data: {} },
        { id: 2, labels: ["B"], visible: true, color: "#0f0", data: {} },
      ],
      links: [],
    });

    canvas.setData({
      nodes: [{ id: 3, labels: ["C"], visible: true, color: "#00f", data: {} }],
      links: [],
    });

    const data = canvas.getData();
    expect(data.nodes.length).toBe(1);
    expect((data.nodes[0] as any).id).toBe(3);
  });

  it("handles node with custom size", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });

    canvas.setData({
      nodes: [{ id: 1, labels: ["A"], visible: true, color: "#f00", data: {}, size: 20 }],
      links: [],
    });

    const graphData = canvas.getGraphData();
    expect(graphData.nodes[0].size).toBe(20);
  });

  it("handles node with default size", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });

    canvas.setData({
      nodes: [{ id: 1, labels: ["A"], visible: true, color: "#f00", data: {} }],
      links: [],
    });

    const graphData = canvas.getGraphData();
    expect(graphData.nodes[0].size).toBe(9); // NODE_SIZE default
  });
});

describe("setConfig triggers render", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    resetForceGraphMockState();
  });

  it("setConfig after setData forces a re-render", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData({
      nodes: [{ id: 1, labels: ["A"], visible: true, color: "#f00", data: { name: "test" } }],
      links: [],
    });

    // This should not throw and should trigger a render
    canvas.setConfig({ nodeStyle: { strokeWidthSelected: 3 } });
    canvas.setConfig({ linkStyle: { lineWidthSelected: 2 } });
  });

  it("setConfig before setData does not throw", () => {
    const canvas = createCanvas();
    // Config before data — should be fine
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setConfig({ nodeStyle: { fontSize: 4 } });
    canvas.setConfig({ linkStyle: { lineWidthUnselected: 0.3 } });
    canvas.setConfig({ simulation: { chargeStrength: -100 } });
  });
});
