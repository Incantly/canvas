import { readFileSync } from 'node:fs'
import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'

describe('React package entry points', () => {
  it('publishes independent root, canvas, document, and CSS exports', () => {
    const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      exports: Record<string, unknown>
      sideEffects: string[]
      files: string[]
    }

    expect(packageJson.exports['.']).toEqual({ types: './dist/index.d.ts', default: './dist/index.js' })
    expect(packageJson.exports['./canvas']).toEqual({ types: './dist/canvas/index.d.ts', default: './dist/canvas/index.js' })
    expect(packageJson.exports['./document']).toEqual({ types: './dist/document/index.d.ts', default: './dist/document/index.js' })
    expect(packageJson.exports['./canvas.css']).toBe('./src/canvas.css')
    expect(packageJson.sideEffects).toEqual(['./src/canvas.css'])
    expect(packageJson.files).toContain('src/canvas.css')
  })

  it('keeps the root Canvas API compatible and exposes the explicit canvas path', async () => {
    const root = await import('../src/index.js')
    const canvas = await import('../src/canvas/index.js')

    expect(root.Canvas).toBe(canvas.Canvas)
    expect(root.useCanvasStore).toBe(canvas.useCanvasStore)
    expect(root.Store).toBeTypeOf('function')
  })

  it('keeps the document entry headless until the Tiptap adapter milestone', async () => {
    const documentApi = await import('../src/document/index.js')

    expect(documentApi.createDocument).toBeTypeOf('function')
    expect(documentApi.executeDocumentCommand).toBeTypeOf('function')
    expect('Canvas' in documentApi).toBe(false)
  })

  it('bundles the canvas subpath without Tiptap or ProseMirror', async () => {
    const root = new URL('../../../', import.meta.url)
    const result = await build({
      absWorkingDir: root.pathname,
      entryPoints: ['packages/react/src/canvas/index.ts'],
      bundle: true,
      write: false,
      metafile: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      external: ['react', 'react/jsx-runtime'],
      alias: { '@incantly/canvas': './packages/core/src/index.ts' },
    })
    const inputPaths = Object.keys(result.metafile.inputs).join('\n').toLowerCase()
    const output = result.outputFiles.map((file) => file.text).join('\n').toLowerCase()

    expect(inputPaths).not.toMatch(/(?:@tiptap|\/tiptap\/|prosemirror)/)
    expect(inputPaths).not.toContain('/packages/react/src/document/')
    expect(output).not.toMatch(/(?:@tiptap|prosemirror)/)
  })
})
