# Incantly Canvas

[![CI](https://github.com/Incantly/canvas/actions/workflows/ci.yml/badge.svg)](https://github.com/Incantly/canvas/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**MIT-licensed infinite-canvas whiteboard SDK** for React, React Native, and plain JavaScript.

**[GitHub](https://github.com/Incantly/canvas)** · **[Document demo](examples/document-web-demo)** · [Roadmap](roadmap/README.md) · [Contributing](CONTRIBUTING.md)

## Packages

| Package | For |
| --- | --- |
| [`@incantly/canvas-core`](packages/core) | Framework-free engine + toolbar |
| [`@incantly/canvas-react`](packages/react) | `<Canvas />` component + hooks |
| [`@incantly/canvas-react-native`](packages/react-native) | WebView component + typed bridge |

The packages are published privately to GitHub Packages. Before running the
install commands below, set up your project as described in
[docs/installing.md](docs/installing.md).

## Quick start — React

```bash
npm install @incantly/canvas-react
```

```tsx
import { Canvas } from '@incantly/canvas-react'
import '@incantly/canvas-core/canvas.css'

export default function App() {
  return <Canvas theme="light" grid="lines" />
}
```

## Quick start — vanilla

```js
import { createCanvas } from '@incantly/canvas-core'
import '@incantly/canvas-core/canvas.css'

createCanvas({ container: document.getElementById('board') })
```

## Monorepo

```bash
npm install
npm test
npm run build:packages
npm run dev:document     # document editor demo
```

## License

MIT — see [LICENSE](LICENSE).
