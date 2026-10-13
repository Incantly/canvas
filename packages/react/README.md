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
import '@incantly/canvas-react/document.css'

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

The document theme is independent from the Canvas theme. Use `theme="dark"`, change
`placeholder`, or override the documented `--incantly-document-*` CSS variables on the
wrapper. The editor does not render a toolbar, so hosts can supply any command UI through
the imperative ref without changing the writing surface.

Enable the optional formatting preset with `ui="formatting"`. It adds the accessible
default toolbar, selection bubble toolbar, and slash-command menu. For a custom layout,
leave `ui` unset and mount `DocumentToolbar`, `DocumentBubbleToolbar`, or
`DocumentSlashMenu` with the editor returned by `onReady`. Slash-menu items and their
rendering are replaceable through `items` and `renderItem`.
