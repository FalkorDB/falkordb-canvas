import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  forceGraphMockState,
  resetForceGraphMockState,
} from "./mocks/force-graph";

vi.mock("force-graph", async () => import("./mocks/force-graph"));

import "../src/canvas";

type CanvasTestElement = HTMLElement & {
  setConfig: (config: Record<string, unknown>) => void;
  setData: (data: GraphDataInput) => void;
  getGraphData: () => GraphDataRuntime;
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

type GraphDataInput = {
  nodes: NodeInput[];
  links: LinkInput[];
};

type RuntimeNode = NodeInput & {
  x?: number;
  y?: number;
  layoutTargetX?: number;
  layoutTargetY?: number;
  fx?: number;
  fy?: number;
};

type GraphDataRuntime = {
  nodes: RuntimeNode[];
  links: unknown[];
};

const NON_FORCE_LAYOUT_MODES = [
  "tree",
  "flow",
  "radial-tree",
  "concentric",
  "components",
  "arc",
] as const;

const NON_FORCE_LAYOUT_COOLDOWN = 120;
const NON_FORCE_DRAG_COOLDOWN = 90;

const BASE_DATA: GraphDataInput = {
  nodes: [
    { id: 1, labels: ["Person"], visible: true, color: "#FF6B6B", data: { name: "Alice" } },
    { id: 2, labels: ["Person"], visible: true, color: "#4ECDC4", data: { name: "Bob" } },
    { id: 3, labels: ["Person"], visible: true, color: "#45B7D1", data: { name: "Carol" } },
  ],
  links: [
    { id: 1, relationship: "KNOWS", source: 1, target: 2, visible: true, color: "#888", data: {} },
    { id: 2, relationship: "KNOWS", source: 2, target: 3, visible: true, color: "#777", data: {} },
  ],
};

const EXPANDED_DATA: GraphDataInput = {
  nodes: [
    ...BASE_DATA.nodes,
    { id: 4, labels: ["Person"], visible: true, color: "#FFA07A", data: { name: "Dina" } },
  ],
  links: [
    ...BASE_DATA.links,
    { id: 3, relationship: "KNOWS", source: 2, target: 4, visible: true, color: "#666", data: {} },
  ],
};

const COLLAPSED_DATA: GraphDataInput = {
  nodes: [
    { id: 1, labels: ["Person"], visible: true, color: "#FF6B6B", data: { name: "Alice" } },
    { id: 3, labels: ["Person"], visible: true, color: "#45B7D1", data: { name: "Carol" } },
    { id: 4, labels: ["Person"], visible: true, color: "#FFA07A", data: { name: "Dina" } },
  ],
  links: [
    { id: 4, relationship: "KNOWS", source: 1, target: 3, visible: true, color: "#888", data: {} },
    { id: 5, relationship: "KNOWS", source: 3, target: 4, visible: true, color: "#666", data: {} },
  ],
};

function cloneData(data: GraphDataInput): GraphDataInput {
  return JSON.parse(JSON.stringify(data)) as GraphDataInput;
}

function getLastGraphMock() {
  const instance = forceGraphMockState.lastInstance;
  if (!instance) {
    throw new Error("force-graph mock instance was not created");
  }
  return instance;
}

function getLayoutConfig(layoutMode: (typeof NON_FORCE_LAYOUT_MODES)[number]) {
  if (layoutMode === "tree") {
    return {
      layoutMode,
      layoutOptions: {
        tree: {
          rootNodeId: 1,
          direction: "TB",
        },
      },
    };
  }

  if (layoutMode === "flow") {
    return {
      layoutMode,
      layoutOptions: {
        flow: {
          direction: "LR",
        },
      },
    };
  }

  if (layoutMode === "radial-tree") {
    return {
      layoutMode,
      layoutOptions: {
        radialTree: {
          rootNodeId: 1,
          direction: "TB",
        },
      },
    };
  }

  if (layoutMode === "concentric") {
    return {
      layoutMode,
      layoutOptions: {
        concentric: {
          metric: "degree",
          rootNodeId: 1,
        },
      },
    };
  }

  if (layoutMode === "components") {
    return {
      layoutMode,
      layoutOptions: {
        components: {
          innerLayout: "tree",
        },
      },
    };
  }

  return {
    layoutMode,
    layoutOptions: {
      arc: {
        direction: "LR",
        orderBy: "id",
      },
    },
  };
}

function createCanvasElement(layoutMode: (typeof NON_FORCE_LAYOUT_MODES)[number]) {
  const element = document.createElement("falkordb-canvas") as CanvasTestElement;
  document.body.appendChild(element);
  element.setConfig(getLayoutConfig(layoutMode));
  return element;
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
      width: 1000,
      height: 600,
      top: 0,
      left: 0,
      right: 1000,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
    configurable: true,
  });
});

