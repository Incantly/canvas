# 15 — Mobile product shell

**Branch:** `feat/apps-mobile-shell`  
**Priority:** Foundation (parallel after rename)  
**Depends on:** [00-rename-incantly-canvas](./00-rename-incantly-canvas.md)

## Problem

Incantly needs an **Expo/React Native app** that imports `@incantly/canvas-react-native`. The SDK uses WebView rendering — this shell wraps it for mobile product use and playground RN testing.

## Scope

### App: `apps/mobile`

Expo (SDK 52+):

```
apps/mobile/
├── app/
│   ├── _layout.tsx
│   ├── index.tsx                   # notebook list
│   ├── notebook/[id].tsx           # canvas screen
│   └── playground/index.tsx        # links to feature demos (doc 01)
├── components/
│   └── CanvasScreen.tsx
└── package.json
```

### Canvas screen

- Full-screen `@incantly/canvas-react-native` component
- Load/save snapshot via AsyncStorage per notebook id
- Page navigation native chrome (optional — or rely on WebView UI)
- Stylus-friendly: no scroll interference on canvas area

### Bridge requirements

Audit and expose any missing methods from [`packages/react-native/src/index.tsx`](../packages/react-native/src/index.tsx):

- Page navigation (doc 02)
- Grid, theme, tool (existing)
- Sync status postMessage (doc 11)
- Deep link params → init notebook at page/shape (doc 10)

### Deep linking

Expo Linking config for `incantly://notebook/:id`.

## React Native

This **is** the RN app. All roadmap features must be verified here via playground routes.

### Performance checklist

- WebView memory on long sessions
- Background/foreground snapshot save
- Keyboard vs canvas focus

Document findings; native Skia only if WebView fails perf targets.

## Playground demo

**Route:** `apps/mobile/app/playground/index.tsx`

- Lists all playground feature scenes (mirrors web `FeatureIndex`)
- Each scene loads Canvas with feature-specific fixture

## Acceptance criteria

- [ ] `npx expo start` in `apps/mobile` loads notebook list
- [ ] Open notebook → draw with finger/stylus works
- [ ] Snapshot persists across app restart (AsyncStorage)
- [ ] Playground route lists feature demos (starts empty, grows per feature)
- [ ] Deep link opens notebook (stub)

## Key files

- `apps/mobile/` (new)
- [`packages/react-native/src/webview-entry.ts`](../packages/react-native/src/webview-entry.ts)
- [`packages/react-native/src/index.tsx`](../packages/react-native/src/index.tsx)
