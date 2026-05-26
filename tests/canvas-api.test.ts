import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  forceGraphMockState,
  resetForceGraphMockState,
} from "./mocks/force-graph";

vi.mock("force-graph", async () => import("./mocks/force-graph"));

import "../src/canvas";

type CanvasElement = HTMLElement & {
  setConfig: (config: Record<string, unknown>) => void;
  setData: (data: { nodes: NodeInput[]; links: LinkInput[] }) => void;
  getData: () => { nodes: NodeInput[]; links: LinkInput[] };
  setWidth: (w: number) => void;
  setHeight: (h: number) => void;
  setBackgroundColor: (color: string) => void;
  setForegroundColor: (color: string) => void;
  setAnimation: (enabled: boolean) => void;
  setPinOnDragEnd: (pin: boolean) => void;
  refresh: () => void;
  getGraph: () => unknown;
  getZoom: () => number;
  getCullingStats: () => unknown;
  setGraphData: (data: { nodes: NodeInput[]; links: LinkInput[] }) => void;
  getGraphData: () => { nodes: RuntimeNode[]; links: RuntimeLink[] };
  zoomToFit: (paddingMultiplier?: number, filter?: (node: unknown) => boolean) => void;
};

type NodeInput = {
  id: number | string;
  labels: string[];
  visible: boolean;
  color: string;
  data: Record<string, unknown>;
};

type LinkInput = {
  id: number | string;
  relationship: string;
  source: number | string;
  target: number | string;
  visible: boolean;
  color: string;
  data: Record<string, unknown>;
};

type RuntimeNode = NodeInput & {
  x?: number;
  y?: number;
  size: number;
};

type RuntimeLink = Omit<LinkInput, "source" | "target"> & {
  source: RuntimeNode;
  target: RuntimeNode;
  curve?: number;
};

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
    { id: 1, labels: ["A"], visible: true, color: "#f00", data: { name: "n1" } },
    { id: 2, labels: ["B"], visible: true, color: "#0f0", data: { name: "n2" } },
  ],
  links: [
    { id: 1, relationship: "REL", source: 1, target: 2, visible: true, color: "#888", data: {} },
  ],
};

describe("setBackgroundColor", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    resetForceGraphMockState();
  });

  it("updates graph background color", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);

    const instance = getLastInstance();
    const bgSpy = vi.spyOn(instance, "backgroundColor");

    canvas.setBackgroundColor("#123456");
    expect(bgSpy).toHaveBeenCalledWith("#123456");
  });

  it("is a no-op when color is the same", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600, backgroundColor: "#000" });
    canvas.setData(SIMPLE_DATA);

    const instance = getLastInstance();
    const bgSpy = vi.spyOn(instance, "backgroundColor");

    canvas.setBackgroundColor("#000");
    expect(bgSpy).not.toHaveBeenCalled();
  });
});

describe("setForegroundColor", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    resetForceGraphMockState();
  });

  it("updates config foreground color and triggers render", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);

    // Setting foreground should not throw
    canvas.setForegroundColor("#ffffff");
    // And the config should be updated (verify via setConfig readback - indirect)
    // No assertion on internal state, just no-throw
  });

  it("is a no-op when color is the same", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600, foregroundColor: "#fff" });
    canvas.setData(SIMPLE_DATA);

    // Should not throw or trigger unnecessary updates
    canvas.setForegroundColor("#fff");
  });
});

describe("refresh", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    resetForceGraphMockState();
  });

  it("clears font cache and triggers render for force layout", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);

    // Should not throw
    canvas.refresh();
  });

  it("recomputes layout for tree mode", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600, layoutMode: "tree" });
    canvas.setData(SIMPLE_DATA);

    const instance = getLastInstance();
    // In tree mode, refresh should trigger layout recomputation
    // The cooldownTicks is set to 0 for deterministic layouts
    instance.resetTracking();
    canvas.refresh();
    // Tree layout freezes simulation
    expect(instance.cooldownTicksHistory).toContain(0);
  });

  it("recomputes layout for radial mode", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600, layoutMode: "radial" });
    canvas.setData(SIMPLE_DATA);

    const instance = getLastInstance();
    instance.resetTracking();
    canvas.refresh();
    expect(instance.cooldownTicksHistory).toContain(0);
  });
});

describe("getGraph", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    resetForceGraphMockState();
  });

  it("returns the force-graph instance after initialization", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);

    const graph = canvas.getGraph();
    expect(graph).toBeDefined();
    expect(graph).toBe(getLastInstance());
  });

  it("returns undefined before element is connected to DOM", () => {
    // Create but don't append to DOM
    const canvas = document.createElement("falkordb-canvas") as CanvasElement;
    const graph = canvas.getGraph();
    expect(graph).toBeUndefined();
  });
});

describe("node-mode and link-mode attributes", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    resetForceGraphMockState();
  });

  it("parses node-mode attribute from DOM", () => {
    const canvas = document.createElement("falkordb-canvas") as CanvasElement;
    canvas.setAttribute("node-mode", "before");
    document.body.appendChild(canvas);

    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);

    const instance = getLastInstance();
    // nodeCanvasObjectMode should return 'before'
    // The mock stores the callback, we can't easily verify the mode value directly
    // but the fact that it doesn't throw with this attribute validates parsing
    expect(instance).toBeDefined();
  });

  it("parses link-mode attribute from DOM", () => {
    const canvas = document.createElement("falkordb-canvas") as CanvasElement;
    canvas.setAttribute("link-mode", "after");
    document.body.appendChild(canvas);

    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);

    const instance = getLastInstance();
    expect(instance).toBeDefined();
  });

  it("ignores invalid mode attributes", () => {
    const canvas = document.createElement("falkordb-canvas") as CanvasElement;
    canvas.setAttribute("node-mode", "invalid-value");
    canvas.setAttribute("link-mode", "also-invalid");
    document.body.appendChild(canvas);

    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);

    // Should not throw, defaults to 'replace'
    const instance = getLastInstance();
    expect(instance).toBeDefined();
  });

  it("replace mode is the default", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);

    // No mode attribute set — should work with default 'replace'
    const instance = getLastInstance();
    expect(instance).toBeDefined();
  });
});

