# 06 — Ink smoothing

**Branch:** `feat/ink-smoothing`  
**Priority:** #4 feature  
**Depends on:** [04-canvas-pen-design](./04-canvas-pen-design.md)

## Problem

Raw pointer input is jittery, especially on mouse and lower-end styluses. Strokes should feel smooth without losing intentional detail.

## Scope

### Perfect Freehand integration

**Hand-implement** stroke smoothing in [`freehand.ts`](../packages/core/src/freehand.ts) — do not add `perfect-freehand` unless QA checklist documents an approved exception:

- Catmull-Rom or cubic spline resampling on pointer-up
- Streamline option (lerp toward smoothed path)
- Preserve pressure width mapping from existing `strokeOutline`

### Baseline correction

Custom post-pass after PF smoothing:

- Compute median baseline (y) for horizontal-ish handwriting
- Nudge points toward baseline with strength slider (0–100)
- Helps "messy handwriting" look aligned before beautify (doc 07)

### Settings

```typescript
interface SmoothingSettings {
  engine: 'legacy' | 'perfect'
  streamline: number      // PF option, default 0.5
  baselineCorrection: number  // 0 = off
}
```

Per-user or per-brush override.

## React Native

- Smoothing in WebView core — identical to web
- Test long strokes on RN with finger + stylus
- Verify no perf regression on mid-range Android WebView

## Playground demo

**Panel:** `InkSmoothingPanel.tsx`

- Side-by-side: legacy vs perfect on same input fixture
- Baseline correction slider with before/after
- Record stroke → replay with different settings
- RN: draw long stroke, compare smoothness

## Acceptance criteria

- [ ] Perfect Freehand produces visibly smoother strokes vs legacy on test fixtures
- [ ] Baseline correction aligns horizontal text-like strokes
- [ ] Settings persist in user prefs (localStorage / RN AsyncStorage via bridge)
- [ ] Existing freehand tests updated or duplicated for PF path
- [ ] Playground + RN demo

## Out of scope

- Multi-pass paint textures
- Real-time 120Hz smoothing on every coalesced event (perf risk)

## Key files

- [`packages/core/src/freehand.ts`](../packages/core/src/freehand.ts)
- [`packages/core/src/brush/`](../packages/core/src/brush/)
- `packages/core/src/smoothing/` (new — baseline correction)
