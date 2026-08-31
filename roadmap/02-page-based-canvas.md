# 02 — Page-based canvas

**Branch:** `feat/page-based-canvas`  
**Priority:** Before rich text and compiler work  
**Depends on:** [00-rename-incantly-canvas](./00-rename-incantly-canvas.md), [01-playground-app](./01-playground-app.md)

## Problem

Quickdraw is an **infinite canvas** — unbounded pan/zoom, no document structure. Incantly needs a **notebook with pages** (like Apple Notes, Notion, or OpenNote): discrete pages the user navigates between, while still supporting zoom in/out within a page.

This is a foundational model change affecting store, camera, UI, export, and sync.

## Scope

### Mental model

```
Notebook
└── Page 1  (fixed bounds, e.g. A4 or letter aspect)
└── Page 2
└── Page N
```

- User **navigates between pages** (prev/next, thumbnail strip, or page picker)
- User **zooms and pans within the current page** (clamped to page bounds + margin)
- Shapes belong to a **page** — not globally floating on infinite space
- New notebook starts with **one page**; user adds pages

### Data model

Add to snapshot (store meta or dedicated records):

```typescript
interface PageRecord {
  id: string
  typeName: 'page'
  index: number           // sort order
  width: number           // page width in page units (default 816 = ~8.5" at 96dpi)
  height: number          // default 1056
  name?: string           // optional "Page 1" label
  gridStyle?: GridStyleId // per-page grid (see doc 09)
}

interface ShapeRecord {
  // existing fields +
  parentId: string        // page id shapes live on
}
```

Migration: existing snapshots without pages get a single default page containing all shapes.

### Editor changes

[`packages/core/src/editor.ts`](../packages/core/src/editor.ts):

- `editor.currentPageId` — active page
- `editor.pages()` / `editor.setPage(id)` / `editor.addPage()` / `editor.removePage(id)`
- Camera **clamps** to current page bounds (configurable overflow margin for peek at adjacent pages optional v2)
- `fitContent()` → `fitPage()` — fits current page in viewport
- Hit testing, selection, draw sessions scoped to current page
- Page navigation emits `'page'` event

### Rendering

- Draw page background (white/paper rect with subtle shadow or border)
- Gray margin outside page in viewport (desktop) or full-bleed (mobile)
- Grid renders **on page**, not infinite plane (integrates with doc 09)

### UI

[`packages/core/src/ui.ts`](../packages/core/src/ui.ts) or app-level chrome:

- Page prev/next buttons
- Page counter ("2 / 5")
- Add page button
- Optional thumbnail strip (playground + product app)

### Export

- PNG/SVG export exports **current page** by default
- "Export all pages" → multi-page PDF (stretch goal within branch or follow-up)

## React Native

- Page navigation via bridge: `setPage`, `addPage`, `onPageChange`
- WebView viewport sized to page; pinch zoom within page
- Page list in RN playground sidebar
- Test: create 3 pages, draw on each, navigate, verify shapes don't leak across pages

## Playground demo

**Panel:** `PageCanvasPanel.tsx`

- Create notebook with 3 pages
- Draw different colored strokes on each page
- Navigate prev/next; verify isolation
- Zoom in/out within page; verify clamp
- Show page list + snapshot JSON with `page` records

## Acceptance criteria

- [x] Shapes scoped to pages; switching pages shows correct content
- [x] Zoom/pan works within page; camera doesn't drift to infinite void
- [x] Add/remove/reorder pages persists in snapshot
- [x] Migration loads old infinite snapshots as single-page notebooks
- [x] Playground panel demonstrates all above
- [x] RN bridge: setPage, addPage, page events
- [x] Page layout: vertical (stack below) or horizontal (row to the right)
- [x] `editor.setPageLayout()` / RN `setPageLayout` + `pagelayout` event

### Page layout

`NotebookRecord` stores `pageLayout: 'vertical' | 'horizontal'` and `pageGap`.

- **Vertical** (default): pages stack downward — 1, then 2 below, then 3, then 4.
- **Horizontal**: pages in one row left-to-right — 1, then 2 to the right, then 3, then 4.

Each `PageRecord` has world-space `x`, `y`; shapes stay in page-local coordinates.

**Page spacing:** `pageGap` on the notebook (default 48px). Presets: `connected` (0), `normal` (48), `wide` (96). Use `editor.setPageGap()`, `setPageGapPreset()`, or `adjustPageGap(±16)` — pages relayout without changing zoom.

Toggle in the pages bar (↕ / ↔ / − linked + / trash) or playground panel; persists in snapshot.

## Out of scope

- Infinite canvas mode toggle (Incantly is page-only)
- Master pages / templates
- Page templates with pre-placed content

## Key files

- [`packages/core/src/types/models.ts`](../packages/core/src/types/models.ts) — `PageRecord`
- [`packages/core/src/store.ts`](../packages/core/src/store.ts) — page CRUD, parentId on shapes
- [`packages/core/src/editor.ts`](../packages/core/src/editor.ts) — camera clamp, page events
- [`packages/core/src/pages.ts`](../packages/core/src/pages.ts) — layout positions, notebook defaults
- [`packages/core/src/shapes.ts`](../packages/core/src/shapes.ts) — page background render

## QA tracking

| Workstream | Status |
| --- | --- |
| W1 — Page model + store CRUD | implemented |
| W2 — Editor scope + camera + multi-page render | implemented |
| W3 — Vertical/horizontal layout | implemented |
| W4 — UI + playground + RN bridge | implemented |
| W5 — Tests + verifier gates | implemented |

| Check | Status |
| --- | --- |
| Shapes scoped per page | implemented |
| Camera clamp to active page world bounds | implemented |
| Vertical layout stacks pages below | implemented |
| Page gap presets (connected / normal / wide) + adjust | implemented |
| Invalid `setPageLayout` throws | implemented |
| Snapshot migration (orphan shapes → default page) | implemented |
| Playground `PageCanvasPanel` layout toggle | implemented |
| RN bridge `setPageLayout` + `pagelayout` event | implemented |
| Unit tests (`pages.test.ts`, editor/store pages) | implemented |
| `npm run typecheck` | implemented |
| `npm test` | implemented |
| `npm run build:packages` | implemented |
| No new npm dependencies | implemented |
| Playground RN scene | deferred:RN playground app not in repo yet — bridge + example updated |
| Security audit (bridge touched) | implemented — payload validated; no secrets |
