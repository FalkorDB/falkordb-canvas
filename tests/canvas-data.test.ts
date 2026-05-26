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
  setGraphData: (data: { nodes: unknown[]; links: unknown[] }) => void;
  getData: () => { nodes: unknown[]; links: unknown[] };
  getGraphData: () => { nodes: any[]; links: any[] };
  setWidth: (w: number) => void;
  setHeight: (h: number) => void;
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

describe("setData and getData", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    resetForceGraphMockState();
  });

  it("roundtrip: setData then getData returns same structure", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });

    const input = {
      nodes: [
        { id: 1, labels: ["A"], visible: true, color: "#f00", data: { name: "n1" } },
        { id: 2, labels: ["B"], visible: true, color: "#0f0", data: { name: "n2" } },
      ],
      links: [
        { id: 1, relationship: "REL", source: 1, target: 2, visible: true, color: "#888", data: {} },
      ],
    };

    canvas.setData(input);
    const output = canvas.getData();

    expect(output.nodes.length).toBe(2);
    expect(output.links.length).toBe(1);
    expect((output.nodes[0] as any).id).toBe(1);
    expect((output.nodes[1] as any).id).toBe(2);
    expect((output.links[0] as any).source).toBe(1);
    expect((output.links[0] as any).target).toBe(2);
  });

  it("getData strips runtime properties (x, y, fx, fy, displayName)", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });

    canvas.setData({
      nodes: [{ id: 1, labels: ["A"], visible: true, color: "#f00", data: {} }],
      links: [],
    });

    const output = canvas.getData();
    const node = output.nodes[0] as any;
    expect(node.x).toBeUndefined();
    expect(node.y).toBeUndefined();
    expect(node.fx).toBeUndefined();
    expect(node.fy).toBeUndefined();
    expect(node.displayName).toBeUndefined();
    expect(node.vx).toBeUndefined();
    expect(node.vy).toBeUndefined();
  });

  it("getGraphData returns runtime properties", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });

    canvas.setData({
      nodes: [{ id: 1, labels: ["A"], visible: true, color: "#f00", data: {} }],
      links: [],
    });

    const graphData = canvas.getGraphData();
    const node = graphData.nodes[0];
    expect(node.displayName).toBeDefined();
    expect(node.size).toBeDefined();
  });

  it("handles empty data", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData({ nodes: [], links: [] });

    const output = canvas.getData();
    expect(output.nodes).toEqual([]);
    expect(output.links).toEqual([]);
  });

  it("assigns circular layout positions to new nodes", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });

    canvas.setData({
      nodes: [
        { id: 1, labels: ["A"], visible: true, color: "#f00", data: {} },
        { id: 2, labels: ["B"], visible: true, color: "#0f0", data: {} },
        { id: 3, labels: ["C"], visible: true, color: "#00f", data: {} },
      ],
      links: [],
    });

    const graphData = canvas.getGraphData();
    // All nodes should have positions assigned
    for (const node of graphData.nodes) {
      expect(typeof node.x).toBe("number");
      expect(typeof node.y).toBe("number");
      expect(Number.isNaN(node.x)).toBe(false);
      expect(Number.isNaN(node.y)).toBe(false);
    }

    // Nodes should not all be at the same position
    const positions = graphData.nodes.map((n: any) => `${n.x},${n.y}`);
    const unique = new Set(positions);
    expect(unique.size).toBe(3);
  });

  it("calculates parallel edge curves for duplicate source-target pairs", () => {
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
        { id: 3, relationship: "R3", source: 1, target: 2, visible: true, color: "#888", data: {} },
      ],
    });

    const graphData = canvas.getGraphData();
    // Parallel edges should have different curve values
    const curves = graphData.links.map((l: any) => l.curve);
    const uniqueCurves = new Set(curves);
    expect(uniqueCurves.size).toBe(3);
  });

  it("calculates self-loop curves differently", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });

    canvas.setData({
      nodes: [
        { id: 1, labels: ["A"], visible: true, color: "#f00", data: {} },
      ],
      links: [
        { id: 1, relationship: "SELF", source: 1, target: 1, visible: true, color: "#888", data: {} },
      ],
    });

    const graphData = canvas.getGraphData();
    const link = graphData.links[0];
    expect(link.curve).toBeDefined();
    expect(typeof link.curve).toBe("number");
  });

  it("filters out links with invalid source/target IDs", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    canvas.setData({
      nodes: [
        { id: 1, labels: ["A"], visible: true, color: "#f00", data: {} },
      ],
      links: [
        { id: 1, relationship: "REL", source: 1, target: 999, visible: true, color: "#888", data: {} },
      ],
    });

    const graphData = canvas.getGraphData();
    expect(graphData.links.length).toBe(0);
    consoleSpy.mockRestore();
  });
});

describe("setGraphData incremental updates", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    resetForceGraphMockState();
  });

  it("preserves existing node identity when IDs match", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });

    canvas.setData({
      nodes: [
        { id: 1, labels: ["A"], visible: true, color: "#f00", data: { name: "original" } },
      ],
      links: [],
    });

    const graphData1 = canvas.getGraphData();
    const originalNode = graphData1.nodes[0];
    originalNode.x = 42;
    originalNode.y = 99;

    // Update with same ID — should reuse node object
    canvas.setGraphData({
      nodes: [
        { id: 1, labels: ["A"], visible: true, color: "#f00", data: { name: "original" } },
        { id: 2, labels: ["B"], visible: true, color: "#0f0", data: { name: "new" } },
      ],
      links: [],
    });

    const graphData2 = canvas.getGraphData();
    const reusedNode = graphData2.nodes.find((n: any) => n.id === 1);
    expect(reusedNode).toBe(originalNode); // Same object reference
    expect(reusedNode.x).toBe(42);
    expect(reusedNode.y).toBe(99);
  });

  it("adds new nodes and removes missing ones", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });

    canvas.setData({
      nodes: [
        { id: 1, labels: ["A"], visible: true, color: "#f00", data: {} },
        { id: 2, labels: ["B"], visible: true, color: "#0f0", data: {} },
      ],
      links: [],
    });

    // Replace with different set — id 2 removed, id 3 added
    canvas.setGraphData({
      nodes: [
        { id: 1, labels: ["A"], visible: true, color: "#f00", data: {} },
        { id: 3, labels: ["C"], visible: true, color: "#00f", data: {} },
      ],
      links: [],
    });

    const graphData = canvas.getGraphData();
    expect(graphData.nodes.length).toBe(2);
    const ids = graphData.nodes.map((n: any) => n.id);
    expect(ids).toContain(1);
    expect(ids).toContain(3);
    expect(ids).not.toContain(2);
  });
});
