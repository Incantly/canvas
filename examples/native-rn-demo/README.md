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

This demo targets **Expo SDK 55 / React Native 0.83** (New Architecture only).

`react-native-enriched-markdown` is a Fabric native module. It does **not** run in Expo Go. Use a **dev client** after prebuild. `react-native-svg` is required for ink and shapes (included in this demo).

```bash
cd examples/native-rn-demo
npm install
npx expo prebuild
npx expo run:ios
# or: npx expo run:android
```

`npx expo start` still works for Metro, but open the **dev client** (not Expo Go) to get cross-paragraph selection via Enriched. Without a native build the page editor falls back to one multiline `TextInput` per page (selection across Enter still works; marks apply to the selected range).

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

| Scene                  | Workstream | Phase | Status  |
| ---------------------- | ---------- | ----- | ------- |
| Headless store + utils | W1         | 0     | Ready   |
| Markdown serialize     | W2         | 0     | Ready   |
| Document mode          | W3         | 1     | Partial |
| Paper pages + overflow | 18         | 1     | Ready   |
| CanvasRef / undo       | W3         | 1     | Ready   |
| Persistence            | W6         | 4     | Ready   |
| Version history        | W6         | 4     | Partial |
| Ink overlay (SVG)      | W4         | 2     | Ready   |
| Shapes                 | W5         | 3     | Ready   |
| Open canvas            | W5         | 3     | Ready   |

Open **Native RN Playground** from the home screen.

## Why not `apps/mobile`?

`apps/*` is on the root npm workspaces list. Hoisting Expo + React Native into the monorepo pulled Metro 0.84 / RN 0.86 against Expo 52 and broke `expo start`. This example uses `file:` deps and local `node_modules` instead.

Product shell (`apps/mobile`) can still land later per [doc 15](../../roadmap/15-apps-mobile-shell.md) once Expo versions are aligned.
