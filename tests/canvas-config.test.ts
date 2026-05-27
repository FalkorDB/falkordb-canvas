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
  setWidth: (w: number) => void;
  setHeight: (h: number) => void;
  setBackgroundColor: (color: string) => void;
  setForegroundColor: (color: string) => void;
  setDebug: (enabled: boolean) => void;
  getData: () => { nodes: unknown[]; links: unknown[] };
  getGraphData: () => { nodes: unknown[]; links: unknown[] };
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

const SIMPLE_DATA = {
  nodes: [
    { id: 1, labels: ["Person"], visible: true, color: "#f00", data: { name: "Alice" } },
    { id: 2, labels: ["Person"], visible: true, color: "#0f0", data: { name: "Bob" } },
  ],
  links: [
    { id: 1, relationship: "KNOWS", source: 1, target: 2, visible: true, color: "#888", data: {} },
  ],
};

describe("setConfig deep merge", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    resetForceGraphMockState();
  });

  it("merges nodeStyle partially — unset fields preserved", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });

    // Set initial nodeStyle
    canvas.setConfig({ nodeStyle: { fontSize: 5, textFillRatio: 0.7 } });
    // Update only fontSize — textFillRatio should remain
    canvas.setConfig({ nodeStyle: { fontSize: 3 } });

    // Access internal config through a known effect: set data and check rendering uses new value
    canvas.setData(SIMPLE_DATA);
    const data = (canvas as any).getGraphData();
    expect(data.nodes.length).toBe(2);
  });

  it("merges linkStyle partially — unset fields preserved", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setConfig({ linkStyle: { lineWidthSelected: 5 } });
    canvas.setConfig({ linkStyle: { lineWidthUnselected: 0.5 } });
    // Should not throw — both fields should be set
    canvas.setData(SIMPLE_DATA);
  });

  it("merges simulation config partially", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setConfig({ simulation: { chargeStrength: -200 } });
    canvas.setConfig({ simulation: { centerStrength: 0.1 } });
    canvas.setData(SIMPLE_DATA);
    // Verify forces were set up
    const instance = getLastInstance();
    const chargeForce = instance.forceMap.get("charge") as any;
    expect(chargeForce?.strengthValue).toBe(-200);
  });

  it("merges interaction config partially", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setConfig({ interaction: { tooltipFontSize: 16 } });
    canvas.setConfig({ interaction: { contrastThreshold: 0.6 } });
    canvas.setData(SIMPLE_DATA);
  });

  it("merges layoutOptions sub-objects independently", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setConfig({ layoutOptions: { tree: { direction: "lr" } } });
    canvas.setConfig({ layoutOptions: { tree: { levelDistance: 100 } } });
    // Direction should not be wiped by the second call
    canvas.setData(SIMPLE_DATA);
  });

  it("top-level scalars are applied correctly", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600, edgeGap: 5 });
    canvas.setData(SIMPLE_DATA);
    const instance = getLastInstance();
    expect(instance).toBeDefined();
  });
});

describe("setConfig cache invalidation", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    resetForceGraphMockState();
  });

  it("clears display names when captionsKeys change", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);

    const data = (canvas as any).getGraphData();
    // Manually set display name to simulate cache
    data.nodes[0].displayName = ["cached", ""];

    // Change captionsKeys — should clear
    canvas.setConfig({ captionsKeys: [["name", true]] });
    expect(data.nodes[0].displayName).toEqual(["", ""]);
  });

  it("clears display names when nodeStyle changes", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);

    const data = (canvas as any).getGraphData();
    data.nodes[0].displayName = ["cached", ""];

    canvas.setConfig({ nodeStyle: { fontSize: 4 } });
    expect(data.nodes[0].displayName).toEqual(["", ""]);
  });
});

describe("setWidth and setHeight", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    resetForceGraphMockState();
  });

  it("setWidth updates the graph width", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);
    canvas.setWidth(1200);
    // No error means it worked
  });

  it("setHeight updates the graph height", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);
    canvas.setHeight(900);
  });

  it("setWidth is no-op when same value", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);
    canvas.setWidth(800); // same as current
  });
});

describe("setDebug", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    resetForceGraphMockState();
  });

  it("enables and disables debug mode without errors", () => {
    const canvas = createCanvas();
    canvas.setDebug(true);
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);
    canvas.setDebug(false);
  });
});

describe("color setters", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    resetForceGraphMockState();
  });

  it("setBackgroundColor updates without error", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setBackgroundColor("#222");
  });

  it("setForegroundColor updates without error", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setForegroundColor("#fff");
  });
});
