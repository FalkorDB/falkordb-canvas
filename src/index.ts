import FalkorDBCanvas from "./canvas.js";
import type React from "react";

declare global {
  interface HTMLElementTagNameMap {
    "falkordb-canvas": FalkorDBCanvas;
  }

  namespace JSX {
    interface IntrinsicElements {
      "falkordb-canvas": React.DetailedHTMLProps<
        React.HTMLAttributes<FalkorDBCanvas>,
        FalkorDBCanvas
      >;
    }
  }
}

// Main canvas class
export { FalkorDBCanvas as default, FalkorDBCanvas };

// Types
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
} from "./canvas-types.js";

// Utils
export {
  dataToGraphData,
  graphDataToData,
  getNodeDisplayText,
  getNodeDisplayKey,
  wrapTextForCircularNode,
} from "./canvas-utils.js";
