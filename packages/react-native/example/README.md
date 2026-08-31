# React Native playground (reference)

Until `apps/mobile` exists, use this folder as the RN playground reference.

## Quick test

Bridge + WebView behavior is covered by:

```bash
npm test --workspace=@incantly/canvas-react-native
```

The `bridge.test.ts` suite verifies `__icDispatch` round-trips (legacy `__qdDispatch` fallback included).

## Expo integration (manual)

Copy `App.example.tsx` into an Expo app that depends on `@incantly/canvas-react-native`:

```bash
npm install @incantly/canvas-react-native react-native-webview
```

Run on iOS/Android, draw a stroke with finger or stylus, confirm undo works.

## Parity with web playground

Each roadmap feature that merges must:

1. Add a panel under `apps/playground/src/panels/`
2. Add an RN note or scene here (or in `apps/mobile` when it lands)
3. Register in `apps/playground/src/panels/FeatureIndex.tsx`
