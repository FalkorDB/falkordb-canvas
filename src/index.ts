import FalkorDBCanvas from "./canvas.js";
import type React from "react";
import type {
  CanvasRenderMode,
  LayoutMode,
  LayoutDirection,
  HierarchyDirection,
  RadialDirection,
  LayoutOptions,
  HierarchyLayoutOptions,
  RadialLayoutOptions,
  ForceLayoutOptions,
  NodeStyleConfig,
  LinkStyleConfig,
  SimulationConfig,
  InteractionConfig,
  EventHandlers,
} from "./canvas-types.js";

declare global {
  interface HTMLElementTagNameMap {
    "falkordb-canvas": FalkorDBCanvas;
  }

  namespace JSX {
    interface IntrinsicElements {
      "falkordb-canvas": React.DetailedHTMLProps<
        React.HTMLAttributes<FalkorDBCanvas> & {
          'node-mode'?: CanvasRenderMode;
          'link-mode'?: CanvasRenderMode;
        },
        FalkorDBCanvas
      >;
    }
  }
}

// Main canvas class
export { FalkorDBCanvas as default, FalkorDBCanvas };

// Types
export type {
  CanvasRenderMode,
  LayoutMode,
  LayoutDirection,
  HierarchyDirection,
  RadialDirection,
  LayoutOptions,
  HierarchyLayoutOptions,
  RadialLayoutOptions,
  ForceLayoutOptions,
  NodeStyleConfig,
  LinkStyleConfig,
  SimulationConfig,
  InteractionConfig,
  EventHandlers,
}

export type {
  ForceGraphConfig,
  LargeGraphConfig,
  GraphNode,
  GraphLink,
  GraphData,
  Node,
  Link,
  Data,
  ViewportState,
  ForceGraphInstance,
  Transform,
} from "./canvas-types.js";

export type { WorldBounds } from "./canvas.js";

// Utils
export {
  NODE_SIZE,
  dataToGraphData,
  graphDataToData,
  getContrastTextColor,
  getNodeDisplayText,
  getNodeDisplayKey,
  wrapTextForCircularNode,
} from "./canvas-utils.js";

// Layouts
export {
  getDagMode,
  isForceLayout,
  getDagLevelDistance,
  getChargeStrength,
  pinAllNodes,
  unpinAllNodes,
} from "./layouts.js";
