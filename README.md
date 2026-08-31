# Incantly Canvas

[![CI](https://github.com/Incantly/canvas/actions/workflows/ci.yml/badge.svg)](https://github.com/Incantly/canvas/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**MIT-licensed infinite-canvas whiteboard SDK** for React, React Native, and plain JavaScript.

**[GitHub](https://github.com/Incantly/canvas)** · **[Playground](apps/playground)** · [Roadmap](roadmap/README.md) · [Contributing](CONTRIBUTING.md)

## Packages

| Package | For |
| --- | --- |
| [`@incantly/canvas`](packages/core) | Framework-free engine + toolbar |
| [`@incantly/canvas-react`](packages/react) | `<Canvas />` component + hooks |
| [`@incantly/canvas-react-native`](packages/react-native) | WebView component + typed bridge |

## Quick start — React

```bash
npm install @incantly/canvas-react
```

```tsx
import { Canvas } from '@incantly/canvas-react'
import '@incantly/canvas/canvas.css'

export default function App() {
  return <Canvas theme="light" grid="lines" />
}
```

## Quick start — vanilla

```js
import { createCanvas } from '@incantly/canvas'
import '@incantly/canvas/canvas.css'

createCanvas({ container: document.getElementById('board') })
```

## Monorepo

```bash
npm install
npm test
npm run build:packages
npm run dev:playground   # SDK feature playground
```

## License

MIT — see [LICENSE](LICENSE).
