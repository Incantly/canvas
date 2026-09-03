import { describe, expect, it } from 'vitest'
import { Store } from '../src/store.js'
import {
  createPage,
  PAPER_SIZE_PRESETS,
  paperSizePreset,
  validatePaperStyle,
  inferPaperSizeId,
} from '../src/pages.js'
import { NOTEBOOK_ID } from '../src/pages.js'
import { CURRENT_SCHEMA } from '../src/types/schema.js'
import { migrateSnapshot } from '../src/migrations/index.js'
import type { Snapshot } from '../src/types/operations.js'

describe('paper size presets', () => {
  it('Letter and A4 match 96dpi sizes', () => {
    expect(PAPER_SIZE_PRESETS.letter).toEqual({ width: 816, height: 1056 })
    expect(paperSizePreset('a4')).toEqual({ width: 794, height: 1123 })
  })

  it('createPage applies paperSize and paperStyle', () => {
    const page = createPage(0, { paperSize: 'a4', paperStyle: 'ruled' })
    expect(page.width).toBe(794)
    expect(page.height).toBe(1123)
    expect(page.paperStyle).toBe('ruled')
    expect(page.document?.blocks?.length).toBeGreaterThan(0)
  })

  it('inferPaperSizeId recognizes presets', () => {
    expect(inferPaperSizeId(816, 1056)).toBe('letter')
    expect(inferPaperSizeId(794, 1123)).toBe('a4')
    expect(inferPaperSizeId(100, 100)).toBeNull()
  })

  it('validatePaperStyle accepts known styles only', () => {
    expect(validatePaperStyle('plain')).toBe(true)
    expect(validatePaperStyle('ruled')).toBe(true)
    expect(validatePaperStyle('grid')).toBe(true)
    expect(validatePaperStyle('dots')).toBe(true)
    expect(validatePaperStyle('iso')).toBe(false)
  })
})

describe('discrete page documents', () => {
  it('edits to page 1 do not change page 2', () => {
    const s = new Store()
    s.normalizePages('remote')
    const p1 = s.pages()[0]!
    const p2 = s.addPage({ paperSize: 'a4', paperStyle: 'dots' })
    s.setPageDocument(p1.id, [{ type: 'paragraph', content: [{ text: 'One' }] }])
    s.setPageDocument(p2.id, [{ type: 'heading1', content: [{ text: 'Two' }] }])
    const b1 = s.pageDocumentBlocks(p1.id)
    const b2 = s.pageDocumentBlocks(p2.id)
    expect(b1[0] && 'content' in b1[0] ? b1[0].content[0]?.text : '').toBe('One')
    expect(b2[0] && 'content' in b2[0] ? b2[0].content[0]?.text : '').toBe('Two')
    expect(p2.width).toBe(794)
    expect(s.page(p2.id)?.paperStyle).toBe('dots')
  })

  it('setPagePaper updates size and style then relayouts', () => {
    const s = new Store()
    s.normalizePages('remote')
    const p2 = s.addPage()
    expect(s.setPagePaper(p2.id, { paperSize: 'a4', paperStyle: 'grid' })).toBe(true)
    const page = s.page(p2.id)!
    expect(page.width).toBe(794)
    expect(page.height).toBe(1123)
    expect(page.paperStyle).toBe('grid')
    expect(page.y).toBeGreaterThan(0)
  })

  it('setPagePaper returns false for unknown page', () => {
    const s = new Store()
    s.normalizePages('remote')
    expect(s.setPagePaper('missing', { paperSize: 'a4' })).toBe(false)
  })

  it('insertPageAfter places the new sheet between neighbors', () => {
    const s = new Store()
    s.normalizePages('remote')
    const p1 = s.pages()[0]!
    const p3 = s.addPage({ paperSize: 'a4' })
    const p2 = s.insertPageAfter(p1.id, { paperSize: 'letter' })
    const ids = s.pages().map((p) => p.id)
    expect(ids).toEqual([p1.id, p2.id, p3.id])
    expect(s.page(p2.id)?.index).toBe(1)
    expect(s.page(p3.id)?.index).toBe(2)
  })

  it('setPageDocument throws on unknown page', () => {
    const s = new Store()
    s.normalizePages('remote')
    expect(() =>
      s.setPageDocument('missing', [{ type: 'paragraph', content: [{ text: 'x' }] }]),
    ).toThrow(/Unknown page/)
  })

  it('pageDocumentBlocks returns empty validated blocks for missing page', () => {
    const s = new Store()
    const blocks = s.pageDocumentBlocks('missing')
    expect(blocks.length).toBeGreaterThanOrEqual(1)
    expect(blocks[0]?.type).toBe('paragraph')
  })

  it('compat notebook APIs read/write the first page', () => {
    const s = new Store()
    s.normalizePages('remote')
    const first = s.pages()[0]!
    s.addPage()
    s.setNotebookDocument([{ type: 'paragraph', content: [{ text: 'Compat' }] }])
    expect(s.pageDocumentBlocks(first.id)[0] && 'content' in s.pageDocumentBlocks(first.id)[0]!
      ? (s.pageDocumentBlocks(first.id)[0] as { content: { text?: string }[] }).content[0]?.text
      : '').toBe('Compat')
  })

  it('cannot remove the last page', () => {
    const s = new Store()
    s.normalizePages('remote')
    expect(s.removePage(s.pages()[0]!.id)).toBe(false)
    expect(s.pages()).toHaveLength(1)
  })
})

describe('page.document v3 migration', () => {
  it('moves notebook.document onto page 0 and clears the notebook stream', () => {
    const input: Snapshot = {
      schema: {
        schemaVersion: 1,
        sequences: {
          'com.incantly.store': 1,
          'com.incantly.shape.text': 1,
          'com.incantly.page.document': 2,
          'com.incantly.notebook.document': 3,
        },
      },
      document: {
        store: {
          [NOTEBOOK_ID]: {
            id: NOTEBOOK_ID,
            typeName: 'notebook',
            pageLayout: 'vertical',
            document: {
              blocks: [{ type: 'paragraph', content: [{ text: 'Legacy stream' }] }],
            },
          },
          p1: {
            id: 'p1',
            typeName: 'page',
            index: 0,
            x: 0,
            y: 0,
            width: 816,
            height: 1056,
          },
          p2: {
            id: 'p2',
            typeName: 'page',
            index: 1,
            x: 0,
            y: 1104,
            width: 816,
            height: 1056,
          },
        },
      },
    }
    const result = migrateSnapshot(input)
    expect(result.schema).toEqual(CURRENT_SCHEMA)
    const nb = result.document.store[NOTEBOOK_ID] as { document?: unknown }
    expect(nb.document).toBeUndefined()
    const p1 = result.document.store.p1 as { document?: { blocks: { content?: { text?: string }[] }[] } }
    const p2 = result.document.store.p2 as { document?: { blocks: unknown[] } }
    expect(p1.document?.blocks?.some((b) => b.content?.[0]?.text === 'Legacy stream')).toBe(true)
    expect(p2.document?.blocks?.length).toBeGreaterThanOrEqual(1)
  })
})
