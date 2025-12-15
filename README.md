# FalkorDB Canvas

A standalone web component for visualizing FalkorDB graphs using force-directed layouts.

## Features

- 🎨 **Force-directed graph layout** - Automatic positioning using D3 force simulation
- 🎯 **Interactive** - Click, hover, and right-click interactions
- 🌓 **Theme support** - Light and dark mode compatible
- ⚡ **Performance** - Optimized rendering with canvas
- 💀 **Loading states** - Built-in skeleton loading with pulse animation
- 🎨 **Customizable** - Colors, sizes, and behaviors

## Installation

```bash
npm install falkordb-canvas
```

## Quick Start

### HTML

```html
<!DOCTYPE html>
<html>
<head>
  <title>FalkorDB Canvas Example</title>
</head>
<body>
  <falkordb-canvas id="graph" style="width: 100%; height: 600px;"></falkordb-canvas>
  
  <script type="module">
    import 'falkordb-canvas';
    
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

## API

### Methods

#### `setData(data: Data)`
Set the graph data (nodes and links).

```typescript
canvas.setData({
  nodes: [
    { id: 1, labels: ['Person'], color: '#FF6B6B', visible: true, data: { name: 'Alice' } }
  ],
  links: [
    { id: 1, relationship: 'KNOWS', color: '#999', source: 1, target: 2, visible: true, data: {} }
  ]
});
```

#### `getData(): Data`
Get the current graph data.

#### `setConfig(config: ForceGraphConfig)`
Configure the graph visualization and behavior.

```typescript
canvas.setConfig({
  width: 800,
  height: 600,
  backgroundColor: '#FFFFFF',
  foregroundColor: '#1A1A1A',
  displayTextPriority: [
    { name: 'name', ignore: false },
    { name: 'title', ignore: false }
  ],
  cooldownTicks: 300,
  isLoading: false,
  onNodeClick: (node, event) => {},
  onNodeRightClick: (node, event) => {},
  onLinkRightClick: (link, event) => {},
  onNodeHover: (node) => {},
  onLinkHover: (link) => {},
  onBackgroundClick: (event) => {},
  onEngineStop: () => {},
  isNodeSelected: (node) => false,
  isLinkSelected: (link) => false
});
```

#### `getGraph(): ForceGraphInstance | undefined`
Get the underlying force-graph instance for advanced control.

### Configuration Options

| Option | Type | Description |
|--------|------|-------------|
| `width` | `number` | Canvas width in pixels |
| `height` | `number` | Canvas height in pixels |
| `backgroundColor` | `string` | Background color (hex or CSS color) |
| `foregroundColor` | `string` | Foreground color for borders and text |
| `displayTextPriority` | `TextPriority[]` | Priority order for displaying node text |
| `cooldownTicks` | `number \| undefined` | Number of simulation ticks before stopping |
| `isLoading` | `boolean` | Show/hide loading skeleton |
| `onNodeClick` | `function` | Callback when a node is clicked |
| `onNodeRightClick` | `function` | Callback when a node is right-clicked |
| `onLinkRightClick` | `function` | Callback when a link is right-clicked |
| `onNodeHover` | `function` | Callback when hovering over a node |
| `onLinkHover` | `function` | Callback when hovering over a link |
| `onBackgroundClick` | `function` | Callback when clicking the background |
| `onEngineStop` | `function` | Callback when the force simulation stops |
| `isNodeSelected` | `function` | Function to determine if a node is selected |
| `isLinkSelected` | `function` | Function to determine if a link is selected |

### Data Types

#### Node
```typescript
{
  id: number;
  labels: string[];
  color: string;
  visible: boolean;
  data: Record<string, any>;
}
```

#### Link
```typescript
{
  id: number;
  relationship: string;
  color: string;
  source: number;  // Node ID
  target: number;  // Node ID
  visible: boolean;
  data: Record<string, any>;
}
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Run example
npm run example
# Then open http://localhost:8080/examples/falkordb-canvas.example.html
```

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
