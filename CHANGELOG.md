# Changelog

All notable changes to the `@incantly/canvas*` packages are documented here.
The project follows [semver](https://semver.org); the three packages are
versioned in lockstep.

## 0.1.3 — 2026-08-01

- The pen (draw) tool is now selected by default when a board mounts,
  instead of the select tool — everywhere: core, React, React Native,
  the hosted app, and the site demos.

## 0.1.2 — 2026-08-01

- npm discovery keywords added to all three packages. No code changes.

## 0.1.1 — 2026-08-01

- Lines are now bendable: drag the new midpoint anchor to curve a line,
  exactly like arrows. Lines and arrows both show three anchors
  (start, midpoint, end).
- Fixed: straight arrows could not be bent — the midpoint anchor
  collapsed onto the end anchor when `bend` was 0, making it ungrabbable.

## 0.1.0 — 2026-08-01

First public release.

- `@incantly/canvas` — the framework-free engine: pressure-sensitive
  freehand ink, highlighter, shapes with hand-drawn wobble, arrows with
  draggable bend, text, sticky notes, images, laser pointer, selection with
  move/resize/rotate, infinite canvas with pan/zoom/pinch, palm rejection,
  per-gesture undo/redo, light & dark themes, ruled/dotted grid backdrops,
  PNG export, responsive floating toolbar, and a diff-emitting store built
  for persistence and real-time sync. Zero runtime dependencies.
- `@incantly/canvas-react` — `<Canvas />` component with `snapshot`,
  `onChange`, `onSave`, `autoFit`, and an imperative ref to the editor.
- `@incantly/canvas-react-native` — WebView-based component with a typed bridge:
  `getSnapshot()`, `exportPng()`, theme control, Apple Pencil pressure, and
  palm rejection. Ships a self-contained HTML bundle; works offline.
