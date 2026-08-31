import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const playgroundDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(playgroundDir, '../..')

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: '@incantly/canvas/canvas.css',
        replacement: path.resolve(repoRoot, 'packages/core/src/canvas.css'),
      },
      {
        find: '@incantly/canvas',
        replacement: path.resolve(repoRoot, 'packages/core/src/index.ts'),
      },
      {
        find: '@incantly/canvas-react',
        replacement: path.resolve(repoRoot, 'packages/react/src/index.tsx'),
      },
    ],
  },
  server: process.env.PORT ? { port: Number(process.env.PORT), strictPort: true } : {},
})
