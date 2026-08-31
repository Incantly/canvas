# 04 — Canvas pen design

**Branch:** `feat/canvas-pen-design`  
**Priority:** #2 feature  
**Depends on:** [02-page-based-canvas](./02-page-based-canvas.md)  
**Note:** Branch `feat/canvas-pen-design` already exists — rebase after rename + pages.

## Problem

Quickdraw has one fixed ink algorithm ([`strokeOutline`](../packages/core/src/freehand.ts)) with color/size variants. Incantly needs a **general-purpose brush system** — define new pen behavior (marker, calligraphy, gradient, material-tagged) without modifying core engine internals each time.

## Scope

### Brush registry

New module `packages/core/src/brush/`:

```typescript
interface BrushDefinition {
  id: string
  label: string
  onPointerDown?(ctx: BrushContext): void
  onPointerMove(ctx: BrushContext): void
  onPointerUp(ctx: BrushContext): void
  render(ctx: CanvasRenderingContext2D, shape: ShapeRecord, theme: Theme): void
  defaultProps?: Partial<DrawShapeProps>
}

function registerBrush(def: BrushDefinition): void
function getBrush(id: string): BrushDefinition
```

Refactor existing draw tool to use built-in `ink` brush wrapping current `strokeOutline`.

### Pen pressure

Already captured: `[x, y, pressure]` triplets in [`editor._extendDraw`](../packages/core/src/editor.ts).

Add:

- **Pressure curve** per brush: `linear` | `soft` | `hard` | custom bezier
- **User sensitivity** setting (0–100) scaling curve strength
- Real stylus: use `e.pressure`; mouse: fallback 0.5 + velocity sim (existing)

### Brush types (v1)

| Brush | Behavior |
|-------|----------|
| `ink` | Current freehand (default) |
| `marker` | Flat width, lower opacity, round cap |
| `calligraphy` | Width varies with stroke direction |
| `gradient` | Color stops along stroke path |
| `highlighter` | Existing highlight tool merged into brush system |

### Material-tagged pens

Extend stroke shape props:

```typescript
material?: 'default' | 'elastic' | 'rubber' | 'rigid'
```

No physics simulation in this branch — prop is stored for **compiler** to pick Matter.js vs Ammo.js later.

### Shape tools + color

Ensure geo palette complete on **current page**:

- Rectangle, ellipse, triangle, line, arrow, star
- Independent fill + stroke color per shape
- Color picker in style popover (may already exist — verify gaps)

### Integration with snapping (doc 05)

Brush `onPointerUp` emits event → snapping module can intercept (stub hook in this branch, full impl in doc 05).

## React Native

- All brushes render inside WebView — no native drawing layer
- Pressure from Apple Pencil / S Pen passes through RN WebView pointer events
- Palm rejection (`isPen` mode) already exists — verify per brush
- Bridge: `setBrush(id)`, `setPressureSensitivity(n)` if user settings exposed to RN chrome
- Test each brush type on RN playground with stylus + finger

## Playground demo

**Panel:** `PenDesignPanel.tsx`

- Brush picker (ink, marker, calligraphy, gradient)
- Pressure curve selector + live stroke preview
- Material tag selector (shows prop in JSON)
- Draw on page, inspect shape props in debug panel
- RN: same panel via playground screen

## Acceptance criteria

- [ ] `registerBrush()` allows adding test brush without editing editor.ts
- [ ] Pressure curve visibly changes stroke width with stylus
- [ ] Gradient brush renders multi-stop stroke
- [ ] `material` prop persists in snapshot
- [ ] All brushes work on RN playground
- [ ] Playground panel demonstrates each brush

## Out of scope

- Auto-straightening / auto-shape (doc 05)
- Perfect Freehand smoothing (doc 06)
- Texture/brush images
- Tilt/azimuth

## Key files

- `packages/core/src/brush/` (new)
- [`packages/core/src/freehand.ts`](../packages/core/src/freehand.ts)
- [`packages/core/src/editor.ts`](../packages/core/src/editor.ts) — draw session
- [`packages/core/src/types/models.ts`](../packages/core/src/types/models.ts)
