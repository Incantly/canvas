import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: '@incantly/canvas-react/document.css',
        replacement: fileURLToPath(new URL('../../packages/react/src/document/document.css', import.meta.url)),
      },
      {
        find: '@incantly/canvas-react/document',
        replacement: fileURLToPath(new URL('../../packages/react/src/document/index.ts', import.meta.url)),
      },
      {
        find: '@incantly/canvas/document',
        replacement: fileURLToPath(new URL('../../packages/core/src/document/index.ts', import.meta.url)),
      },
    ],
  },
})