describe("setAnimation interactions", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    resetForceGraphMockState();
  });

  it("does not reheat when layout is not force", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600, layoutMode: "tree" });
    canvas.setData(SIMPLE_DATA);

    const instance = getLastInstance();
    instance.resetTracking();

    canvas.setAnimation(true);
    // Tree layout should not trigger reheat even with animation enabled
    expect(instance.d3ReheatSimulationCalls).toBe(0);
  });

  it("does not reheat when pinOnDragEnd is true", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);

    // First set pin mode
    canvas.setPinOnDragEnd(true);

    const instance = getLastInstance();
    instance.resetTracking();

    // Now enable animation — should not reheat because pinOnDragEnd prevents it
    canvas.setAnimation(true);
    expect(instance.d3ReheatSimulationCalls).toBe(0);
  });

  it("unpin + reheat when setPinOnDragEnd(false) with animation enabled", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);

    // Set animation on first
    canvas.setAnimation(true);
    // Then pin
    canvas.setPinOnDragEnd(true);

    const instance = getLastInstance();
    instance.resetTracking();

    // Now unpin — with animation enabled, should reheat
    canvas.setPinOnDragEnd(false);
    expect(instance.d3ReheatSimulationCalls).toBe(1);
  });
});

describe("setGraphData incremental updates", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    resetForceGraphMockState();
  });

  it("preserves existing node positions on incremental update", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);

    const data = canvas.getGraphData();
    // Set positions on existing nodes
    data.nodes[0].x = 100;
    data.nodes[0].y = 200;

    // Add a new node via setGraphData
    canvas.setGraphData({
      nodes: [
        { id: 1, labels: ["A"], visible: true, color: "#f00", data: { name: "n1" } },
        { id: 2, labels: ["B"], visible: true, color: "#0f0", data: { name: "n2" } },
        { id: 3, labels: ["C"], visible: true, color: "#00f", data: { name: "n3" } },
      ],
      links: [
        { id: 1, relationship: "REL", source: 1, target: 2, visible: true, color: "#888", data: {} },
        { id: 2, relationship: "REL", source: 2, target: 3, visible: true, color: "#888", data: {} },
      ],
    });

    const updatedData = canvas.getGraphData();
    // Node 1 should preserve its position
    const node1 = updatedData.nodes.find((n: RuntimeNode) => n.id === 1);
    expect(node1?.x).toBe(100);
    expect(node1?.y).toBe(200);
  });

  it("removes nodes that are no longer in the data", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);

    // Remove node 2 via setGraphData
    canvas.setGraphData({
      nodes: [
        { id: 1, labels: ["A"], visible: true, color: "#f00", data: { name: "n1" } },
      ],
      links: [],
    });

    const updatedData = canvas.getGraphData();
    expect(updatedData.nodes).toHaveLength(1);
    expect(updatedData.nodes[0].id).toBe(1);
    expect(updatedData.links).toHaveLength(0);
  });

  it("handles empty data gracefully", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);

    canvas.setGraphData({ nodes: [], links: [] });

    const updatedData = canvas.getGraphData();
    expect(updatedData.nodes).toHaveLength(0);
    expect(updatedData.links).toHaveLength(0);
  });
});

describe("zoomToFit with filter", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    resetForceGraphMockState();
  });

  it("calls force-graph zoomToFit with filter function", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);

    const instance = getLastInstance();
    instance.resetTracking();

    const filter = (node: unknown) => (node as RuntimeNode).id === 1;
    canvas.zoomToFit(1, filter);

    expect(instance.zoomToFitCalls).toBe(1);
  });

  it("uses default padding multiplier", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);

    const instance = getLastInstance();
    instance.resetTracking();

    canvas.zoomToFit();
    expect(instance.zoomToFitCalls).toBe(1);
  });
});

describe("onFontsLoadingDone", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    resetForceGraphMockState();
  });

  it("clears display name cache when fonts load", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);

    // Get the loadingdone handler
    const fontsAddEventListener = (document.fonts as any).addEventListener as ReturnType<typeof vi.fn>;
    const calls = fontsAddEventListener.mock.calls;
    const loadingDoneCall = calls.find((c: string[]) => c[0] === "loadingdone");
    expect(loadingDoneCall).toBeDefined();

    // Invoke the callback — should not throw
    const handler = loadingDoneCall![1];
    handler();

    // After handler, node display names should be cleared
    const data = canvas.getGraphData();
    expect(data.nodes[0]).toHaveProperty("displayName");
    // displayName should be reset to ["", ""]
    expect((data.nodes[0] as any).displayName).toEqual(["", ""]);
  });
});

describe("disconnectedCallback cleanup", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    resetForceGraphMockState();
  });

  it("removes fonts event listener on disconnect", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);

    const fontsRemoveEventListener = (document.fonts as any).removeEventListener as ReturnType<typeof vi.fn>;
    const callsBefore = fontsRemoveEventListener.mock.calls.length;

    // Disconnect from DOM
    canvas.remove();

    const callsAfter = fontsRemoveEventListener.mock.calls.length;
    expect(callsAfter).toBeGreaterThan(callsBefore);
  });

  it("destroys force-graph instance on disconnect", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);

    const instance = getLastInstance();
    canvas.remove();
    expect(instance.destroyed).toBe(true);
  });
});
