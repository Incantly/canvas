import { defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['packages/*/test/**/*.test.{js,jsx,ts,tsx}'],
    setupFiles: ['./tests/setup-canvas.js'],
  },
})
