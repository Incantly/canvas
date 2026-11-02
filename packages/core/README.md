# @incantly/canvas-core

The framework-free heart of Incantly Canvas — an MIT-licensed
infinite-canvas whiteboard engine. Zero dependencies, zero build step: plain ESM
that runs in any modern browser.

If you're using React or React Native, you probably want
`@incantly/canvas-react` or `@incantly/canvas-react-native`
instead — they wrap this engine.

## Install

```bash
npm install @incantly/canvas-core
```

## Quick start

```js
import { createCanvas } from '@incantly/canvas-core'
import '@incantly/canvas-core/canvas.css'

const board = createCanvas({
  container: document.getElementById('board'),
  theme: 'light', // or 'dark'
  grid: 'lines',  // 'none' (default) | 'lines' | 'dots'
})

// the document store emits a diff after every change
board.editor.store.listen((diff, source) => {
  console.log('changed', diff)
})

// later
board.destroy()
```

That's a complete whiteboard: pen with pressure/velocity ink, highlighter,
shapes, arrows with bendable curves, text, sticky notes, images
(paste/drop/pick), eraser, laser pointer, selection with resize/rotate,
pan/zoom/pinch, undo/redo, PNG export, a responsive floating toolbar, light and
dark themes, grid backdrops, and full keyboard shortcuts.

## Theme, grid, and the board menu

Both live on the editor and in the ⋮ board menu, so users can switch them
without you building any chrome:

```js
board.editor.setTheme('dark')     // emits 'theme'
board.editor.setGrid('dots')      // 'none' | 'lines' | 'dots', emits 'grid'
board.editor.clearBoard()         // one undoable step (⇧⌘⌫)

// mirror in-board switches into your own app state
board.editor.on('theme', () => setMyTheme(board.editor.theme.id))
board.editor.on('grid', () => setMyGrid(board.editor.grid))
```

If your app owns its own theme chrome, drop the in-board switches:

```js
createCanvas({ container, themeToggle: false, gridControl: false })
```

A small "Incantly Canvas" mark sits in the board's corner. Keeping it helps people
find the project; `watermark: false` removes it — no purchase required.

The grid spacing adapts to the zoom (doubling and halving around a 40px page
step, majors every fifth) and travels into PNG exports that keep the paper.

## Headless / custom UI

`createCanvas` is just `new Editor(...)` plus the stock toolbar. Use the
editor bare and bring your own chrome:

```js
import { Editor } from '@incantly/canvas-core'
import '@incantly/canvas-core/canvas.css'

const editor = new Editor({ container, theme: 'dark', grid: 'dots' })
editor.setTool('draw')
editor.setStyle('color', 'blue')
editor.on('selection', () => console.log([...editor.selection]))
```

## The document

The store is a flat map of immutable records. Every mutation happens in a
transaction and emits a diff — `{ added, removed, updated: {id: [from, to]} }` —
which is also the wire format for sync and the shape of undo history:

```js
const snapshot = editor.store.getSnapshot()   // serialize (JSON-safe)
editor.store.loadSnapshot(snapshot)           // restore

// real-time sync: ship diffs both ways
editor.store.listen((diff) => socket.send(JSON.stringify(diff)), { source: 'user' })
socket.onmessage = (e) => editor.store.applyDiff(JSON.parse(e.data), 'remote')
```

Remote diffs don't enter local undo history, so collaborative undo stays sane.

## Pages, headers and footers

`@incantly/canvas-core/document` answers "what does page N look like" for notes
stored in the document model, so the editor, print CSS and Word export agree.
All lengths are points (1/72 inch). Nothing here touches the DOM, and nothing
calculated (page boundaries, zoom) is written back into the document.

