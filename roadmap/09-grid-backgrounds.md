# 09 — Grid backgrounds

**Branch:** `feat/grid-backgrounds`  
**Priority:** #7 feature  
**Depends on:** [02-page-based-canvas](./02-page-based-canvas.md)

## Problem

Grid is editor-only runtime state today — not in snapshot, not per-page, not syncable. Incantly needs **per-page grid styles** persisted and customizable.

## Scope

### Current baseline

- [`Editor.grid`](../packages/core/src/editor.ts): `'none' | 'lines' | 'ruled' | 'dots' | 'crosses' | 'iso'`
- Hardcoded spacing in [`palette.ts`](../packages/core/src/palette.ts): `GRID_STEP = 40`
- Renders on infinite plane — must move to **page bounds** (doc 02)

### Data model

```typescript
type GridStyleId = 'none' | 'lines' | 'ruled' | 'dots' | 'crosses' | 'iso' | 'graph'

interface PageGridStyle {
  id: GridStyleId
  spacing?: number        // default 40
  majorEvery?: number     // default 5
  color?: { minor: string; major: string }  // override theme
}
```

Stored on `PageRecord.gridStyle` (doc 02).

### Injectable renderer

```typescript
interface GridRenderer {
  draw(ctx: CanvasRenderingContext2D, page: PageRecord, camera: Camera, theme: Theme): void
}

createCanvas({ gridRenderer?: GridRenderer })  // default = built-in
```

Allows Incantly to add custom notebook paper without forking core.

### UI

- Grid picker in board menu (existing) — now persists to page
- Per-page grid: changing page may change grid appearance
- New **graph** mode (major/minor lines for math notebooks)

### Sync

Grid style syncs via page record in store diffs (fixes today's collaboration gap).

## React Native

- Grid renders in WebView — no change
- Bridge: `setPageGrid(pageId, style)` if RN chrome controls grid
- Test: set dots grid on page 1, lines on page 2, reload snapshot

## Playground demo

**Panel:** `GridBackgroundsPanel.tsx`

- Cycle all grid types on current page
- Adjust spacing slider
- Two pages with different grids
- Reload — grids persist
- RN: same

## Acceptance criteria

- [ ] Grid style persists in snapshot per page
- [ ] Grid clips to page bounds
- [ ] Custom `gridRenderer` hook works in playground
- [ ] Sync diff includes grid change when page updated
- [ ] Playground + RN demo

## Out of scope

- Snap-to-grid for shapes
- Custom user-uploaded paper textures

## Key files

- [`packages/core/src/editor.ts`](../packages/core/src/editor.ts) — `_drawGridFn`
- [`packages/core/src/palette.ts`](../packages/core/src/palette.ts)
- [`packages/core/src/types/models.ts`](../packages/core/src/types/models.ts)
