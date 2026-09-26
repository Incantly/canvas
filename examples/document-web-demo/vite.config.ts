import { fileURLToPath, URL } from 'node:url'
import { createRequire } from 'node:module'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const require = createRequire(import.meta.url)

export default defineConfig({
  plugins: [react()],
  // Heavy exporters are dynamically imported on demand, but pagedjs must be
  // pre-bundled: its ESM source imports legacy CJS (event-emitter) that the
  // browser cannot consume raw. docx ships self-contained ESM and stays out.
  // The `d` shim below works around a stray home-directory .pnp.cjs that
  // esbuild picks up and that forbids the (npm-installed) `d` package which
  // event-emitter/es6-symbol require.
  optimizeDeps: {
    exclude: ['docx'],
    include: ['pagedjs'],
    esbuildOptions: {
      plugins: [
        {
          name: 'demo-resolve-legacy-d',
          setup(build) {
            build.onResolve({ filter: /^d$/ }, () => ({ path: require.resolve('d') }));
          },
        },
      ],
    },
  },
  resolve: {
    alias: [
      {
        find: '@incantly/canvas/document',
        replacement: fileURLToPath(new URL('../../packages/core/src/document/index.ts', import.meta.url)),
      },
    ],
  },
})
