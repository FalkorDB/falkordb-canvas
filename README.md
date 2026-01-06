# FalkorDB Canvas

A standalone web component for visualizing FalkorDB graphs using force-directed layouts.

## Features

- 🎨 **Force-directed graph layout** - Automatic positioning using D3 force simulation with smart collision detection
- 🎯 **Interactive** - Click, hover, right-click interactions on nodes, links, and background
- 🌓 **Theme support** - Light and dark mode compatible with customizable colors
- ⚡ **Performance** - Optimized rendering with HTML5 canvas
- 💫 **Loading states** - Built-in skeleton loading with pulse animation
- 🎨 **Customizable** - Colors, sizes, behaviors, and custom rendering functions
- 📦 **TypeScript support** - Full type definitions included
- 🔧 **Web Component** - Works with any framework or vanilla JavaScript
- 🎮 **Viewport control** - Zoom, pan, and auto-fit functionality
- 🔄 **Smart layout** - Adaptive force algorithm based on node connectivity

## Installation

```bash
npm install @falkordb/canvas
```

## Quick Start

### Vanilla JavaScript

```html
<!DOCTYPE html>
<html>
<head>
  <title>FalkorDB Canvas Example</title>
</head>
<body>
  <falkordb-canvas id="graph" style="width: 100%; height: 600px;"></falkordb-canvas>
  
  <script type="module">
    import '@falkordb/canvas';
    
    const canvas = document.getElementById('graph');
    
    // Set data
    canvas.setData({
      nodes: [
        { id: 1, labels: ['Person'], color: '#FF6B6B', visible: true, data: { name: 'Alice' } },
        { id: 2, labels: ['Person'], color: '#4ECDC4', visible: true, data: { name: 'Bob' } }
      ],
      links: [
        { id: 1, relationship: 'KNOWS', color: '#999', source: 1, target: 2, visible: true, data: {} }
      ]
    });
    
    // Configure
    canvas.setConfig({
      width: 800,
      height: 600,
      backgroundColor: '#FFFFFF',
      foregroundColor: '#1A1A1A',
      onNodeClick: (node) => console.log('Clicked:', node)
    });
  </script>
</body>
</html>
```

### React / TypeScript

```tsx
import { useEffect, useRef } from 'react';
import '@falkordb/canvas';
import type { FalkorDBCanvas, Data, GraphNode } from '@falkordb/canvas';

function GraphVisualization() {
  const canvasRef = useRef<FalkorDBCanvas>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const data: Data = {
      nodes: [
        { id: 1, labels: ['Person'], color: '#FF6B6B', visible: true, data: { name: 'Alice' } },
        { id: 2, labels: ['Person'], color: '#4ECDC4', visible: true, data: { name: 'Bob' } }
      ],
      links: [
        { id: 1, relationship: 'KNOWS', color: '#999', source: 1, target: 2, visible: true, data: {} }
      ]
    };

    canvas.setData(data);
    canvas.setConfig({
      onNodeClick: (node: GraphNode) => {
        console.log('Clicked node:', node);
      }
    });
  }, []);

  return (
    <falkordb-canvas 
      ref={canvasRef}
      style={{ width: '100%', height: '600px' }}
    />
  );
}
```

## API

### Methods

| Method | Default | Description |
|--------|---------|-------------|
| **setData**(*data*) | | Set the graph data (nodes and links). Automatically triggers layout simulation and loading states. |
| **getData**() | | Get the current graph data in the simplified format. |
| **setGraphData**(*data*) | | Set graph data in the internal format (with computed properties). Use this for better performance when you already have GraphData format. |
| **getGraphData**() | | Get the current graph data in the internal format with all computed properties (x, y, vx, vy, etc.). |
| **setConfig**(*config*) | | Configure the graph visualization and behavior. Accepts a `ForceGraphConfig` object with styling, callbacks, and rendering options. |
| **setWidth**(*width*) | | Set canvas width in pixels. |
| **setHeight**(*height*) | | Set canvas height in pixels. |
| **setBackgroundColor**(*color*) | | Set background color (hex or CSS color). |
| **setForegroundColor**(*color*) | | Set foreground color for text and borders. |
| **setIsLoading**(*isLoading*) | | Show/hide loading skeleton. |
| **setCooldownTicks**(*ticks*) | | Set simulation ticks before stopping (undefined = infinite). |
| **getViewport**() | | Get current zoom and center position as `ViewportState`. |
| **setViewport**(*viewport*) | | Restore a previously saved viewport state. |
| **getZoom**() | | Get current zoom level. |
| **zoom**(*zoomLevel*) | | Set zoom level. |
| **zoomToFit**(*paddingMultiplier*, *filter*) | `1.0`, `undefined` | Auto-fit all visible nodes in view. Optional padding multiplier and node filter function. |
| **getGraph**() | | Get the underlying force-graph instance for advanced control. |

