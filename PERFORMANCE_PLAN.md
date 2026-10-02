# Canvas Performance Plan

**Applies to:** React web frontend, framework-free core renderer, and the React Native renderer
**Baseline date:** 20 September 2026

## Goal

Keep drawing, panning, zooming, typing, and collaboration responsive as documents grow, without making small documents pay for large-document optimizations.

This plan adapts the techniques described in [tldraw's performance documentation](https://tldraw.dev/sdk-features/performance): viewport culling, granular updates, batched store writes, stable zoom values, geometry caching, level of detail, cheap shape rendering, and production measurement. Incantly uses a Canvas 2D renderer rather than one React component per shape, so the same principles are implemented at the render loop and store boundaries.

## Performance budgets

| Interaction | Target | Failure threshold |
| --- | ---: | ---: |
| Pen/highlighter input | p95 frame ≤ 16.7 ms | p95 > 24 ms |
| Pan and zoom | p95 frame ≤ 16.7 ms | p95 > 24 ms |
| First visible render, 1,000 shapes | ≤ 150 ms | > 250 ms |
| Store batch, 1,000 shape updates | ≤ 50 ms | > 100 ms |
| Rich-text input-to-paint | ≤ 50 ms | > 100 ms |
| Heap growth after 20 open/close cycles | ≤ 5% | > 10% |

Budgets are measured in a production build on a mid-tier mobile device and a throttled desktop profile. CI microbenchmarks should detect relative regressions; device runs decide release readiness.

## Current foundation

- `requestRender()` coalesces invalidations into one animation frame.
- `renderScene()` culls pages and individual shapes outside an expanded viewport.
- Shape geometry, paths, outlines, and text layout use caches keyed by immutable props.
- Store transactions batch related mutations and emit one consolidated diff.
- Canvas backing resolution caps DPR at 2 to limit memory and fill cost.
- Deferred document input commits once per frame rather than once per DOM event.

These behaviors must remain covered by regression tests when the renderer or store is refactored.

## Implementation roadmap

### Phase 1 — measurement and guardrails

1. Add production-only benchmark fixtures for 100, 1,000, 4,000, and 10,000 shapes.
2. Record frame duration for draw, erase, pan, zoom, selection, text editing, and remote-update bursts.
3. Report total shapes, visible shapes, culled shapes, draw calls, and frame p50/p95.
4. Save browser traces for any failed budget and compare against the last release.
5. Run accessibility, Strict Mode, SSR, and conflict tests alongside performance tests so optimization cannot weaken correctness.

The editor now exposes `editor.getPerformanceSnapshot(reset?)`, retaining the most recent 120 render durations and reporting the last, average, and p95 frame time plus total shape count. This is the first telemetry boundary; visible/culled counts and interaction names are added with the spatial index.

### Phase 2 — spatial indexing

The current renderer avoids drawing offscreen shapes but still scans every shape on each visible page. Replace that scan with a per-page spatial index when profiling shows the scan is material.

- Update index entries only when geometry or parent page changes.
- Query the expanded viewport and then retain selected, edited, or actively transformed shapes.
- Keep the Store authoritative; the index is disposable derived state.
- Verify hit testing and marquee selection use the same indexed candidates.

**Exit criterion:** p95 pan cost grows with visible shapes, not total page shapes, at 10,000 shapes.

### Phase 3 — stable zoom and level of detail

Introduce an `effectiveZoom` that updates at a lower frequency during active camera gestures for documents above a configurable threshold.

- Continue moving the camera every frame.
- Reuse stable stroke, text, pattern, and shadow decisions until the gesture settles.
- Below screen-size thresholds, remove shadows, simplify dotted/dashed strokes, skip tiny labels, and use image thumbnails sized for screen pixels × DPR.
- Add hysteresis so details do not flicker at a threshold.

**Exit criterion:** zooming 4,000 mixed shapes stays within the frame budget without visible snapping after the gesture settles.

### Phase 4 — granular invalidation

Track invalidation reasons and dirty regions rather than repainting both canvases for every change.

- Separate scene, overlay, document DOM, and capture-canvas invalidations.
- Repaint overlay-only interactions without repainting the scene.
- Batch remote diffs and multi-shape commands in one store transaction.
- Do expensive geometry work only when geometry-affecting props change.

**Exit criterion:** cursor, selection-handle, and presence updates do not redraw the static scene.

### Phase 5 — asset and memory control

- Decode images once and maintain a size-bounded LRU cache.
- Request or generate image variants near their stepped on-screen resolution.
- Release object URLs, decoded bitmaps, observers, animation frames, and listeners on teardown.
- Virtualize long history/debug lists in the playground.

**Exit criterion:** repeated document switching stays inside the heap-growth budget and large images do not cause avoidable full-resolution decodes.

## Rules for contributors

- Use `store.transact()` for logically atomic multi-record operations.
- Call `requestRender()`; never call `render()` repeatedly in an input loop.
- Keep render-path functions allocation-light and move reusable calculations into caches.
- Preserve viewport culling for every new shape type.
- Prefer CSS animation for UI-only effects; do not continuously mutate shape records for decoration.
- Profile production builds. Development React and instrumentation overhead are not release measurements.
- Add a large-document fixture before raising shape-count limits.

## Release checklist

- [ ] Run all correctness, Strict Mode, SSR, accessibility, and conflict tests.
- [ ] Run production benchmarks at 100, 1,000, 4,000, and 10,000 shapes.
- [ ] Test pen, pan, and pinch zoom on one iOS and one Android mid-tier device.
- [ ] Inspect Chrome/Safari performance traces for long tasks and excess allocation.
- [ ] Compare bundle size, p95 frame time, first render, and heap against the previous release.
- [ ] Document any accepted regression with an owner and removal milestone.
