import { describe, expect, it } from 'vitest'
import { Store } from '../src/store.js'
import {
  applyPageDocumentOverflow,
  isVisuallyEmptyPage,
  paginateBlocks,
  planPageOverflow,
  splitBlocksToFitContent,
} from '../src/page-document-paginate.js'
import type { DocumentBlock, TextBlock } from '../src/rich-text/types.js'
import { PAGE_DOC_MARGIN_X, PAGE_DOC_MARGIN_Y } from '../src/page-document-layout.js'

function para(text: string): TextBlock {
  return { type: 'paragraph', content: [{ text }] }
}

describe('splitBlocksToFitContent', () => {
  it('keeps short blocks on the page', () => {
    const blocks: DocumentBlock[] = [para('One'), para('Two')]
    const { fitting, overflow } = splitBlocksToFitContent(blocks, 400, 800)
    expect(overflow).toHaveLength(0)
    expect(fitting.filter((b) => b.type === 'paragraph')).toHaveLength(2)
  })

  it('moves later paragraphs to overflow', () => {
    const blocks: DocumentBlock[] = [para('First'), para('Second'), para('Third')]
    const { fitting, overflow } = splitBlocksToFitContent(blocks, 400, 40)
    expect(fitting.some((b) => b.type === 'paragraph')).toBe(true)
    expect(overflow.length).toBeGreaterThan(0)
  })

  it('splits a giant paragraph mid-text', () => {
    const long = 'word '.repeat(400)
    const { fitting, overflow } = splitBlocksToFitContent([para(long)], 320, 80)
    const fitText = fitting
      .filter((b): b is TextBlock => b.type !== 'drawing' && b.type !== 'image')
      .map((b) => b.content.map((s) => s.text).join(''))
      .join('')
    const overText = overflow
      .filter((b): b is TextBlock => b.type !== 'drawing' && b.type !== 'image')
      .map((b) => b.content.map((s) => s.text).join(''))
      .join('')
    expect(fitText.length).toBeGreaterThan(0)
    expect(overText.length).toBeGreaterThan(0)
    expect((fitText + overText).replace(/\s+/g, ' ').trim().length).toBeGreaterThan(100)
  })

  it('keeps drawing on the current page', () => {
    const blocks: DocumentBlock[] = [
      para('x'.repeat(800)),
      { type: 'drawing', height: 40, strokes: [] },
    ]
    const { fitting } = splitBlocksToFitContent(blocks, 200, 50)
    expect(fitting.some((b) => b.type === 'drawing')).toBe(true)
  })
})

describe('planPageOverflow', () => {
  it('uses an empty next page instead of inserting', () => {
    const current = [para('alpha'), para('bravo')]
    const plan = planPageOverflow(current, 400, 50, [para('')])
    expect(plan.changed).toBe(true)
    expect(plan.next?.length).toBeGreaterThan(0)
    expect(plan.extraPages).toHaveLength(0)
  })

  it('inserts extra pages when the next page has content', () => {
    const current = [para('alpha'), para('bravo'), para('charlie')]
    const plan = planPageOverflow(current, 400, 40, [para('Keep me')])
    expect(plan.extraPages.length).toBeGreaterThan(0)
    expect(plan.next).toBeUndefined()
  })

  it('does not change a page that already fits', () => {
    const current = [para('short')]
    const plan = planPageOverflow(current, 400, 800, null)
    expect(plan.changed).toBe(false)
    expect(plan.extraPages).toHaveLength(0)
  })
})

describe('paginateBlocks', () => {
  it('chunks overflow into multiple pages', () => {
    const blocks = Array.from({ length: 20 }, (_, i) => para(`Paragraph ${i} ${'text '.repeat(20)}`))
    const pages = paginateBlocks(blocks, 300, 90)
    expect(pages.length).toBeGreaterThan(1)
  })
})

describe('applyPageDocumentOverflow', () => {
  it('creates the next page when typing past the sheet', () => {
    const s = new Store()
    s.normalizePages('remote')
    const p1 = s.pages()[0]!
    const tall: DocumentBlock[] = Array.from({ length: 40 }, (_, i) =>
      para(`Line ${i} — ${'overflow '.repeat(12)}`),
    )
    s.setPageDocument(p1.id, tall)
    const result = applyPageDocumentOverflow(s, p1.id)
    expect(result.changed).toBe(true)
    expect(s.pages().length).toBeGreaterThan(1)
    const first = s.pageDocumentBlocks(p1.id)
    const rectH = p1.height - PAGE_DOC_MARGIN_Y - PAGE_DOC_MARGIN_X
    const firstText = first.filter((b) => b.type !== 'drawing')
    expect(firstText.length).toBeLessThan(tall.length)
    expect(isVisuallyEmptyPage(s.pageDocumentBlocks(s.pages()[1]!.id))).toBe(false)
    expect(rectH).toBeGreaterThan(200)
  })

  it('inserts between pages when page 2 already has notes', () => {
    const s = new Store()
    s.normalizePages('remote')
    const p1 = s.pages()[0]!
    const p2 = s.addPage({ paperSize: 'letter' })
    s.setPageDocument(p2.id, [para('Existing page two')])
    s.setPageDocument(
      p1.id,
      Array.from({ length: 40 }, (_, i) => para(`Overflow ${i} ${'x'.repeat(40)}`)),
    )
    applyPageDocumentOverflow(s, p1.id)
    const pages = s.pages()
    expect(pages.length).toBeGreaterThan(2)
    expect(s.pageDocumentBlocks(p2.id)[0] && 'content' in s.pageDocumentBlocks(p2.id)[0]!
      ? (s.pageDocumentBlocks(p2.id)[0] as TextBlock).content[0]?.text
      : '').toBe('Existing page two')
    expect(pages[1]!.id).not.toBe(p2.id)
  })

  it('throws nothing and no-ops for a missing page', () => {
    const s = new Store()
    s.normalizePages('remote')
    expect(applyPageDocumentOverflow(s, 'missing')).toEqual({
      changed: false,
      createdPageIds: [],
    })
  })

  it('respects contentInsetBottom when deciding overflow', () => {
    const s = new Store()
    s.normalizePages('remote')
    const p1 = s.pages()[0]!
    const blocks: DocumentBlock[] = Array.from({ length: 12 }, (_, i) =>
      para(`Inset line ${i} ${'text '.repeat(18)}`),
    )
    s.setPageDocument(p1.id, blocks)
    const withInset = applyPageDocumentOverflow(s, p1.id, 'user', {
      contentInsetBottom: 700,
    })
    expect(withInset.changed).toBe(true)
    expect(s.pages().length).toBeGreaterThan(1)
  })
})
