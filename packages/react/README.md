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
Tiptap/ProseMirror dependencies never enter the canvas-only bundle.

## Document editor

Use `initialDocument` for an editor that owns its state:

```tsx
import { DocumentEditor, createDocument } from '@incantly/canvas-react/document'

const initialDocument = createDocument({ title: 'Research notes' })

export function Notes() {
  return <DocumentEditor initialDocument={initialDocument} />
}
```

Use `document` with `onChange` for controlled state. Prop updates replace the editor
state without recreating the Tiptap `Editor`. External replacements—including a change
of document ID or schema version—start a new checkpoint and clear transient undo history,
so undo cannot cross between documents.

```tsx
<DocumentEditor
  document={document}
  onChange={(nextDocument) => setDocument(nextDocument)}
  aria-label="Research document"
/>
```

Changing `readonly`, `editable`, callbacks, classes, styles, or accessibility properties
also keeps the same editor instance. `autofocus` and `initialDocument` are initialization-only.