afterEach(() => {
  document.body.innerHTML = "";
  resetForceGraphMockState();
});

describe.each(NON_FORCE_LAYOUT_MODES)(
  "layout transition animations in %s mode",
  (layoutMode) => {
    it("animates expand and collapse updates", () => {
      const canvas = createCanvasElement(layoutMode);
      const graphMock = getLastGraphMock();

      canvas.setData(cloneData(BASE_DATA));
      graphMock.resetTracking();

      canvas.setData(cloneData(EXPANDED_DATA));

      expect(graphMock.d3ReheatSimulationCalls).toBe(1);
      expect(graphMock.cooldownTicksValue).toBe(NON_FORCE_LAYOUT_COOLDOWN);
      expect(graphMock.cooldownTicksHistory).toContain(NON_FORCE_LAYOUT_COOLDOWN);
      expect(graphMock.forceMap.get("layoutTargetX")).toBeTruthy();
      expect(graphMock.forceMap.get("layoutTargetY")).toBeTruthy();

      const expandedGraph = canvas.getGraphData();
      expect(
        expandedGraph.nodes.every(
          (node) => node.layoutTargetX !== undefined && node.layoutTargetY !== undefined
        )
      ).toBe(true);

      graphMock.resetTracking();
      canvas.setData(cloneData(COLLAPSED_DATA));

      expect(graphMock.d3ReheatSimulationCalls).toBe(1);
      expect(graphMock.cooldownTicksValue).toBe(NON_FORCE_LAYOUT_COOLDOWN);
      expect(graphMock.cooldownTicksHistory).toContain(NON_FORCE_LAYOUT_COOLDOWN);

      const collapsedGraph = canvas.getGraphData();
      expect(
        collapsedGraph.nodes.every(
          (node) => node.layoutTargetX !== undefined && node.layoutTargetY !== undefined
        )
      ).toBe(true);
    });

    it("animates settle behavior during node drag", () => {
      const canvas = createCanvasElement(layoutMode);
      const graphMock = getLastGraphMock();

      canvas.setData(cloneData(EXPANDED_DATA));
      graphMock.resetTracking();

      const firstNode = canvas.getGraphData().nodes[0];
      firstNode.x = (firstNode.x ?? 0) + 48;
      firstNode.y = (firstNode.y ?? 0) + 26;
      graphMock.callbacks.onNodeDrag?.(firstNode, { x: 48, y: 26 });

      expect(graphMock.d3ReheatSimulationCalls).toBe(1);
      expect(graphMock.cooldownTicksValue).toBe(NON_FORCE_DRAG_COOLDOWN);
      expect(firstNode.layoutTargetX).toBe(firstNode.x);
      expect(firstNode.layoutTargetY).toBe(firstNode.y);

      firstNode.x = (firstNode.x ?? 0) + 12;
      firstNode.y = (firstNode.y ?? 0) + 6;
      graphMock.callbacks.onNodeDragEnd?.(firstNode, { x: 60, y: 32 });

      expect(graphMock.d3ReheatSimulationCalls).toBe(2);
      expect(graphMock.cooldownTicksValue).toBe(NON_FORCE_DRAG_COOLDOWN);
      expect(firstNode.layoutTargetX).toBe(firstNode.x);
      expect(firstNode.layoutTargetY).toBe(firstNode.y);
      expect(firstNode.fx).toBeUndefined();
      expect(firstNode.fy).toBeUndefined();
    });
  }
);
