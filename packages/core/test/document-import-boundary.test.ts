import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('core document package boundary', () => {
  it('imports without browser globals or platform side effects', async () => {
    expect(typeof globalThis.window).toBe('undefined')
    expect(typeof globalThis.document).toBe('undefined')

    const documentApi = await import('../src/document/index.js')

    expect(documentApi.createDocument).toBeTypeOf('function')
    expect(documentApi.validateDocument).toBeTypeOf('function')
    expect(documentApi.executeDocumentCommand).toBeTypeOf('function')
    expect(typeof globalThis.window).toBe('undefined')
    expect(typeof globalThis.document).toBe('undefined')
  })

  it('publishes the document subpath and portable headless API', async () => {
    const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      exports: Record<string, unknown>
    }
    const headless = await import('../src/headless.js')

    expect(packageJson.exports['./document']).toEqual({
      types: './dist/document/index.d.ts',
      default: './dist/document/index.js',
    })
    expect(headless.parseIncantlyDocument).toBeTypeOf('function')
    expect(headless.applyDocumentTransaction).toBeTypeOf('function')
    expect(headless.resolveDocumentSelection).toBeTypeOf('function')
  })
})
