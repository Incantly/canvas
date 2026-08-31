// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { Store } from '../src/store.js'
import { createPage, NOTEBOOK_ID } from '../src/pages.js'
import { themeOf } from '../src/palette.js'
import {
  notesPaperHeight,
  notesPaperBounds,
  virtualPrintPages,
  mergePageDocumentsIntoNotebook,
  NOTES_MIN_BODY_HEIGHT,
} from '../src/notebook-document.js'

const theme = themeOf('light')

describe('notebook document', () => {
  it('mergePageDocumentsIntoNotebook concatenates page bodies', () => {
    const p1 = createPage(0)
    p1.document = { blocks: [{ type: 'paragraph', content: [{ text: 'One' }] }] }
    const p2 = createPage(1)
    p2.document = { blocks: [{ type: 'paragraph', content: [{ text: 'Two' }] }] }
    const merged = mergePageDocumentsIntoNotebook([p1, p2])
    expect(merged).toHaveLength(2)
    expect(merged[0]?.type).toBe('paragraph')
    if (merged[0]?.type === 'paragraph') expect(merged[0].content[0]?.text).toBe('One')
    if (merged[1]?.type === 'paragraph') expect(merged[1].content[0]?.text).toBe('Two')
  })

  it('notesPaperHeight grows with content but respects minimum', () => {
    const page = createPage(0)
    const empty = notesPaperHeight(page, [{ type: 'paragraph', content: [{ text: '' }] }], theme)
    expect(empty).toBeGreaterThanOrEqual(NOTES_MIN_BODY_HEIGHT)
    const tall = notesPaperHeight(
      page,
      Array.from({ length: 40 }, () => ({
        type: 'paragraph' as const,
        content: [{ text: 'Line of notes content for scroll testing.' }],
      })),
      theme,
    )
    expect(tall).toBeGreaterThan(empty)
  })

  it('notesPaperBounds spans full paper height', () => {
    const page = createPage(0)
    const h = notesPaperHeight(page, [{ type: 'paragraph', content: [{ text: 'Hi' }] }], theme)
    const b = notesPaperBounds(page, h)
    expect(b.x).toBe(page.x)
    expect(b.y).toBe(page.y)
    expect(b.w).toBe(page.width)
    expect(b.h).toBe(h)
  })

  it('virtualPrintPages slices long content into fixed-height pages', () => {
    const blocks = Array.from({ length: 80 }, () => ({
      type: 'paragraph' as const,
      content: [{ text: 'Print slice content row.' }],
    }))
    const contentW = 700
    const sliceH = 900
    const pages = virtualPrintPages(blocks, contentW, sliceH, theme)
    expect(pages.length).toBeGreaterThan(1)
    expect(pages[0]!.sliceY).toBe(0)
    expect(pages[1]!.sliceY).toBe(sliceH)
  })

  it('migrateNotebookDocument merges per-page documents into notebook.document', () => {
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
            name: 'A',
            document: { blocks: [{ type: 'paragraph', content: [{ text: 'Page A' }] }] },
          },
          p2: {
            id: 'p2',
            typeName: 'page',
            index: 1,
            x: 0,
            y: 1200,
            width: 816,
            height: 1056,
            name: 'B',
            document: { blocks: [{ type: 'paragraph', content: [{ text: 'Page B' }] }] },
          },
        },
      },
    } as any)
    const nb = s.get(NOTEBOOK_ID) as any
    expect(nb.document?.blocks?.length).toBeGreaterThanOrEqual(2)
    expect(s.page('p1')?.document).toBeUndefined()
    expect(s.page('p2')?.document).toBeUndefined()
    const stream = s.notebookDocumentBlocks()
    expect(stream.some((b) => b.type === 'paragraph' && b.content[0]?.text === 'Page A')).toBe(true)
    expect(stream.some((b) => b.type === 'paragraph' && b.content[0]?.text === 'Page B')).toBe(true)
  })
})
