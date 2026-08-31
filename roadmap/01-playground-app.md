# 01 — Playground app

**Branch:** `feat/playground-app`  
**Priority:** Foundation — immediately after rename  
**Depends on:** [00-rename-incantly-canvas](./00-rename-incantly-canvas.md)

## Problem

There is no dedicated environment to manually test SDK features as they land. [`apps/app`](../apps/app) is the public hosted whiteboard; [`examples/react-demo`](../examples/react-demo) is minimal. Every roadmap feature needs a visible, testable demo on web and RN.

## Scope

### Web: `apps/playground`

Vite + `@incantly/canvas-react` app with:

- Full-viewport canvas
- **Feature sidebar** — one panel per roadmap feature (starts empty, grows with each merge)
- **Feature flags** — URL param or toggle to enable in-progress features
- **Debug panel** — snapshot JSON viewer, store size, current page index, camera state
- **Reset / load fixture** buttons for reproducible test states

```
apps/playground/
├── src/
│   ├── main.tsx
│ ├── App.tsx
│ ├── panels/
│   │   ├── FeatureIndex.tsx      # links to all feature demos
│   │   ├── PageCanvasPanel.tsx   # added in doc 02
│   │   ├── RichTextPanel.tsx     # added in doc 03
│   │   └── ...                   # one panel per feature
│   └── fixtures/                 # sample snapshots for testing
├── package.json
└── tsconfig.json
```

Root script: `"dev:playground": "npm run dev --workspace=apps/playground"`

### React Native: playground route

Add a **Playground** screen to [`apps/mobile`](../apps/mobile) (or standalone until mobile shell exists):

- Lists feature demos (same index as web)
- Each demo loads RN `Canvas` with pre-configured props/fixtures
- Confirms bridge round-trips for each feature

Until `apps/mobile` exists, add playground screen to a minimal RN test harness inside `packages/react-native/example/` or document RN testing via Expo in mobile shell doc.

### Panel contract

Each feature doc defines a **Playground panel** section. When a feature merges:

1. Add panel component under `apps/playground/src/panels/`
2. Register in `FeatureIndex.tsx`
3. Add RN equivalent scene
4. Add fixture JSON in `fixtures/`

## React Native

- Playground must use `@incantly/canvas-react-native` — not web-only shortcuts
- Every panel has a `/* rn: ... */` note if behavior differs on WebView
- CI smoke test: load playground web build (optional later)

## Acceptance criteria

- [x] `npm run dev --workspace=apps/playground` renders canvas + empty feature index
- [x] Debug panel shows live snapshot JSON
- [x] Documented pattern for adding new panels (README in `apps/playground/`)
- [x] RN playground reference (`packages/react-native/example/`) + bridge tests

## QA tracking

| Workstream | Status |
| --- | --- |
| P1-playground-web | implemented |
| P1-playground-rn-ref | implemented |

| Check | Status |
| --- | --- |
| Universal verifier gates | implemented |
| FeatureIndex lists roadmap | implemented |

## Out of scope

- Production Incantly UI (`apps/web`)
- Automated visual regression tests (future)
