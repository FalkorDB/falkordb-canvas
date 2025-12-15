import FalkorDBCanvas from "./falkordb-canvas.js";

declare global {
  interface HTMLElementTagNameMap {
    "falkordb-canvas": FalkorDBCanvas;
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
  ForceGraphInstance,
} from "./falkordb-canvas-types.js";

// Utils
export {
  dataToGraphData,
  graphDataToData,
  getNodeDisplayText,
  wrapTextForCircularNode,
} from "./falkordb-canvas-utils.js";