### Configuration Options

| Option | Type | Description |
|--------|------|-------------|
| `width` | `number` | Canvas width in pixels |
| `height` | `number` | Canvas height in pixels |
| `backgroundColor` | `string` | Background color (hex or CSS color) |
| `foregroundColor` | `string` | Foreground color for borders and text |
| `cooldownTicks` | `number \| undefined` | Number of simulation ticks before stopping (undefined = infinite) |
| `cooldownTime` | `number` | Time in ms for each simulation tick (default: 1000) |
| `autoStopOnSettle` | `boolean` | Automatically stop simulation when settled (default: true) |
| `isLoading` | `boolean` | Show/hide loading skeleton |
| `onNodeClick` | `(node: GraphNode, event: MouseEvent) => void` | Callback when a node is clicked |
| `onNodeRightClick` | `(node: GraphNode, event: MouseEvent) => void` | Callback when a node is right-clicked |
| `onLinkClick` | `(link: GraphLink, event: MouseEvent) => void` | Callback when a link is clicked |
| `onLinkRightClick` | `(link: GraphLink, event: MouseEvent) => void` | Callback when a link is right-clicked |
| `onNodeHover` | `(node: GraphNode \| null) => void` | Callback when hovering over a node |
| `onLinkHover` | `(link: GraphLink \| null) => void` | Callback when hovering over a link |
| `onBackgroundClick` | `(event: MouseEvent) => void` | Callback when clicking the background |
| `onBackgroundRightClick` | `(event: MouseEvent) => void` | Callback when right-clicking the background |
| `onZoom` | `(transform: Transform) => void` | Callback when zoom/pan changes |
| `onEngineStop` | `() => void` | Callback when the force simulation stops |
| `onLoadingChange` | `(loading: boolean) => void` | Callback when loading state changes |
| `isNodeSelected` | `(node: GraphNode) => boolean` | Function to determine if a node is selected |
| `isLinkSelected` | `(link: GraphLink) => boolean` | Function to determine if a link is selected |
| `node` | `object` | Custom node rendering functions (see Custom Rendering) |
| `link` | `object` | Custom link rendering functions (see Custom Rendering) |

### Data Types

#### Node
```typescript
{
  id: number;
  labels: string[];
  color: string;
  visible: boolean;
  size?: number;              // Optional: node radius (default: 6)
  caption?: string;           // Optional: property key to use from the data for display text (default: id)
  data: Record<string, any>;  // Node properties
}
```

#### Link
```typescript
{
  id: number;
  relationship: string;       // Label displayed on the link
  color: string;
  source: number;            // Source node ID
  target: number;            // Target node ID
  visible: boolean;
  data: Record<string, any>; // Link properties
}
```

#### GraphNode
Internal format with computed properties:
```typescript
{
  ...Node;
  size: number;                    // Always present (defaults to 6)
  displayName: [string, string];  // Computed text lines
  x?: number;                     // Position from simulation
  y?: number;
  vx?: number;                    // Velocity
  vy?: number;
  fx?: number;                    // Fixed position
  fy?: number;
}
```

#### GraphLink
Internal format with resolved node references:
```typescript
{
  ...Link;
  source: GraphNode;  // Resolved node object
  target: GraphNode;  // Resolved node object
  curve: number;      // Computed curvature for rendering
}
```

#### ViewportState
```typescript
{
  zoom: number;
  centerX: number;
  centerY: number;
} | undefined
```

#### Transform
```typescript
{
  k: number;  // zoom scale
  x: number;  // pan x
  y: number;  // pan y
}
```

