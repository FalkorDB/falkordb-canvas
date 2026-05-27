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

    const internalConfig = (canvas as any).config;
    expect(internalConfig.nodeStyle.fontSize).toBe(3);
    expect(internalConfig.nodeStyle.textFillRatio).toBe(0.7);
  });

  it("merges linkStyle partially — unset fields preserved", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setConfig({ linkStyle: { lineWidthSelected: 5 } });
    canvas.setConfig({ linkStyle: { lineWidthUnselected: 0.5 } });

    const internalConfig = (canvas as any).config;
    expect(internalConfig.linkStyle.lineWidthSelected).toBe(5);
    expect(internalConfig.linkStyle.lineWidthUnselected).toBe(0.5);
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

    // tooltipFontSize should still be 16 after second partial merge
    const style = canvas.shadowRoot?.querySelector("style");
    expect(style?.textContent).toContain("font-size: 16px");
  });

  it("merges layoutOptions sub-objects independently", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setConfig({ layoutOptions: { tree: { direction: "lr" } } });
    canvas.setConfig({ layoutOptions: { tree: { levelDistance: 100 } } });

    const internalConfig = (canvas as any).config;
    expect(internalConfig.layoutOptions.tree.direction).toBe("lr");
    expect(internalConfig.layoutOptions.tree.levelDistance).toBe(100);
  });

  it("top-level scalars are applied correctly", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600, linkStyle: { edgeGap: 5 } });
    canvas.setData(SIMPLE_DATA);
    const instance = getLastInstance();
    expect(instance.widthValue).toBe(800);
    expect(instance.heightValue).toBe(600);
    const internalConfig = (canvas as any).config;
    expect(internalConfig.linkStyle.edgeGap).toBe(5);
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
    const instance = getLastInstance();
    instance.resetTracking();

    canvas.setWidth(1200);
    expect(instance.widthValue).toBe(1200);
    expect(instance.widthHistory).toContain(1200);
  });

  it("setHeight updates the graph height", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);
    const instance = getLastInstance();
    instance.resetTracking();

    canvas.setHeight(900);
    expect(instance.heightValue).toBe(900);
    expect(instance.heightHistory).toContain(900);
  });

  it("setWidth is no-op when same value", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);
    const instance = getLastInstance();
    instance.resetTracking();

    canvas.setWidth(800);
    expect(instance.widthHistory).toHaveLength(0);
  });
});

describe("setDebug", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    resetForceGraphMockState();
  });

  it("enables and disables debug mode", () => {
    const canvas = createCanvas();
    canvas.setDebug(true);
    expect((canvas as any).debugEnabled).toBe(true);

    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);

    canvas.setDebug(false);
    expect((canvas as any).debugEnabled).toBe(false);
  });
});

