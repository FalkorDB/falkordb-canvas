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

const TREE_DATA = {
  nodes: [
    { id: 1, labels: ["Root"], visible: true, color: "#f00", data: { name: "root" } },
    { id: 2, labels: ["Child"], visible: true, color: "#0f0", data: { name: "child1" } },
    { id: 3, labels: ["Child"], visible: true, color: "#00f", data: { name: "child2" } },
    { id: 4, labels: ["Leaf"], visible: true, color: "#ff0", data: { name: "leaf" } },
  ],
  links: [
    { id: 1, relationship: "HAS", source: 1, target: 2, visible: true, color: "#888", data: {} },
    { id: 2, relationship: "HAS", source: 1, target: 3, visible: true, color: "#888", data: {} },
    { id: 3, relationship: "HAS", source: 2, target: 4, visible: true, color: "#888", data: {} },
  ],
};

describe("layout modes", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    resetForceGraphMockState();
  });

  it("defaults to force layout", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(TREE_DATA);

    const instance = getLastInstance();
    // Force layout should have warmup ticks and link force
    expect(instance.forceMap.has("link")).toBe(true);
  });

  it("switches to tree layout", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(TREE_DATA);

    canvas.setLayout("tree");
    const graphData = canvas.getGraphData();
    // Tree layout pins nodes at computed positions
    for (const node of graphData.nodes) {
      expect(node.fx).toBeDefined();
      expect(node.fy).toBeDefined();
    }
  });

  it("switches to radial layout", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(TREE_DATA);

    canvas.setLayout("radial");
    const graphData = canvas.getGraphData();
    // Radial layout pins nodes in circular arrangement
    for (const node of graphData.nodes) {
      expect(node.fx).toBeDefined();
      expect(node.fy).toBeDefined();
    }
    // Root should be at center (0,0)
    const root = graphData.nodes.find((n) => n.id === 1);
    expect(root!.fx).toBe(0);
    expect(root!.fy).toBe(0);
  });

  it("switches back to force layout unpins nodes", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(TREE_DATA);

    // Switch to tree then back to force
    canvas.setLayout("tree");
    canvas.setLayout("force");

    const graphData = canvas.getGraphData();
    // Force layout should unpin nodes
    for (const node of graphData.nodes) {
      expect(node.fx).toBeUndefined();
      expect(node.fy).toBeUndefined();
    }
  });

  it("tree layout with different directions produces different arrangements", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(TREE_DATA);

    // Top-down
    canvas.setLayoutOptions({ tree: { direction: "td" } });
    canvas.setLayout("tree");
    const tdData = canvas.getGraphData();
    const tdRoot = tdData.nodes.find((n) => n.id === 1);
    const tdChild = tdData.nodes.find((n) => n.id === 2);

    // Root should be above child in top-down
    expect(tdRoot!.fy).toBeLessThan(tdChild!.fy!);
  });

  it("tree layout bottom-up puts root below children", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(TREE_DATA);

    canvas.setLayoutOptions({ tree: { direction: "bu" } });
    canvas.setLayout("tree");
    const data = canvas.getGraphData();
    const root = data.nodes.find((n) => n.id === 1);
    const child = data.nodes.find((n) => n.id === 2);

    expect(root!.fy).toBeGreaterThan(child!.fy!);
  });

  it("tree layout left-right puts root to the left", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(TREE_DATA);

    canvas.setLayoutOptions({ tree: { direction: "lr" } });
    canvas.setLayout("tree");
    const data = canvas.getGraphData();
    const root = data.nodes.find((n) => n.id === 1);
    const child = data.nodes.find((n) => n.id === 2);

    expect(root!.fx).toBeLessThan(child!.fx!);
  });

  it("handles disconnected nodes in tree layout", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });

    canvas.setData({
      nodes: [
        { id: 1, labels: ["A"], visible: true, color: "#f00", data: {} },
        { id: 2, labels: ["B"], visible: true, color: "#0f0", data: {} },
        { id: 3, labels: ["C"], visible: true, color: "#00f", data: {} },
      ],
      links: [
        { id: 1, relationship: "R", source: 1, target: 2, visible: true, color: "#888", data: {} },
        // Node 3 is disconnected
      ],
    });

    canvas.setLayout("tree");
    const data = canvas.getGraphData();
    // All nodes should have positions (disconnected at depth 0)
    for (const node of data.nodes) {
      expect(node.fx).toBeDefined();
      expect(node.fy).toBeDefined();
    }
  });

  it("handles cyclic graphs in tree layout", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });

    canvas.setData({
      nodes: [
        { id: 1, labels: ["A"], visible: true, color: "#f00", data: {} },
        { id: 2, labels: ["B"], visible: true, color: "#0f0", data: {} },
        { id: 3, labels: ["C"], visible: true, color: "#00f", data: {} },
      ],
      links: [
        { id: 1, relationship: "R", source: 1, target: 2, visible: true, color: "#888", data: {} },
        { id: 2, relationship: "R", source: 2, target: 3, visible: true, color: "#888", data: {} },
        { id: 3, relationship: "R", source: 3, target: 1, visible: true, color: "#888", data: {} },
      ],
    });

    // Should not throw on cyclic graph
    canvas.setLayout("tree");
    const data = canvas.getGraphData();
    for (const node of data.nodes) {
      expect(node.fx).toBeDefined();
      expect(node.fy).toBeDefined();
    }
  });

  it("triggers onLayoutChange callback", () => {
    const onLayoutChange = vi.fn();
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600, eventHandlers: { onLayoutChange } });
    canvas.setData(TREE_DATA);

    canvas.setLayout("tree");
    expect(onLayoutChange).toHaveBeenCalledWith("tree");
  });
});