## Custom Rendering

You can provide custom rendering functions for nodes and links:

```typescript
canvas.setConfig({
  node: {
    nodeCanvasObject: (node: GraphNode, ctx: CanvasRenderingContext2D) => {
      // Custom node drawing logic
      ctx.fillStyle = node.color;
      ctx.fillRect(node.x! - 5, node.y! - 5, 10, 10);
    },
    nodePointerAreaPaint: (node: GraphNode, color: string, ctx: CanvasRenderingContext2D) => {
      // Define clickable area
      ctx.fillStyle = color;
      ctx.fillRect(node.x! - 5, node.y! - 5, 10, 10);
    }
  },
  link: {
    linkCanvasObject: (link: GraphLink, ctx: CanvasRenderingContext2D) => {
      // Custom link drawing logic
    },
    linkPointerAreaPaint: (link: GraphLink, color: string, ctx: CanvasRenderingContext2D) => {
      // Define clickable area for link
    }
  }
});
```

## Utility Functions

The package exports utility functions for data manipulation:

```typescript
import {
  dataToGraphData,
  graphDataToData,
  getNodeDisplayText,
  getNodeDisplayKey,
  wrapTextForCircularNode
} from '@falkordb/canvas';

// Convert between formats
const graphData = dataToGraphData(data);
const data = graphDataToData(graphData);

// Get display text for a node
const text = getNodeDisplayText(node);  // Returns node.data[caption] or defaults to id

// Wrap text for circular nodes
const [line1, line2] = wrapTextForCircularNode(ctx, text, radius);
```

## Development

```bash
# Install dependencies
npm install

# Build (TypeScript compilation)
npm run build

# Watch mode (auto-rebuild on changes)
npm run dev

# Run example server
npm run example
# Then open http://localhost:8080/examples/falkordb-canvas.example.html

# Lint code
npm run lint

# Clean build artifacts
npm run clean
```

## Web Component Attributes

The component supports HTML attributes for render modes:

```html
<falkordb-canvas 
  node-mode="replace"  <!-- 'before' | 'after' | 'replace' -->
  link-mode="after">   <!-- 'before' | 'after' | 'replace' -->
</falkordb-canvas>
```

- `replace` (default for nodes): Uses custom rendering exclusively
- `before`: Renders custom content before default rendering
- `after` (default for links): Renders custom content after default rendering

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

Requires support for:
- Web Components (Custom Elements)
- ES Modules
- Shadow DOM
- HTML5 Canvas

## Testing & Automation

### Engine Status Indicator

The canvas element inside the web component's shadow DOM exposes a `data-engine-status` attribute that indicates whether the force simulation is currently running or stopped. This is useful for automated testing to wait for the canvas to finish animating.

**Values:**
- `"running"` - Force simulation is actively running
- `"stopped"` - Force simulation has stopped (animation complete)

**Example usage with Playwright:**

```typescript
// Wait for canvas to be ready
const canvasElement = page.locator("falkordb-canvas").locator("canvas").first();
await canvasElement.waitFor({ state: "attached" });

// Poll until animation completes
while (true) {
  const status = await canvasElement.getAttribute("data-engine-status");
  if (status === "stopped") break;
  await page.waitForTimeout(500);
}
```

**Note:** The attribute is set on the `<canvas>` element within the shadow DOM, not on the `<falkordb-canvas>` web component itself.

## Performance Tips

1. **Large graphs**: Use `cooldownTicks` to limit simulation iterations
2. **Static graphs**: Set `cooldownTicks: 0` after initial layout
3. **Custom rendering**: Optimize your custom `nodeCanvasObject` and `linkCanvasObject` functions
4. **Viewport**: Use `getViewport()` and `setViewport()` to preserve user's view when updating data

## Examples

See the [examples directory](./examples) for complete working examples including:
- Basic usage
- Custom node/link rendering
- Event handling
- Dynamic data updates
- Theme switching

## Links

- [GitHub Repository](https://github.com/FalkorDB/falkordb-canvas)
- [FalkorDB](https://www.falkordb.com/)
- [Report Issues](https://github.com/FalkorDB/falkordb-canvas/issues)
- [npm Package](https://www.npmjs.com/package/@falkordb/canvas)

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
