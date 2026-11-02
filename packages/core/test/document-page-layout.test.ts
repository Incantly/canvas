/**
 * Page layout helpers (roadmap 19, SDK-1).
 *
 * Failure cases, listed before the code was written:
 *  1. The document has no `metadata.layout`: fall back to `metadata.pageSetup` as one section.
 *  2. The layout has an empty `sections` array: fall back to `defaultSection`.
 *  3. A later section points at a block that no longer exists, or at a nested block: drop it with a warning.
 *  4. A later section has no `startNodeId`: drop it with a warning.
 *  5. Sections are stored out of document order: order them by where they start.
 *  6. Two sections share an ID, or start at the same block: keep the first with a warning.
 *  7. The document content is empty: one section, no start block.
 *  8. A custom size without width/height slips past validation: fall back to the document setup, never throw.
 *  9. `startingPageNumber` is zero, negative or fractional: clamp to an integer >= 1.
 * 10. `columns` is not 1 or 2: coerce to 1.
 * 11. A later section with no `startingPageNumber` continues numbering; one with it restarts.
 * 12. Page counts that are negative, fractional, or the wrong length: throw instead of numbering wrongly.
 * 13. A section with no headers or footers: no variant, empty content.
 * 14. `first` is set without `default`: page 1 uses `first`, later pages show nothing.
 * 15. `first` is an empty array: page 1 is intentionally blank, not "fall back to default".
 * 16. Odd/even with an even starting number: page 1 of the section prints as 2 and uses `even`.
 * 17. Only `odd` is set: even pages fall back to `default`.
 * 18. Builders must never mutate their input, and must reject unknown sections and unsafe content.
 * 19. `defaultSection` and `sections[n]` with the same ID are separate copies after JSON storage: update both.
 * 20. Turning odd/even off must not lose the content written for odd pages.
 * 21. Fixtures must round-trip through validate, parse and serialize without losing the layout.
 * 22. Builders given old top-level fields must store the current form (fields inside paragraph text).
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  PageLayoutError,
  createDocument,
  createPageLayout,
  ensurePageLayout,
  headerFooterFor,
  headerFooterOptions,
  headerFooterPlainText,
  normalizeDocument,
  normalizePageSetup,
  numberPages,
  parseIncantlyDocument,
  resolvePageLayout,
  serializeIncantlyDocument,
  setDifferentFirstPage,
  setDifferentOddEven,
  setHeaderFooter,
  validateDocument,
  type DocumentNode,
  type HeaderFooterContent,
  type IncantlyDocument,
  type PageLayout,
  type PageLayoutSection,
  type PageSetup,
} from '../src/document/index.js'

const fixtureNames = ['v1-pages-custom-paper.json', 'v1-pages-headers-footers.json', 'v1-pages-sections.json'] as const
const loadFixture = (name: typeof fixtureNames[number]): IncantlyDocument =>
  JSON.parse(readFileSync(new URL(`./fixtures/documents/${name}`, import.meta.url), 'utf8')) as IncantlyDocument

const paragraph = (id: string, text: string): DocumentNode =>
  ({ id, type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }) as DocumentNode

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

function documentWith(content: DocumentNode[], layout?: PageLayout, pageSetup: Partial<PageSetup> = {}): IncantlyDocument {
  const document = createDocument({ id: 'document:layout', title: 'Layout test', now: '2026-11-01T00:00:00.000Z' })
  return {
    ...document,
    content,
    metadata: { ...document.metadata, pageSetup: { ...document.metadata.pageSetup, ...pageSetup }, ...(layout ? { layout } : {}) },
  }
}

const portrait = (overrides: Partial<PageSetup> = {}): PageSetup => ({
  mode: 'paginated', size: 'a4', orientation: 'portrait', margins: { top: 72, right: 72, bottom: 72, left: 72 }, columns: 1, ...overrides,
})

const section = (id: string, startNodeId?: string, overrides: Partial<PageLayoutSection> = {}): PageLayoutSection =>
  ({ id, ...(startNodeId ? { startNodeId } : {}), pageSetup: portrait(), ...overrides }) as PageLayoutSection

const blocks = ['node:a', 'node:b', 'node:c', 'node:d'].map((id) => paragraph(id, id))

describe('resolvePageLayout', () => {
  it('falls back to metadata.pageSetup when the document has no layout (case 1)', () => {
    const document = documentWith(blocks, undefined, { mode: 'paginated', size: 'letter', startingPageNumber: 3, mirroredMargins: true })
    const resolved = resolvePageLayout(document)

    expect(resolved.mode).toBe('paginated')
    expect(resolved.warnings).toEqual([])
    expect(resolved.sections).toHaveLength(1)
    expect(resolved.sections[0]).toMatchObject({ id: 'section-1', index: 0, startIndex: 0, startNodeId: 'node:a' })
    expect(resolved.sections[0]!.pageSetup).toMatchObject({ size: 'letter', startingPageNumber: 3, mirroredMargins: true, headerDistance: 36, footerDistance: 36 })
    expect(resolved.defaultSection.pageSetup).toEqual(resolved.sections[0]!.pageSetup)
  })

  it('uses defaultSection when the stored section list is empty (case 2)', () => {
    const layout: PageLayout = { version: 1, defaultSection: section('only', undefined, { pageSetup: portrait({ orientation: 'landscape' }) }), sections: [] }
    const resolved = resolvePageLayout(documentWith(blocks, layout))

    expect(resolved.sections.map((entry) => entry.id)).toEqual(['only'])
    expect(resolved.sections[0]!.pageSetup.orientation).toBe('landscape')
  })

  it('orders sections by document position and drops ones that cannot start anywhere (cases 3, 4, 5, 6)', () => {
    const nested = { id: 'node:quote', type: 'blockquote', content: [paragraph('node:nested', 'inside')] } as DocumentNode
    const layout: PageLayout = {
      version: 1,
      defaultSection: section('s1'),
      sections: [
        section('s1', 'node:b'),
        section('late', 'node:d'),
        section('early', 'node:c'),
        section('gone', 'node:deleted'),
        section('nested', 'node:nested'),
        section('floating'),
        section('late'),
        section('twin', 'node:c'),
      ],
    }
    const resolved = resolvePageLayout(documentWith([...blocks, nested], layout))

    expect(resolved.sections.map((entry) => [entry.id, entry.startIndex, entry.startNodeId])).toEqual([
      ['s1', 0, 'node:a'],
      ['early', 2, 'node:c'],
      ['late', 3, 'node:d'],
    ])
    expect(resolved.sections.map((entry) => entry.index)).toEqual([0, 1, 2])
    expect(resolved.warnings.map((warning) => [warning.code, warning.sectionId])).toEqual([
      ['section_start_missing', 'gone'],
      ['section_start_missing', 'nested'],
      ['section_start_missing', 'floating'],
      ['section_id_duplicate', 'late'],
      ['section_start_duplicate', 'twin'],
    ])
  })

  it('handles an empty document (case 7)', () => {
    const layout = { ...createPageLayout(portrait()), sections: [section('section-1'), section('s2', 'node:x')] }
    const resolved = resolvePageLayout(documentWith([], layout))

    expect(resolved.sections).toHaveLength(1)
    expect(resolved.sections[0]!.startNodeId).toBeUndefined()
    expect(resolved.sections[0]!.startIndex).toBe(0)
    expect(resolved.warnings.map((warning) => warning.code)).toEqual(['section_start_missing'])
  })

  it('never throws on a custom size without dimensions (case 8)', () => {
    const broken = { ...portrait(), size: 'custom' } as PageSetup
    const layout: PageLayout = { version: 1, defaultSection: section('s1', undefined, { pageSetup: broken }), sections: [section('s1', undefined, { pageSetup: broken })] }
    const resolved = resolvePageLayout(documentWith(blocks, layout, { size: 'letter' }))

    expect(resolved.sections[0]!.pageSetup.size).toBe('letter')
    expect(resolved.warnings.map((warning) => warning.code)).toContain('invalid_page_setup')
  })

  it('takes the view mode from the document and clamps numbering and columns (cases 9, 10)', () => {
    const layout: PageLayout = {
      version: 1,
      defaultSection: section('s1'),
      sections: [
        section('s1', undefined, { pageSetup: portrait({ mode: 'continuous', startingPageNumber: -4, columns: 3 as 1 }) }),
        section('s2', 'node:c', { pageSetup: portrait({ startingPageNumber: 7.8 }) }),
      ],
    }
    const resolved = resolvePageLayout(documentWith(blocks, layout, { mode: 'paginated' }))

    expect(resolved.sections.map((entry) => entry.pageSetup.mode)).toEqual(['paginated', 'paginated'])
    expect(resolved.sections[0]!.pageSetup).toMatchObject({ startingPageNumber: 1, columns: 1 })
    expect(resolved.sections[1]!.pageSetup.startingPageNumber).toBe(7)
  })

  it('uses the document starting number for the first section and continues later sections unless they restart (case 11)', () => {
    const layout: PageLayout = {
      version: 1,
      defaultSection: section('s1'),
      sections: [section('s1'), section('s2', 'node:b'), section('s3', 'node:c', { pageSetup: portrait({ startingPageNumber: 1 }) })],
    }
    const resolved = resolvePageLayout(documentWith(blocks, layout, { startingPageNumber: 9 }))

    expect(resolved.sections.map((entry) => entry.pageSetup.startingPageNumber)).toEqual([9, undefined, 1])
  })
})

describe('numberPages', () => {
  const layout: PageLayout = {
    version: 1,
    defaultSection: section('front'),
    sections: [section('front'), section('body', 'node:b'), section('appendix', 'node:c', { pageSetup: portrait({ startingPageNumber: 1 }) })],
  }
  const resolved = resolvePageLayout(documentWith(blocks, layout, { startingPageNumber: 5 }))

  it('numbers pages across continuing and restarting sections (case 11)', () => {
    const pages = numberPages(resolved, [2, 3, 2])

    expect(pages.map((page) => [page.sectionId, page.pageIndexInSection, page.absolutePageNumber, page.printedPageNumber])).toEqual([
      ['front', 0, 1, 5], ['front', 1, 2, 6],
      ['body', 0, 3, 7], ['body', 1, 4, 8], ['body', 2, 5, 9],
      ['appendix', 0, 6, 1], ['appendix', 1, 7, 2],
    ])
  })

  it('rejects bad page counts instead of numbering wrongly (case 12)', () => {
    expect(() => numberPages(resolved, [1, 1])).toThrow(RangeError)
    expect(() => numberPages(resolved, [1, -1, 1])).toThrow(RangeError)
    expect(() => numberPages(resolved, [1, 1.5, 1])).toThrow(RangeError)
    expect(numberPages(resolved, [0, 0, 0])).toEqual([])
  })
})

describe('headerFooterFor', () => {
  const text = (value: string): HeaderFooterContent[] => [paragraph(`node:${value}`, value)]
  const page = (pageIndexInSection: number, printedPageNumber: number, kind: 'header' | 'footer' = 'header') =>
    ({ kind, pageIndexInSection, printedPageNumber })

  it('returns nothing for a section with no headers (case 13)', () => {
    expect(headerFooterFor(section('s'), page(0, 1))).toEqual({ variant: null, content: [] })
    expect(headerFooterFor(section('s', undefined, { headers: {} }), page(3, 4))).toEqual({ variant: null, content: [] })
  })

  it('uses first only on the first page of the section when default is missing (case 14)', () => {
    const target = section('s', undefined, { headers: { first: text('cover') } })

    expect(headerFooterFor(target, page(0, 1))).toEqual({ variant: 'first', content: text('cover') })
    expect(headerFooterFor(target, page(1, 2))).toEqual({ variant: null, content: [] })
  })

  it('treats an empty first variant as a deliberately blank first page (case 15)', () => {
    const target = section('s', undefined, { footers: { default: text('page'), first: [] } })

    expect(headerFooterFor(target, page(0, 1, 'footer'))).toEqual({ variant: 'first', content: [] })
    expect(headerFooterFor(target, page(1, 2, 'footer')).variant).toBe('default')
  })

  it('decides odd and even from the printed number, including an even start (case 16)', () => {
    const fixture = loadFixture('v1-pages-headers-footers.json')
    const resolved = resolvePageLayout(fixture)
    const [main] = resolved.sections
    const pages = numberPages(resolved, [4])
    const context = { documentTitle: fixture.metadata.title, pageCount: 4, date: '2026-11-01' }

    const headers = pages.map((entry) => headerFooterFor(main!, { ...entry, kind: 'header' }))
    const footers = pages.map((entry) => headerFooterFor(main!, { ...entry, kind: 'footer' }))

    expect(pages.map((entry) => entry.printedPageNumber)).toEqual([2, 3, 4, 5])
    expect(headers.map((entry) => entry.variant)).toEqual(['first', 'odd', 'even', 'odd'])
    expect(footers.map((entry) => entry.variant)).toEqual(['first', 'odd', 'even', 'odd'])
    expect(pages.map((entry, index) => headerFooterPlainText(footers[index]!.content, { ...context, pageNumber: entry.printedPageNumber }).text))
      .toEqual(['Submitted 2026-11-01', 'Page 3 of 4', 'Page IV', 'Page 5 of 4'])
    expect(headerFooterPlainText(headers[2]!.content, { ...context, pageNumber: 4 }).text).toBe('Thesis chapter 3 — draft of 1 November 2026')
  })

  it('falls back to default on even pages when only odd is set (case 17)', () => {
    const target = section('s', undefined, { headers: { default: text('both'), odd: text('odd') } })

    expect(headerFooterFor(target, page(1, 2)).variant).toBe('default')
    expect(headerFooterFor(target, page(2, 3)).variant).toBe('odd')
  })

  it('rejects page positions that cannot exist', () => {
    expect(() => headerFooterFor(section('s'), page(-1, 1))).toThrow(RangeError)
    expect(() => headerFooterFor(section('s'), page(0, 0))).toThrow(RangeError)
    expect(() => headerFooterFor(section('s'), { kind: 'side' as 'header', pageIndexInSection: 0, printedPageNumber: 1 })).toThrow(RangeError)
  })
})

describe('layout builders', () => {
  const base = (): PageLayout => {
    const layout = JSON.parse(JSON.stringify({
      version: 1,
      defaultSection: section('main', undefined, { headers: { default: [paragraph('node:h', 'Head')] } }),
      sections: [
        section('main', undefined, { headers: { default: [paragraph('node:h', 'Head')] } }),
        section('appendix', 'node:c'),
      ],
    })) as PageLayout
    return deepFreeze(layout)
  }
  const footer = [{ id: 'node:f', type: 'paragraph', attrs: { alignment: 'center' }, content: [{ type: 'text', text: 'Page ' }, { type: 'field', field: 'pageNumber' }] }] as HeaderFooterContent[]

  it('sets a variant without mutating, on both copies of the default section (cases 18, 19)', () => {
    const input = base()
    const snapshot = JSON.stringify(input)
    const next = setHeaderFooter(input, 'main', 'footer', 'default', footer)

    expect(JSON.stringify(input)).toBe(snapshot)
    expect(next.defaultSection.footers?.default).toEqual(footer)
    expect(next.sections[0]!.footers?.default).toEqual(footer)
    expect(next.sections[1]).toBe(input.sections[1])
    expect(next.defaultSection.footers?.default).not.toBe(footer)
  })

  it('stores old top-level fields in the current form, inside the paragraph text', () => {
    const legacy = [paragraph('node:f', 'Page '), { type: 'field', field: 'pageNumber' }] as HeaderFooterContent[]
    const next = setHeaderFooter(base(), 'main', 'footer', 'default', legacy)

    expect(next.sections[0]!.footers?.default).toEqual([
      { id: 'node:f', type: 'paragraph', content: [{ type: 'text', text: 'Page ' }, { type: 'field', field: 'pageNumber' }] },
    ])
  })

  it('removes a variant and an emptied variant set', () => {
    const next = setHeaderFooter(base(), 'main', 'header', 'default', undefined)

    expect(next.defaultSection.headers).toBeUndefined()
    expect(next.sections[0]!.headers).toBeUndefined()
  })

  it('rejects unknown sections, kinds, variants and block content in headers (case 18)', () => {
    const heading = { id: 'node:x', type: 'heading', attrs: { level: 1 }, content: [] } as unknown as HeaderFooterContent

    expect(() => setHeaderFooter(base(), 'missing', 'header', 'default', footer)).toThrow(PageLayoutError)
    expect(() => setHeaderFooter(base(), 'main', 'side' as 'header', 'default', footer)).toThrow(PageLayoutError)
    expect(() => setHeaderFooter(base(), 'main', 'header', 'middle' as 'default', footer)).toThrow(PageLayoutError)
    try {
      setHeaderFooter(base(), 'main', 'header', 'default', [heading, { type: 'field', field: 'wordCount' } as unknown as HeaderFooterContent])
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(PageLayoutError)
      expect((error as PageLayoutError).code).toBe('invalid_header_footer_content')
      expect((error as PageLayoutError).issues.map((entry) => entry.path)).toEqual(['$[0].type', '$[1].field'])
    }
  })

  it('toggles a different first page and keeps existing first content when turned on again', () => {
    const on = setDifferentFirstPage(base(), 'appendix', true)

    expect(on.sections[1]!.headers).toEqual({ first: [] })
    expect(on.sections[1]!.footers).toEqual({ first: [] })
    expect(headerFooterOptions(on.sections[1]!)).toEqual({ differentFirstPage: true, differentOddEven: false })

    const filled = setHeaderFooter(on, 'appendix', 'header', 'first', footer)
    expect(setDifferentFirstPage(filled, 'appendix', true).sections[1]!.headers?.first).toEqual(footer)

    const off = setDifferentFirstPage(filled, 'appendix', false)
    expect(off.sections[1]!.headers).toBeUndefined()
    expect(off.sections[1]!.footers).toBeUndefined()
    expect(headerFooterOptions(off.sections[1]!).differentFirstPage).toBe(false)
  })

  it('turns odd/even on from the default content and off without losing odd content (case 20)', () => {
    const on = setDifferentOddEven(base(), 'main', true)

    expect(on.defaultSection.headers).toEqual({ default: [paragraph('node:h', 'Head')], odd: [paragraph('node:h', 'Head')], even: [] })
    expect(on.sections[0]!.footers).toEqual({ odd: [], even: [] })
    expect(headerFooterOptions(on.sections[0]!).differentOddEven).toBe(true)

    const edited = setHeaderFooter(on, 'main', 'header', 'odd', [paragraph('node:o', 'Odd only')])
    const off = setDifferentOddEven(edited, 'main', false)

    expect(off.sections[0]!.headers).toEqual({ default: [paragraph('node:o', 'Odd only')] })
    expect(off.sections[0]!.footers).toBeUndefined()
    expect(headerFooterOptions(off.sections[0]!).differentOddEven).toBe(false)
  })

  it('ensurePageLayout creates a one-section layout from the page setup when none is stored', () => {
    const document = documentWith(blocks, undefined, { startingPageNumber: 4 })
    const layout = ensurePageLayout(document)

    expect(layout.sections).toHaveLength(1)
    expect(layout.defaultSection.pageSetup).toEqual(normalizePageSetup(document.metadata.pageSetup))
    const withLayout = documentWith(blocks, layout)
    expect(ensurePageLayout(withLayout)).toBe(layout)
  })
})

describe('page layout fixtures (case 21)', () => {
  it.each(fixtureNames)('%s validates, parses unchanged and survives serialization', (name) => {
    const fixture = loadFixture(name)

    expect(validateDocument(fixture).issues).toEqual([])
    const parsed = parseIncantlyDocument(fixture)
    expect(parsed.ok).toBe(true)
    expect(parsed.document).toEqual(fixture)

    const serialized = serializeIncantlyDocument(fixture)
    expect(JSON.parse(serialized)).toEqual(fixture)
    expect(serializeIncantlyDocument(parseIncantlyDocument(serialized).document!)).toBe(serialized)
    expect(normalizeDocument(fixture)).toEqual(fixture)
  })

  it('covers every layout feature the plan lists', () => {
    const custom = resolvePageLayout(loadFixture('v1-pages-custom-paper.json'))
    const headers = loadFixture('v1-pages-headers-footers.json')
    const sections = resolvePageLayout(loadFixture('v1-pages-sections.json'))
    const variants = headers.metadata.layout!.sections[0]!

    expect(custom.sections[0]!.pageSetup).toMatchObject({ size: 'custom', width: 432, height: 648, mirroredMargins: true, startingPageNumber: 5 })
    expect(Object.keys(variants.headers!).sort()).toEqual(['default', 'even', 'first', 'odd'])
    expect(Object.keys(variants.footers!).sort()).toEqual(['default', 'even', 'first', 'odd'])
    expect(headers.content.filter((node) => node.type === 'pageBreak')).toHaveLength(2)
    expect(sections.sections.map((entry) => [entry.pageSetup.orientation, entry.pageSetup.columns])).toEqual([['portrait', 1], ['landscape', 2]])
    expect(sections.warnings).toEqual([])

    const pages = numberPages(sections, [2, 2])
    const footers = pages.map((entry) => headerFooterPlainText(
      headerFooterFor(sections.sections[entry.sectionIndex]!, { ...entry, kind: 'footer' }).content,
      { pageNumber: entry.printedPageNumber },
    ).text)
    expect(footers).toEqual(['Page 1', 'Page 2', 'A-I', 'A-II'])
  })
})
