# Native RN demo (Expo)

Standalone Expo example for the **native React Native renderer** ([roadmap doc 17](../../roadmap/17-native-rn-renderer.md)).

Lives under `examples/` (not `apps/`) and is **not** an npm workspace member — it keeps its own `node_modules` so Expo’s Metro/React versions don’t fight the monorepo root.

**App dependency:** only `@incantly/canvas-react-native`. Core/headless APIs are re-exported from that package (core is pulled in transitively).

## Prerequisites

From repo root, build the SDK packages first:

```bash
npm run build:packages
```

## Install & run

```bash
cd examples/native-rn-demo
npm install
npx expo start
```

Or from repo root:

```bash
npm run dev:mobile
```

## Playground scenes

| Scene | Workstream | Phase | Status |
|-------|------------|-------|--------|
| Headless store + utils | W1 | 0 | Ready |
| Markdown serialize | W2 | 0 | Ready |
| Document mode | W3 | 1 | Partial |
| CanvasRef / undo | W3 | 1 | Ready |
| Persistence | W6 | 4 | Ready |
| Version history | W6 | 4 | Partial |
| Ink overlay (Skia) | W4 | 2 | Planned |
| Shapes | W5 | 3 | Planned |

Open **Native RN Playground** from the home screen.

## Why not `apps/mobile`?

`apps/*` is on the root npm workspaces list. Hoisting Expo + React Native into the monorepo pulled Metro 0.84 / RN 0.86 against Expo 52 and broke `expo start`. This example uses `file:` deps and local `node_modules` instead.

Product shell (`apps/mobile`) can still land later per [doc 15](../../roadmap/15-apps-mobile-shell.md) once Expo versions are aligned.
