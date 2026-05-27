/**
 * Shared test type definitions that use the actual source types
 * so TypeScript catches type mismatches at compile time.
 */
import type { ForceGraphConfig, Data, GraphData, GraphNode, GraphLink, ViewportState, LayoutMode, LayoutOptions } from "../src/canvas-types";
import type { WorldBounds } from "../src/canvas";

/**
 * Base canvas element type matching the public API of FalkorDBCanvas.
 * Tests should use this (or a subset via Pick) instead of ad-hoc Record types.
 */
export type CanvasTestElement = HTMLElement & {
  setConfig: (config: Partial<ForceGraphConfig>) => void;
  setData: (data: Data) => void;
  setGraphData: (data: Data) => void;
  getData: () => Data;
  getGraphData: () => GraphData;
  setWidth: (w: number) => void;
  setHeight: (h: number) => void;
  setBackgroundColor: (color: string) => void;
  setForegroundColor: (color: string) => void;
  setAnimation: (enabled: boolean) => void;
  setPinOnDragEnd: (pin: boolean) => void;
  setLayout: (mode: LayoutMode) => void;
  setLayoutOptions: (options: Partial<LayoutOptions>) => void;
  setDebug: (enabled: boolean) => void;
  refresh: () => void;
  getGraph: () => unknown;
  getZoom: () => number;
  zoom: (zoomLevel: number) => unknown;
  zoomToFit: (paddingMultiplier?: number, filter?: (node: GraphNode) => boolean) => void;
  getViewport: () => ViewportState;
  setViewport: (viewport: ViewportState) => void;
  getCullingStats: () => CullingStats;
};

export interface CullingStats {
  enabled: boolean;
  bounds: WorldBounds | null;
  zoom: number;
  visibleNodes: number;
  totalNodes: number;
  visibleLinks: number;
  totalLinks: number;
}

// Re-export source types for convenience
export type { ForceGraphConfig, Data, GraphData, GraphNode, GraphLink, ViewportState, LayoutMode, LayoutOptions, WorldBounds };