describe("setConfig immediate application", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    resetForceGraphMockState();
  });

  // --- backgroundColor ---

  it("backgroundColor applies to force-graph instance immediately via setBackgroundColor", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);
    const instance = getLastInstance();
    instance.resetTracking();

    canvas.setBackgroundColor("#222");
    expect(instance.backgroundColorValue).toBe("#222");
    expect(instance.backgroundColorHistory).toContain("#222");
  });

  it("backgroundColor applies to force-graph immediately via setConfig", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);
    const instance = getLastInstance();
    instance.resetTracking();

    canvas.setConfig({ backgroundColor: "#333" });
    expect(instance.backgroundColorValue).toBe("#333");
    expect(instance.backgroundColorHistory).toContain("#333");
  });

  it("backgroundColor is no-op when same value", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600, backgroundColor: "#111" });
    canvas.setData(SIMPLE_DATA);
    const instance = getLastInstance();
    instance.resetTracking();

    canvas.setBackgroundColor("#111");
    expect(instance.backgroundColorHistory).toHaveLength(0);
  });

  // --- foregroundColor ---

  it("foregroundColor applies to node stroke rendering immediately via setForegroundColor", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);

    canvas.setForegroundColor("#ff0000");
    const instance = getLastInstance();
    const ctx = createMockCanvasContext();
    const node = (canvas as any).getGraphData().nodes[0];
    instance.callbacks.nodeCanvasObject?.(node, ctx as unknown as CanvasRenderingContext2D);
    expect(ctx.strokeStyle).toBe("#ff0000");
  });

  it("foregroundColor applies to node stroke rendering immediately via setConfig", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);

    canvas.setConfig({ foregroundColor: "#00ff00" });
    const instance = getLastInstance();
    const ctx = createMockCanvasContext();
    const node = (canvas as any).getGraphData().nodes[0];
    instance.callbacks.nodeCanvasObject?.(node, ctx as unknown as CanvasRenderingContext2D);
    expect(ctx.strokeStyle).toBe("#00ff00");
  });

  it("foregroundColor is no-op when same value", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600, foregroundColor: "#1A1A1A" });
    canvas.setData(SIMPLE_DATA);
    const instance = getLastInstance();
    const spy = vi.fn();
    instance.callbacks.nodeCanvasObject = spy;

    canvas.setForegroundColor("#1A1A1A");
    expect(spy).not.toHaveBeenCalled();
  });

  // --- tooltip styles (both colors) ---

  it("tooltip styles update immediately with both colors via setConfig", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);

    canvas.setConfig({ foregroundColor: "#abcdef", backgroundColor: "#123456" });
    const style = canvas.shadowRoot?.querySelector("style");
    expect(style?.textContent).toContain("#abcdef");
    expect(style?.textContent).toContain("#123456");
  });

  it("tooltip styles update when interaction config changes", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);

    canvas.setConfig({ interaction: { tooltipFontSize: 20 } });
    const style = canvas.shadowRoot?.querySelector("style");
    expect(style?.textContent).toContain("font-size: 20px");
  });

  it("tooltip padding and border-radius apply via interaction config", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);

    canvas.setConfig({ interaction: { tooltipPadding: "8px 16px", tooltipBorderRadius: "8px" } });
    const style = canvas.shadowRoot?.querySelector("style");
    expect(style?.textContent).toContain("padding: 8px 16px");
    expect(style?.textContent).toContain("border-radius: 8px");
  });

  it("zoomToFitDelay is used when calling zoomToFit after setData", () => {
    vi.useFakeTimers();
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600, interaction: { zoomToFitDelay: 200 } });
    canvas.setData(SIMPLE_DATA);
    const instance = getLastInstance();
    instance.resetTracking();

    // zoomToFit hasn't fired yet
    expect(instance.zoomToFitCalls).toBe(0);

    // Advance past the delay
    vi.advanceTimersByTime(200);
    expect(instance.zoomToFitCalls).toBeGreaterThan(0);
    vi.useRealTimers();
  });

  // --- width ---

  it("width applies to force-graph instance immediately via setWidth", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);
    const instance = getLastInstance();
    instance.resetTracking();

    canvas.setWidth(1200);
    expect(instance.widthValue).toBe(1200);
    expect(instance.widthHistory).toContain(1200);
  });

  it("width is no-op when same value via setWidth", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);
    const instance = getLastInstance();
    instance.resetTracking();

    canvas.setWidth(800);
    expect(instance.widthHistory).toHaveLength(0);
  });

  // --- height ---

  it("height applies to force-graph instance immediately via setHeight", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);
    const instance = getLastInstance();
    instance.resetTracking();

    canvas.setHeight(900);
    expect(instance.heightValue).toBe(900);
    expect(instance.heightHistory).toContain(900);
  });

  it("height is no-op when same value via setHeight", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);
    const instance = getLastInstance();
    instance.resetTracking();

    canvas.setHeight(600);
    expect(instance.heightHistory).toHaveLength(0);
  });

  // --- animation ---

  it("animation=false freezes simulation immediately (cooldownTicks=0)", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600, animation: true });
    canvas.setData(SIMPLE_DATA);
    const instance = getLastInstance();
    instance.resetTracking();

    canvas.setAnimation(false);
    expect(instance.cooldownTicksValue).toBe(0);
    expect(instance.cooldownTicksHistory).toContain(0);
  });

  it("animation=true reheats simulation immediately (cooldownTicks=Infinity)", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600, animation: false });
    canvas.setData(SIMPLE_DATA);
    const instance = getLastInstance();
    instance.resetTracking();

    canvas.setAnimation(true);
    expect(instance.cooldownTicksValue).toBe(Infinity);
    expect(instance.cooldownTicksHistory).toContain(Infinity);
    expect(instance.d3ReheatSimulationCalls).toBeGreaterThan(0);
  });

  it("animation is no-op when same value", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600, animation: true });
    canvas.setData(SIMPLE_DATA);
    const instance = getLastInstance();
    instance.resetTracking();

    canvas.setAnimation(true);
    expect(instance.cooldownTicksHistory).toHaveLength(0);
  });

  // --- pinOnDragEnd ---

  it("pinOnDragEnd=true freezes simulation immediately", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600, animation: true });
    canvas.setData(SIMPLE_DATA);
    const instance = getLastInstance();
    instance.resetTracking();

    canvas.setPinOnDragEnd(true);
    expect(instance.cooldownTicksValue).toBe(0);
  });

  it("pinOnDragEnd=false with animation reheats simulation immediately", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600, animation: true });
    canvas.setData(SIMPLE_DATA);
    canvas.setPinOnDragEnd(true);
    const instance = getLastInstance();
    instance.resetTracking();

    canvas.setPinOnDragEnd(false);
    expect(instance.cooldownTicksValue).toBe(Infinity);
    expect(instance.d3ReheatSimulationCalls).toBeGreaterThan(0);
  });

  // --- simulation config ---

  it("simulation config applies forces immediately via setConfig", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);
    const instance = getLastInstance();

    canvas.setConfig({ simulation: { chargeStrength: -500 } });
    const chargeForce = instance.forceMap.get("charge") as any;
    expect(chargeForce?.strengthValue).toBe(-500);
  });

  it("simulation velocity decay applies immediately via setConfig", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);
    const instance = getLastInstance();

    canvas.setConfig({ simulation: { velocityDecay: 0.6 } });
    const simForce = instance.forceMap.get("simulation") as any;
    expect(simForce?.velocityDecayValue).toBe(0.6);
  });

  // --- nodeStyle ---

  it("nodeStyle change invalidates display name cache immediately", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);

    const data = (canvas as any).getGraphData();
    data.nodes[0].displayName = ["cached", "value"];
    data.nodes[1].displayName = ["also cached", ""];

    canvas.setConfig({ nodeStyle: { fontSize: 8 } });
    expect(data.nodes[0].displayName).toEqual(["", ""]);
    expect(data.nodes[1].displayName).toEqual(["", ""]);
  });

  it("nodeStyle fontSize change clears font size cache immediately", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600, nodeStyle: { fontSize: 3 } });
    canvas.setData(SIMPLE_DATA);

    // Access internal font size cache and seed it
    const internalCanvas = canvas as any;
    internalCanvas.nodeDisplayFontSize.set("test-node", 12);
    expect(internalCanvas.nodeDisplayFontSize.size).toBe(1);

    // Changing nodeStyle should clear the font size cache
    canvas.setConfig({ nodeStyle: { fontSize: 6 } });
    expect(internalCanvas.nodeDisplayFontSize.size).toBe(0);
  });

  // --- linkStyle ---

  it("linkStyle change invalidates link label cache immediately", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);

    // Access internal cache and add an entry
    const internalCanvas = canvas as any;
    internalCanvas.relationshipsTextCache.set("test-key", { width: 50, height: 10 });
    expect(internalCanvas.relationshipsTextCache.size).toBe(1);

    canvas.setConfig({ linkStyle: { lineWidthSelected: 4 } });
    expect(internalCanvas.relationshipsTextCache.size).toBe(0);
  });

  // --- showPropertyKeyPrefix ---

  it("showPropertyKeyPrefix change invalidates display name cache immediately", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600, showPropertyKeyPrefix: false });
    canvas.setData(SIMPLE_DATA);

    const data = (canvas as any).getGraphData();
    data.nodes[0].displayName = ["cached", ""];

    canvas.setConfig({ showPropertyKeyPrefix: true });
    expect(data.nodes[0].displayName).toEqual(["", ""]);
  });

  // --- captionsKeys ---

  it("captionsKeys change invalidates display name cache immediately", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);

    const data = (canvas as any).getGraphData();
    data.nodes[0].displayName = ["cached", ""];

    canvas.setConfig({ captionsKeys: [["name", true]] });
    expect(data.nodes[0].displayName).toEqual(["", ""]);
  });

  // --- layout ---

  it("setLayout applies layout to force-graph immediately", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);
    const instance = getLastInstance();
    instance.resetTracking();

    canvas.setLayout("tree");
    // Tree layout pins nodes and sets cooldownTicks(0)
    expect(instance.cooldownTicksValue).toBe(0);
  });

  it("setLayout fires onLayoutChange callback immediately", () => {
    const canvas = createCanvas();
    let reported: string | undefined;
    canvas.setConfig({
      width: 800, height: 600,
      eventHandlers: { onLayoutChange: (mode) => { reported = mode; } },
    });
    canvas.setData(SIMPLE_DATA);

    canvas.setLayout("radial");
    expect(reported).toBe("radial");
  });

  // --- largeGraph ---

  it("largeGraph.enabled applies culling immediately via setConfig", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);

    canvas.setConfig({ largeGraph: { enabled: true, skipLabelsAtLowZoom: true, lowZoomThreshold: 0.5 } });
    const stats = canvas.getCullingStats();
    expect(stats.enabled).toBe(true);
  });

  it("largeGraph disabled clears culling bounds immediately", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600, largeGraph: { enabled: true, skipLabelsAtLowZoom: true, lowZoomThreshold: 0.5 } });
    canvas.setData(SIMPLE_DATA);

    canvas.setConfig({ largeGraph: { enabled: false } });
    const stats = canvas.getCullingStats();
    expect(stats.enabled).toBe(false);
    expect(stats.bounds).toBeNull();
  });

  // --- eventHandlers ---

  it("eventHandlers update callbacks immediately via setConfig", () => {
    const canvas = createCanvas();
    let clicked = false;
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);

    canvas.setConfig({ eventHandlers: { onNodeClick: () => { clicked = true; } } });
    const instance = getLastInstance();
    instance.callbacks.onNodeClick?.({}, new MouseEvent("click"));
    expect(clicked).toBe(true);
  });

  // --- isNodeSelected / isLinkSelected ---

  it("isNodeSelected applies to rendering immediately via setConfig", () => {
    const canvas = createCanvas();
    canvas.setConfig({ width: 800, height: 600 });
    canvas.setData(SIMPLE_DATA);
    const instance = getLastInstance();

    // Set a node as selected - should get thicker stroke
    canvas.setConfig({ isNodeSelected: (node: any) => node.id === 1 });

    const ctx = createMockCanvasContext();
    const node = (canvas as any).getGraphData().nodes[0]; // id=1
    instance.callbacks.nodeCanvasObject?.(node, ctx as unknown as CanvasRenderingContext2D);
    const selectedLineWidth = ctx.lineWidth;

    // Render unselected node
    const ctx2 = createMockCanvasContext();
    const node2 = (canvas as any).getGraphData().nodes[1]; // id=2
    instance.callbacks.nodeCanvasObject?.(node2, ctx2 as unknown as CanvasRenderingContext2D);

    expect(selectedLineWidth).toBeGreaterThan(ctx2.lineWidth);
  });
});

function createMockCanvasContext() {
  return {
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 0,
    font: "",
    textAlign: "",
    textBaseline: "",
    globalAlpha: 1,
    beginPath: vi.fn(),
    arc: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 10 })),
    save: vi.fn(),
    restore: vi.fn(),
    setLineDash: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    closePath: vi.fn(),
  };
}
