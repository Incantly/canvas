# @incantly/canvas-react

React bindings for [Incantly Canvas](https://github.com/Incantly/canvas).

```bash
npm install @incantly/canvas-react
```

```tsx
import { Canvas } from '@incantly/canvas-react'
import '@incantly/canvas-react/canvas.css'

export default function App() {
  return <Canvas theme="light" grid="lines" />
}
```

For the smallest and most stable canvas-only boundary, use the explicit subpath:

```tsx
import { Canvas, useCanvasStore } from '@incantly/canvas-react/canvas'
```

The package root remains compatible with existing canvas consumers and re-exports the
core engine API. React document UI is isolated at `@incantly/canvas-react/document` so
future Tiptap/ProseMirror dependencies never enter the canvas-only bundle.