describe("animation", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    resetForceGraphMockState();
  });

  it("setAnimation(true) reheats simulation", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(TREE_DATA);

    const instance = getLastInstance();
    canvas.setAnimation(true);
    expect(instance.d3ReheatSimulationCalls).toBeGreaterThan(0);
  });

  it("setAnimation(false) stops simulation and pins nodes", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(TREE_DATA);

    const instance = getLastInstance();
    canvas.setAnimation(true);
    canvas.setAnimation(false);

    // Should have set cooldownTicks(0) to stop simulation
    expect(instance.cooldownTicksHistory).toContain(0);
  });
});

describe("setPinOnDragEnd", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    resetForceGraphMockState();
  });

  it("triggers onPinChange callback", () => {
    const onPinChange = vi.fn();
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600, eventHandlers: { onPinChange } });
    canvas.setData(TREE_DATA);

    canvas.setPinOnDragEnd(true);
    expect(onPinChange).toHaveBeenCalledWith(true);

    canvas.setPinOnDragEnd(false);
    expect(onPinChange).toHaveBeenCalledWith(false);
  });
});

describe("link force visibility", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    resetForceGraphMockState();
  });

  function linkStrengths(data: typeof TREE_DATA) {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(data);

    const instance = getLastInstance();
    const linkForce = instance.d3Force("link") as {
      strengthAccessor?: (link: unknown, index: number, links: unknown[]) => number;
    };
    const links = canvas.getGraphData().links;

    return links.map((link, index) => linkForce.strengthAccessor!(link, index, links));
  }

  it("gives a hidden link no pull over its endpoints", () => {
    const hidden = {
      ...TREE_DATA,
      links: TREE_DATA.links.map((l) => (l.id === 3 ? { ...l, visible: false } : l)),
    };

    expect(linkStrengths(hidden)[2]).toBe(0);
  });

  it("does not weaken the remaining links when one is hidden", () => {
    const before = linkStrengths(TREE_DATA);
    document.body.innerHTML = "";
    resetForceGraphMockState();

    const hidden = {
      ...TREE_DATA,
      links: TREE_DATA.links.map((l) => (l.id === 3 ? { ...l, visible: false } : l)),
    };
    const after = linkStrengths(hidden);

    // Link 1 shares node 2 with the hidden link 3. Node 2's visible degree
    // drops to 1, so link 1 pulls at full strength rather than 1/2.
    expect(before[0]).toBe(0.5);
    expect(after[0]).toBe(1);
  });

  it("normalises visible links by degree", () => {
    const strengths = linkStrengths(TREE_DATA);

    // d3's rule: 1 / min(degree(source), degree(target)). Nodes 1 and 2 have
    // degree 2, nodes 3 and 4 degree 1.
    expect(strengths).toEqual([0.5, 1, 1]);
  });

  it("re-derives strengths when a live link is hidden and refresh() is called", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(TREE_DATA);

    const instance = getLastInstance();
    const read = () => {
      const linkForce = instance.d3Force("link") as {
        strengthAccessor?: (link: unknown, index: number, links: unknown[]) => number;
      };
      const links = canvas.getGraphData().links;
      return links.map((link, index) => linkForce.strengthAccessor!(link, index, links));
    };

    expect(read()).toEqual([0.5, 1, 1]);

    // getGraphData() hands back the live links, so this is an in-place mutation.
    canvas.getGraphData().links[2].visible = false;

    // d3 caches strengths at initialise time and never recomputes them per
    // tick, so the fix is that refresh() re-registers the accessor — that setter
    // is what re-runs initializeStrength. Asserting on the accessor's return
    // value alone would pass either way, since the accessor itself is pure.
    const linkForce = instance.d3Force("link") as { strength: (fn: unknown) => unknown };
    const strengthSpy = vi.spyOn(linkForce, "strength");

    canvas.refresh();

    expect(strengthSpy).toHaveBeenCalled();
    expect(read()).toEqual([1, 1, 0]);
  });
});
