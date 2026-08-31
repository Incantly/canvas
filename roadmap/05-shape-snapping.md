# 05 — Shape snapping

**Branch:** `feat/shape-snapping`  
**Priority:** #3 feature  
**Depends on:** [04-canvas-pen-design](./04-canvas-pen-design.md)

## Problem

Freehand strokes are noisy. Users often intend straight lines, circles, or rectangles. Post-draw geometric cleanup improves UX and gives the compiler cleaner vector input.

## Scope

### Pipeline (on pointer up)

New module `packages/core/src/snapping/`:

```
raw pts → Douglas-Peucker simplify → primitive classifier → snap decision → replace shape
```

1. **Simplify** — reduce point count while preserving shape (epsilon scaled to stroke size)
2. **Classify** — score against: line, circle/ellipse, axis-aligned rectangle, triangle, arrow
3. **Decide** — if confidence ≥ threshold:
   - **Auto mode:** replace immediately
   - **Suggest mode (default):** toast/chip "Make line?" with accept/dismiss
4. **Replace** — delete draw shape, create `line` / `geo` / `arrow` shape with fitted params

### Auto-straightening

Subset of line detection: if endpoints nearly collinear and length > min, snap to exact line segment. Brush-aware — runs from brush `onPointerUp` hook (doc 04).

### Settings

```typescript
interface SnapSettings {
  enabled: boolean
  mode: 'off' | 'suggest' | 'auto'
  confidenceThreshold: number  // default 0.85
}
```

User setting in board menu + playground toggle.

### Confidence heuristics (v1)

| Primitive | Signal |
|-----------|--------|
| Line | Max deviation from chord < ε |
| Circle | Constant radius from centroid |
| Rectangle | Four roughly 90° corners, parallel sides |
| Triangle | Three dominant direction changes |

## React Native

- Snapping runs in WebView core — no RN-specific logic
- Suggest UI renders inside WebView (toast component)
- Bridge: `setSnapSettings({...})` for RN settings screen
- Test: draw wobbly line on RN, accept snap suggestion

## Playground demo

**Panel:** `ShapeSnappingPanel.tsx`

- Toggle suggest/auto/off
- Draw wobbly line → snap to line
- Draw rough circle → snap to ellipse geo
- Draw rough rectangle → snap to geo rect
- Show confidence score in debug overlay (dev mode)
- RN: same tests

## Acceptance criteria

- [ ] Line snap works in suggest + auto modes
- [ ] Circle and rectangle snap at ≥0.85 confidence on test fixtures
- [ ] Dismissed suggestion leaves original ink
- [ ] Snapped shape is editable (geo handles)
- [ ] Playground + RN playground pass

## Out of scope

- Snap to grid (doc 09)
- Snap to other shapes' edges
- Multi-stroke shape detection

## Key files

- `packages/core/src/snapping/` (new)
- [`packages/core/src/editor.ts`](../packages/core/src/editor.ts) — pointer up hook
- [`packages/core/src/brush/`](../packages/core/src/brush/) — brush integration
