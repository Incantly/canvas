# @incantly/canvas-react-native

React Native bindings for [Incantly Canvas](https://github.com/Incantly/canvas) — native document renderer (one rich-text editor per paper page).

Optional peer `react-native-enriched-markdown` (Expo SDK 55 / RN 0.83, New Architecture, **dev client / prebuild**, not Expo Go). Without it, the page editor falls back to one multiline `TextInput` so selection still spans Enter-separated lines.

```bash
npm install @incantly/canvas-react-native react-native-webview
```

```tsx
import { Canvas } from '@incantly/canvas-react-native'

export default function App() {
  return <Canvas style={{ flex: 1 }} />
}
```

See [`example/README.md`](example/README.md) for the RN playground reference.
