import FalkorDBCanvas from "./canvas";
import type React from "react";
import type { CanvasRenderMode } from "./canvas-types";

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
}

export type {
  ForceGraphConfig,
  GraphNode,
  GraphLink,
  GraphData,
  Node,
  Link,
  Data,
  TextPriority,
  ViewportState,
  ForceGraphInstance,
  Transform,
} from "./canvas-types";

// Utils
export {
  dataToGraphData,
  graphDataToData,
  getNodeDisplayText,
  getNodeDisplayKey,
  wrapTextForCircularNode,
} from "./canvas-utils";
