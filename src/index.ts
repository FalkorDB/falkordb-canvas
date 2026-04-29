import FalkorDBCanvas from "./canvas.js";
import type React from "react";
import type {
  ArcDirection,
  ArcLayoutOptions,
  ComponentsInnerLayout,
  ComponentsLayoutOptions,
  ComponentsSortMode,
  ConcentricLayoutOptions,
  ConcentricMetric,
  CanvasRenderMode,
  FlowLayoutOptions,
  RadialTreeLayoutOptions,
  LayoutDirection,
  LayoutMode,
  LayoutOptions,
  RingSortMode,
  TreeLayoutOptions,
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
  ArcDirection,
  CanvasRenderMode,
  LayoutMode,
  LayoutDirection,
  LayoutOptions,
  TreeLayoutOptions,
  FlowLayoutOptions,
  RadialTreeLayoutOptions,
  ConcentricLayoutOptions,
  ComponentsLayoutOptions,
  ArcLayoutOptions,
  ConcentricMetric,
  RingSortMode,
  ComponentsInnerLayout,
  ComponentsSortMode,
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