```ts
import {
  resolvePageLayout, numberPages, headerFooterFor, headerFooterPlainText,
  headerFooterDocumentTitle, ensurePageLayout, setHeaderFooter, setDifferentFirstPage,
} from '@incantly/canvas-core/document'

// 1. Place the sections. Missing `metadata.layout` falls back to `metadata.pageSetup`.
const layout = resolvePageLayout(document)          // { mode, defaultSection, sections, warnings }

// 2. Number the pages once you know how many each section has.
const pages = numberPages(layout, [3, 2])           // [{ sectionIndex, pageIndexInSection, absolutePageNumber, printedPageNumber }, ...]

// 3. Pick and render the footer for each page.
for (const page of pages) {
  const section = layout.sections[page.sectionIndex]
  const { variant, content } = headerFooterFor(section, { ...page, kind: 'footer' })
  const { text, warnings } = headerFooterPlainText(content, {
    pageNumber: page.printedPageNumber,
    pageCount: pages.length,
    documentTitle: headerFooterDocumentTitle(document),
    date: new Date().toLocaleDateString('en-CA'),   // YYYY-MM-DD in the reader's time zone
  })
}

// 4. Edit headers and footers. Builders return a new layout and never mutate.
let next = ensurePageLayout(document)
next = setHeaderFooter(next, next.defaultSection.id, 'footer', 'default', [
  {
    id: 'node:footer', type: 'paragraph', attrs: { alignment: 'center' },
    content: [
      { type: 'text', text: 'Page ' }, { type: 'field', field: 'pageNumber' },
      { type: 'text', text: ' of ' }, { type: 'field', field: 'pageCount' },
    ],
  },
])
next = setDifferentFirstPage(next, next.defaultSection.id, true)   // blank first-page header and footer
```

| Function | What it does |
|---|---|
| `resolvePageLayout(document)` | Sections in document order, each with `startIndex`, `startNodeId` and its effective `pageSetup`. Sections that cannot start anywhere are skipped with a warning. It never throws. |
| `numberPages(layout, sectionPageCounts)` | Absolute and printed page numbers. The first section starts at `startingPageNumber`; a later section restarts only when its own `startingPageNumber` is set. |
| `headerFooterFor(section, { kind, pageIndexInSection, printedPageNumber })` | `first` on the section's first page (an empty `first` means a blank first page); otherwise `odd`/`even` by the **printed** number; otherwise `default`. |
| `formatHeaderFooterField(field, context)` | `pageNumber`/`pageCount` in `decimal`, `lower-roman` or `upper-roman`; `documentTitle`; `currentDate`. Missing values and unknown fields give `''` plus a warning. |
| `headerFooterLines` / `headerFooterPlainText(content, context)` | Plain-text lines with alignment, for previews and print. |
| `setHeaderFooter`, `setDifferentFirstPage`, `setDifferentOddEven` | Non-mutating builders. They update `defaultSection` and the matching `sections` entry, and throw `PageLayoutError` for an unknown section or unsafe content. |
| `headerFooterOptions(section)` | Whether "different first page" and "different odd & even" are on. |
| `validateHeaderFooterContent` / `normalizeHeaderFooterContent` | Strict check, or repair with warnings, of header/footer content. |

**Header/footer content** is a list of paragraphs, and each paragraph is one
printed line with its own alignment. Paragraph text holds text with marks, hard
breaks, inline math and inline fields:

```ts
// InlineFieldNode, allowed only in header/footer paragraphs (never in body text)
{ type: 'field', field: 'pageNumber' | 'pageCount' | 'documentTitle' | 'currentDate', format?: string }
```

Older content kept fields as top-level items between paragraphs. It still
validates, renders and loads, and `normalizeDocument` / `normalizeHeaderFooterContent`
move those fields into the text:
- a field joins the line of the paragraph before it;
- a paragraph straight after a field joins that line too;
- a field that comes first starts the line.

A joined line keeps the ID and alignment of its first paragraph. A variant
holds at most `MAX_HEADER_FOOTER_ITEMS` (100) paragraphs plus fields, and a
`format` is at most 64 characters.

**Date tokens** for `currentDate` (default `YYYY-MM-DD`): `YYYY` 2026, `YY` 26,
`MMMM` November, `MMM` Nov, `MM` 03, `M` 3, `DD` 07, `D` 7. Text in square
brackets is literal: `[Updated] D MMMM YYYY`. Month names are English.

`validateDocument` rejects fields in body text, block content in headers and
footers, unknown fields, `startingPageNumber` below 1 and `columns` other than
1 or 2.
`normalizeDocument` / `recoverDocument` keep the layout and repair those
instead.

## Export

```js
const blob = await editor.exportImage({ background: true, scale: 2 })
```

See the repository README for the full API, data model and guides.

## License

MIT
