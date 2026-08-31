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

- [ ] Shapes scoped to pages; switching pages shows correct content
- [ ] Zoom/pan works within page; camera doesn't drift to infinite void
- [ ] Add/remove/reorder pages persists in snapshot
- [ ] Migration loads old infinite snapshots as single-page notebooks
- [ ] Playground panel demonstrates all above
- [ ] RN playground confirms page navigation + draw isolation

## Out of scope

- Infinite canvas mode toggle (Incantly is page-only)
- Master pages / templates
- Page templates with pre-placed content

## Key files

- [`packages/core/src/types/models.ts`](../packages/core/src/types/models.ts) — `PageRecord`
- [`packages/core/src/store.ts`](../packages/core/src/store.ts) — page CRUD, parentId on shapes
- [`packages/core/src/editor.ts`](../packages/core/src/editor.ts) — camera clamp, page events
- [`packages/core/src/shapes.ts`](../packages/core/src/shapes.ts) — page background render
