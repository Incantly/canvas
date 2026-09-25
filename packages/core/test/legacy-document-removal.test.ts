import { describe, expect, it } from 'vitest'
import { migrateSnapshot } from '../src/migrations/index.js'

describe('legacy canvas document removal migration', () => {
  it('removes notebook/page document payloads while preserving canvas records', () => {
    const result = migrateSnapshot({
      schema: {
        schemaVersion: 1,
        sequences: {
          'com.incantly.store': 1,
          'com.incantly.shape.text': 1,
          'com.incantly.page.document': 3,
          'com.incantly.notebook.document': 4,
        },
      },
      document: {
        store: {
          'notebook:main': {
            id: 'notebook:main',
            typeName: 'notebook',
            pageLayout: 'vertical',
            document: { blocks: [{ type: 'paragraph', content: [{ text: 'legacy' }] }] },
          } as never,
          'page:one': {
            id: 'page:one',
            typeName: 'page',
            index: 0,
            x: 0,
            y: 0,
            width: 816,
            height: 1056,
            document: { blocks: [{ type: 'paragraph', content: [{ text: 'legacy' }] }] },
          } as never,
          'shape:one': {
            id: 'shape:one',
            typeName: 'shape',
            type: 'geo',
            parentId: 'page:one',
            x: 0,
            y: 0,
            rot: 0,
            z: 1,
            props: {
              geo: 'rectangle', w: 100, h: 100, color: 'black', size: 'm',
              dash: 'solid', fill: 'none', font: 'sans',
            },
          } as never,
        },
      },
    })

    expect(result.document.store['notebook:main']).not.toHaveProperty('document')
    expect(result.document.store['page:one']).not.toHaveProperty('document')
    expect(result.document.store['shape:one']).toBeDefined()
  })
})
