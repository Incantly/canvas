import { describe, it, expect } from 'vitest'
import { Store } from '../src/store.js'
import {
  pageContentRect,
  pointInPageContent,
  mergeTextShapesIntoPage,
} from '../src/page-document.js'
import { createPage } from '../src/pages.js'

describe('page document', () => {
  it('content rect respects page margins', () => {
    const page = createPage(0)
    const r = pageContentRect(page)
    expect(r.x).toBeGreaterThan(0)
    expect(r.w).toBeLessThan(page.width)
  })

  it('pointInPageContent detects inside margin box', () => {
    const page = createPage(0)
    const r = pageContentRect(page)
    expect(pointInPageContent(page, r.x + 10, r.y + 10)).toBe(true)
    expect(pointInPageContent(page, 0, 0)).toBe(false)
  })

  it('migratePageDocuments merges text shapes into page body', () => {
    const s = new Store()
    s.loadSnapshot({
      document: {
        store: {
          p1: {
            id: 'p1',
            typeName: 'page',
            index: 0,
            x: 0,
            y: 0,
            width: 816,
            height: 1056,
            name: 'Page 1',
          },
          t1: {
            id: 't1',
            typeName: 'shape',
            type: 'text',
            parentId: 'p1',
            x: 80,
            y: 100,
            rot: 0,
            z: 1,
            props: {
              blocks: [{ type: 'paragraph', content: [{ text: 'From shape' }] }],
              color: 'black',
              size: 'm',
              font: 'sans',
            },
          },
        },
      },
    })
    expect(s.shapes().filter((sh) => sh.type === 'text').length).toBe(0)
    const blocks = s.notebookDocumentBlocks()
    expect(blocks.some((b) => b.type === 'paragraph' && b.content[0]?.text === 'From shape')).toBe(true)
  })

  it('mergeTextShapesIntoPage preserves existing blocks', () => {
    const page = createPage(0)
    page.document = { blocks: [{ type: 'paragraph', content: [{ text: 'Existing' }] }] }
    const merged = mergeTextShapesIntoPage(page, [
      {
        id: 't',
        typeName: 'shape',
        type: 'text',
        parentId: page.id,
        x: 0,
        y: 0,
        rot: 0,
        z: 1,
        props: {
          blocks: [{ type: 'paragraph', content: [{ text: 'Added' }] }],
          color: 'black',
          size: 'm',
          font: 'sans',
        },
      } as any,
    ])
    expect(merged.some((b) => b.content[0]?.text === 'Existing')).toBe(true)
    expect(merged.some((b) => b.content[0]?.text === 'Added')).toBe(true)
  })
})
