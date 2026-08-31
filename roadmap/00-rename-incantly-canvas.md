# 00 — Package rename

**Branch:** `feat/rename-incantly-canvas`  
**Priority:** First — do before all other work  
**Depends on:** nothing

## Problem

The fork is still branded and published as `@quickdrawjs/*`. Incantly owns this SDK and will diverge from upstream. The name should reflect that before feature work creates more migration debt.

## Scope

### npm packages

| Current | Target |
|---------|--------|
| `@quickdrawjs/core` | `@incantly/canvas` |
| `@quickdrawjs/react` | `@incantly/canvas-react` |
| `@quickdrawjs/react-native` | `@incantly/canvas-react-native` |

### Public API

| Current | Target |
|---------|--------|
| `createQuickdraw()` | `createCanvas()` |
| `QuickdrawInstance` | `CanvasInstance` |
| `Quickdraw` component | `Canvas` component |
| `useQuickdrawStore` | `useCanvasStore` |

Ship deprecated aliases for one release if needed, then remove.

### CSS & DOM

| Current | Target |
|---------|--------|
| `quickdraw.css` | `canvas.css` |
| `qd-*` classes | `ic-*` classes |
| `data-qd-*` attributes | `data-ic-*` |

### Data formats

| Current | Target |
|---------|--------|
| Clipboard `{ quickdraw: 1 }` | `{ incantly: 1 }` (read both during migration) |
| localStorage keys `quickdraw-*` | `incantly-*` |

### Files to update

- All `packages/*/package.json`
- [`packages/core/src/index.ts`](../packages/core/src/index.ts)
- [`packages/react/src/index.tsx`](../packages/react/src/index.tsx)
- [`packages/react-native/scripts/build-html.mjs`](../packages/react-native/scripts/build-html.mjs)
- [`apps/app`](../apps/app), [`apps/docs`](../apps/docs), [`examples/react-demo`](../examples/react-demo)
- Root [`package.json`](../package.json), README, CI

## React Native

- Regenerate `board-html.generated.js` with new bundle paths
- Update RN component names (`Quickdraw` → `Canvas`, `QuickdrawRef` → `CanvasRef`)
- Verify WebView init message types unchanged in behavior

## Playground demo

N/A — rename only. Playground app is created in doc 01.

## Acceptance criteria

- [x] Zero `@quickdrawjs` imports in source (upstream attribution in README only)
- [x] `npm run typecheck`, `npm test`, `npm run build:packages` pass
- [x] RN WebView bundle builds and loads
- [x] Existing hosted app works under new imports

## QA tracking

| Workstream | Status |
| --- | --- |
| P0-core-rename | implemented |
| P0-react-rn-consumers | implemented |
| P0-apps-docs | implemented |

| Check | Status |
| --- | --- |
| Universal verifier gates | implemented |
| Deprecated aliases exported | implemented |

## Out of scope

- Domain changes (`tryquickdraw.com`)
- npm publish under new scope (can follow later)
