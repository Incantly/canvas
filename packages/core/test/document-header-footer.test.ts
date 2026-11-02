/**
 * Header/footer fields, plain text, validation and normalization (roadmap 19, SDK-1).
 *
 * Failure cases, listed before the code was written:
 *  1. A number format that is unknown: print decimal and warn.
 *  2. Roman numerals for 0, negative numbers or numbers above 3999: print decimal and warn.
 *  3. `pageCount` is not known yet (live editor preview): print nothing and warn.
 *  4. The document has no title: print nothing and warn.
 *  5. An unknown field type (newer client, hand-edited JSON): print nothing and warn.
 *  6. `currentDate` with no date, a malformed date or an impossible date (2026-02-30): print nothing and warn.
 *  7. Date formats with literal letters that look like tokens: `[...]` escapes them.
 *  8. Each header/footer paragraph is one line; its inline fields print in place.
 *  9. Marks and hard breaks inside header text: plain text drops marks, keeps the break.
 * 10. Strict validation must reject block content (headings, images, tables) in headers,
 *     unknown fields, unknown variant keys, a section without an ID, a starting number < 1
 *     or fractional, and columns other than 1 or 2.
 * 11. Duplicate paragraph IDs across variants are allowed (odd starts as a copy of default),
 *     duplicates inside one variant are not.
 * 12. Recovery must keep the layout (it used to drop it), downgrade block content to
 *     paragraphs, drop unknown fields, clamp the starting number and coerce columns.
 *
 * Fields inside paragraph text (the model change after SDK-1):
 * 13. A field in body text: a validation error, and recovery removes it with a warning.
 * 14. An unknown inline field: a validation error, and normalization removes it with a warning.
 * 15. A format that is too long, inline or top-level: a validation error, and normalization
 *     removes the format but keeps the field.
 * 16. The item limit counts inline fields too.
 * 17. Old content with top-level fields still validates, renders and loads. Normalization joins
 *     each field to the paragraph line it belongs to:
 *     - a field first starts a paragraph (taking the ID and alignment of a paragraph that joins it);
 *     - a field last joins the paragraph before it;
 *     - two fields in a row stay on one line;
 *     - a field between paragraphs with different alignment makes one line with the first alignment.
 * 18. A new-form paragraph followed by an old top-level field still joins into one line.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  createDocument,
  formatHeaderFooterField,
  formatPageNumber,
  headerFooterDocumentTitle,
  headerFooterLines,
  headerFooterPlainText,
  normalizeHeaderFooterContent,
  parseIncantlyDocument,
  recoverDocument,
  serializeIncantlyDocument,
  validateDocument,
  validateHeaderFooterContent,
  MAX_HEADER_FOOTER_ITEMS,
  type HeaderFooterContent,
  type HeaderFooterField,
  type IncantlyDocument,
  type InlineFieldNode,
} from '../src/document/index.js'

const field = (name: string, format?: string): HeaderFooterField =>
  ({ type: 'field', field: name, ...(format ? { format } : {}) }) as HeaderFooterField
const inlineField = field as (name: string, format?: string) => InlineFieldNode
const text = (value: string, marks?: unknown[]) => ({ type: 'text', text: value, ...(marks ? { marks } : {}) })
const paragraph = (id: string, content: unknown[], alignment?: string) =>
  ({ id, type: 'paragraph', ...(alignment ? { attrs: { alignment } } : {}), content }) as unknown as HeaderFooterContent
const context = { pageNumber: 14, pageCount: 120, documentTitle: 'Coral bleaching survey', date: '2026-03-07' }

describe('formatPageNumber', () => {
  it('formats decimal and roman numerals', () => {
    expect(formatPageNumber(14).text).toBe('14')
    expect(formatPageNumber(14, 'decimal').text).toBe('14')
    expect(formatPageNumber(14, 'lower-roman').text).toBe('xiv')
    expect(formatPageNumber(1994, 'upper-roman').text).toBe('MCMXCIV')
    expect(formatPageNumber(3999, 'upper-roman').text).toBe('MMMCMXCIX')
  })

  it('falls back to decimal with a warning for unknown formats and unprintable roman numbers (cases 1, 2)', () => {
    expect(formatPageNumber(3, 'alpha')).toEqual({ text: '3', warnings: [expect.objectContaining({ code: 'unknown_format' })] })
    expect(formatPageNumber(4000, 'upper-roman')).toEqual({ text: '4000', warnings: [expect.objectContaining({ code: 'number_out_of_range' })] })
    expect(formatPageNumber(0, 'lower-roman')).toEqual({ text: '0', warnings: [expect.objectContaining({ code: 'number_out_of_range' })] })
  })
})

describe('formatHeaderFooterField', () => {
  it('renders every field type', () => {
    expect(formatHeaderFooterField(field('pageNumber', 'upper-roman'), context)).toEqual({ text: 'XIV', warnings: [] })
    expect(formatHeaderFooterField(field('pageCount'), context)).toEqual({ text: '120', warnings: [] })
    expect(formatHeaderFooterField(field('pageCount', 'lower-roman'), context).text).toBe('cxx')
    expect(formatHeaderFooterField(field('documentTitle'), context)).toEqual({ text: 'Coral bleaching survey', warnings: [] })
    expect(formatHeaderFooterField(field('currentDate'), context)).toEqual({ text: '2026-03-07', warnings: [] })
  })

  it('supports the documented date tokens and literal escapes (case 7)', () => {
    const date = (format: string, value = '2026-03-07') => formatHeaderFooterField(field('currentDate', format), { ...context, date: value }).text

    expect(date('D MMMM YYYY')).toBe('7 March 2026')
    expect(date('DD/MM/YY')).toBe('07/03/26')
    expect(date('MMM D, YYYY')).toBe('Mar 7, 2026')
    expect(date('M/D/YYYY')).toBe('3/7/2026')
    expect(date('[Date:] YYYY')).toBe('Date: 2026')
    expect(date('YYYY-MM-DD', '2026-11-01T23:30:00.000Z')).toBe('2026-11-01')
  })

  it('warns instead of guessing when the context is incomplete (cases 3, 4, 6)', () => {
    const missingCount = formatHeaderFooterField(field('pageCount'), { pageNumber: 1 })
    const missingTitle = formatHeaderFooterField(field('documentTitle'), { pageNumber: 1, documentTitle: '   ' })
    const missingDate = formatHeaderFooterField(field('currentDate'), { pageNumber: 1 })
    const badDate = formatHeaderFooterField(field('currentDate'), { pageNumber: 1, date: 'yesterday' })
    const impossibleDate = formatHeaderFooterField(field('currentDate'), { pageNumber: 1, date: '2026-02-30' })

    expect([missingCount, missingTitle, missingDate, badDate, impossibleDate].map((result) => [result.text, result.warnings.map((entry) => entry.code)])).toEqual([
      ['', ['page_count_unknown']],
      ['', ['document_title_empty']],
      ['', ['date_invalid']],
      ['', ['date_invalid']],
      ['', ['date_invalid']],
    ])
  })

  it('returns an empty string and a warning for an unknown field (case 5)', () => {
    expect(formatHeaderFooterField(field('wordCount'), context)).toEqual({ text: '', warnings: [expect.objectContaining({ code: 'unknown_field' })] })
  })

  it('takes the title from research metadata first, then the document title', () => {
    const document = createDocument({ id: 'document:title', title: '  Notes  ' })

    expect(headerFooterDocumentTitle(document)).toBe('Notes')
    expect(headerFooterDocumentTitle({ ...document, metadata: { ...document.metadata, research: { title: 'Paper title' } } })).toBe('Paper title')
    expect(headerFooterDocumentTitle({ ...document, metadata: { ...document.metadata, title: '' } })).toBe('')
  })
})


describe('headerFooterLines and headerFooterPlainText', () => {
  const pageOf = [paragraph('node:1', [text('Page ', [{ type: 'bold' }]), inlineField('pageNumber'), text(' of '), inlineField('pageCount')], 'center')]
  const twoLines = [
    paragraph('node:2', [text('Draft', [{ type: 'italic' }]), { type: 'hardBreak' }, text('v2')], 'right'),
    paragraph('node:3', [text('Chapter 2 — '), inlineField('documentTitle')]),
  ]

  it('prints inline fields in place, one line per paragraph (case 8)', () => {
    expect(headerFooterLines(pageOf, context)).toEqual({ lines: [{ alignment: 'center', text: 'Page 14 of 120' }], warnings: [] })
    expect(headerFooterPlainText(pageOf, context).text).toBe('Page 14 of 120')
  })

  it('drops marks and keeps hard breaks (case 9)', () => {
    expect(headerFooterLines(twoLines, context).lines).toEqual([
      { alignment: 'right', text: 'Draft\nv2' },
      { alignment: 'left', text: 'Chapter 2 — Coral bleaching survey' },
    ])
    expect(headerFooterPlainText(twoLines, context).text).toBe('Draft\nv2\nChapter 2 — Coral bleaching survey')
  })

  it('collects warnings from inline fields', () => {
    expect(headerFooterPlainText([paragraph('node:p', [inlineField('documentTitle'), inlineField('wordCount')])], context))
      .toEqual({ text: 'Coral bleaching survey', warnings: [expect.objectContaining({ code: 'unknown_field' })] })
    expect(headerFooterPlainText([], context)).toEqual({ text: '', warnings: [] })
  })

  it('renders old content with top-level fields by the line rule (case 17)', () => {
    const legacy = [
      paragraph('node:c', [text('Lab copy')]),
      paragraph('node:a', [text('Page ')], 'center'), field('pageNumber'), paragraph('node:b', [text(' of ')]), field('pageCount'),
    ]
    expect(headerFooterLines(legacy, context).lines).toEqual([
      { alignment: 'left', text: 'Lab copy' },
      { alignment: 'center', text: 'Page 14 of 120' },
    ])
    expect(headerFooterLines([field('pageNumber', 'lower-roman')], context).lines).toEqual([{ alignment: 'left', text: 'xiv' }])
  })
})

function documentWithFooter(footer: unknown, pageSetup: Record<string, unknown> = {}): IncantlyDocument {
  const base = createDocument({ id: 'document:hf', title: 'Footer test', now: '2026-11-01T00:00:00.000Z' })
  const setup = { ...base.metadata.pageSetup, mode: 'paginated', ...pageSetup }
  const section = { id: 'section-1', pageSetup: setup, footers: { default: footer } }
  return { ...base, metadata: { ...base.metadata, layout: { version: 1, defaultSection: section, sections: [section] } } } as unknown as IncantlyDocument
}

describe('header/footer validation (cases 10, 11, 14, 15, 16)', () => {
  it('accepts paragraphs with marks, hard breaks, inline math and inline fields', () => {
    const content = [paragraph('node:p', [text('Fig. ', [{ type: 'italic' }]), { type: 'hardBreak' }, { type: 'inlineMath', latex: 'x^2' }, inlineField('pageNumber', 'upper-roman')], 'right')]

    expect(validateHeaderFooterContent(content)).toEqual([])
    expect(validateDocument(documentWithFooter(content)).issues).toEqual([])
  })

  it('still accepts old top-level fields (case 17)', () => {
    const legacy = [paragraph('node:p', [text('Page ')]), field('pageNumber', 'lower-roman')]

    expect(validateHeaderFooterContent(legacy)).toEqual([])
    expect(validateDocument(documentWithFooter(legacy)).issues).toEqual([])
  })

  it('rejects block content, unknown fields and bad formats, top-level and inline', () => {
    const issues = validateHeaderFooterContent([
      { id: 'node:h', type: 'heading', attrs: { level: 1 }, content: [] },
      { id: 'node:i', type: 'image', attrs: { assetId: 'asset:1' } },
      field('wordCount'),
      { type: 'field', field: 'pageNumber', format: 7 },
      'text',
      paragraph('node:p', [inlineField('wordCount'), inlineField('pageNumber', 'x'.repeat(65)), { type: 'field', field: 'pageCount', format: 3 }]),
    ])

    expect(issues.map((entry) => [entry.code, entry.path])).toEqual([
      ['unsupported_content', '$[0].type'],
      ['unsupported_content', '$[1].type'],
      ['invalid_value', '$[2].field'],
      ['invalid_type', '$[3].format'],
      ['invalid_type', '$[4]'],
      ['invalid_value', '$[5].content[0].field'],
      ['limit_attribute', '$[5].content[1].format'],
      ['invalid_type', '$[5].content[2].format'],
    ])
    expect(validateHeaderFooterContent('nope').map((entry) => entry.code)).toEqual(['invalid_type'])
  })

  it('counts inline fields toward the item limit (case 16)', () => {
    const half = Math.ceil(MAX_HEADER_FOOTER_ITEMS / 2) + 1
    const content = Array.from({ length: half }, (_, index) => paragraph(`node:${index}`, [inlineField('pageNumber')]))

    expect(validateHeaderFooterContent(content.slice(0, Math.floor(MAX_HEADER_FOOTER_ITEMS / 2)))).toEqual([])
    expect(validateHeaderFooterContent(content).map((entry) => entry.code)).toEqual(['limit_attribute'])
  })

  it('rejects a field in body text (case 13)', () => {
    const document = createDocument({ id: 'document:body-field', now: '2026-11-01T00:00:00.000Z' })
    const withField = { ...document, content: [paragraph('node:body', [text('Page '), inlineField('pageNumber')])] }

    expect(validateDocument(withField).issues.map((entry) => [entry.code, entry.path])).toEqual([['invalid_child', '$.content[0].content[1].type']])
    const recovered = recoverDocument(withField)
    expect(recovered.document.content).toEqual([paragraph('node:body', [text('Page ')])])
    expect(recovered.issues.map((entry) => `${entry.severity} ${entry.code} ${entry.path}`)).toContain('warning unsupported_content $.content[0].content[1]')
  })

  it('rejects duplicate paragraph IDs inside one variant but not across variants (case 11)', () => {
    const same = paragraph('node:same', [])

    expect(validateHeaderFooterContent([same, { ...same }]).map((entry) => entry.code)).toEqual(['duplicate_node_id'])
    const document = documentWithFooter([same]) as unknown as { metadata: { layout: { sections: Array<{ footers: Record<string, unknown> }> } } }
    document.metadata.layout.sections[0]!.footers.odd = [{ ...same }]
    expect(validateDocument(document).issues).toEqual([])
  })

  it('rejects bad sections inside a stored layout (case 10)', () => {
    const document = documentWithFooter([paragraph('node:p', [inlineField('pageNumber')])], { startingPageNumber: 0, columns: 3 }) as unknown as {
      metadata: { layout: { defaultSection: Record<string, unknown>; sections: Array<Record<string, unknown>> } }
    }
    document.metadata.layout.sections = [
      { ...document.metadata.layout.defaultSection },
      { pageSetup: { ...(document.metadata.layout.defaultSection.pageSetup as object), startingPageNumber: 1.5 }, headers: { middle: [] } },
    ]
    const paths = validateDocument(document).issues.map((entry) => `${entry.code} ${entry.path}`)

    expect(paths).toEqual(expect.arrayContaining([
      'invalid_value $.metadata.layout.defaultSection.pageSetup.startingPageNumber',
      'invalid_value $.metadata.layout.defaultSection.pageSetup.columns',
      'invalid_value $.metadata.layout.sections[0].pageSetup.startingPageNumber',
      'missing_field $.metadata.layout.sections[1].id',
      'invalid_value $.metadata.layout.sections[1].pageSetup.startingPageNumber',
      'unknown_field $.metadata.layout.sections[1].headers.middle',
    ]))
    expect(validateDocument({ ...(document as object), metadata: { ...document.metadata, layout: { version: 1, sections: [] } } }).issues.map((entry) => entry.path))
      .toContain('$.metadata.layout.defaultSection')
  })
})

describe('header/footer normalization (cases 12, 14, 15, 16)', () => {
  it('downgrades block content to paragraphs, drops unknown fields and repairs IDs', () => {
    const result = normalizeHeaderFooterContent([
      { id: 'node:h', type: 'heading', attrs: { level: 2, alignment: 'center' }, content: [text('Title')] },
      { id: 'node:t', type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [text('cell')] }] }] }] },
      paragraph('node:h', [text('a'), text('b'), inlineField('wordCount'), inlineField('pageNumber', 'x'.repeat(65)), { type: 'field', field: 'pageCount', format: 3 }]),
      { type: 'image', attrs: { assetId: 'asset:1' } },
    ])

    expect(result.content).toEqual([
      paragraph('node:h', [text('Title')], 'center'),
      paragraph('node:t', [text('cell')]),
      paragraph('node:h~2', [text('ab'), inlineField('pageNumber'), inlineField('pageCount')]),
    ])
    expect(result.issues.map((entry) => [entry.code, entry.path])).toEqual([
      ['unsupported_content', '$[0]'],
      ['unsupported_content', '$[1]'],
      ['duplicate_node_id', '$[2].id'],
      ['unsupported_content', '$[2].content[2]'],
      ['limit_attribute', '$[2].content[3].format'],
      ['invalid_type', '$[2].content[4].format'],
      ['unsupported_content', '$[3]'],
    ])
    expect(result.issues.every((entry) => entry.severity === 'warning')).toBe(true)
    expect(validateHeaderFooterContent(result.content)).toEqual([])
  })

  it('cuts content at the item limit, counting inline fields (case 16)', () => {
    const content = Array.from({ length: MAX_HEADER_FOOTER_ITEMS }, (_, index) => paragraph(`node:${index}`, [text('p'), inlineField('pageNumber')]))
    const result = normalizeHeaderFooterContent(content)

    expect(result.content).toHaveLength(MAX_HEADER_FOOTER_ITEMS / 2)
    expect(result.issues.map((entry) => entry.code)).toEqual(['limit_attribute'])
    expect(validateHeaderFooterContent(result.content)).toEqual([])
  })

  it('keeps the layout through recovery and serialization while repairing it', () => {
    const footer = [{ id: 'node:h', type: 'heading', attrs: { level: 1 }, content: [text('Page ')] }, field('pageNumber'), field('wordCount')]
    const document = documentWithFooter(footer, { startingPageNumber: -2, columns: 4 })
    const recovered = recoverDocument(document)
    const section = recovered.document.metadata.layout!.sections[0]!

    expect(section.pageSetup).toMatchObject({ startingPageNumber: 1, columns: 1 })
    expect(section.footers?.default).toEqual([paragraph('node:h', [text('Page '), inlineField('pageNumber')])])
    expect(recovered.document.metadata.layout!.defaultSection.id).toBe('section-1')
    expect(validateDocument(recovered.document).issues).toEqual([])
    expect(JSON.parse(serializeIncantlyDocument(recovered.document)).metadata.layout).toEqual(recovered.document.metadata.layout)
  })

  it('rebuilds a layout with a missing default section or an unsupported version', () => {
    const base = documentWithFooter([paragraph('node:p', [inlineField('pageNumber')])]) as unknown as { metadata: { layout: Record<string, unknown> } }
    const missingDefault = recoverDocument({ ...base, metadata: { ...base.metadata, layout: { ...base.metadata.layout, defaultSection: undefined } } })
    const futureVersion = recoverDocument({ ...base, metadata: { ...base.metadata, layout: { ...base.metadata.layout, version: 2 } } })

    expect(missingDefault.document.metadata.layout?.defaultSection.id).toBe('section-1')
    expect(validateDocument(missingDefault.document).valid).toBe(true)
    expect(futureVersion.document.metadata.layout).toBeUndefined()
    expect(futureVersion.issues.map((entry) => entry.path)).toContain('$.metadata.layout.version')
  })
})

describe('old top-level fields convert to inline fields (cases 17, 18)', () => {
  const convert = (content: unknown[]) => normalizeHeaderFooterContent(content)

  it('starts a paragraph for a field that comes first, taking a joining paragraph\'s ID and alignment', () => {
    expect(convert([field('pageNumber')])).toEqual({ content: [paragraph('node:header-footer:1', [inlineField('pageNumber')])], issues: [] })
    expect(convert([field('pageNumber'), paragraph('node:of', [text(' of ')], 'right'), field('pageCount')]).content)
      .toEqual([paragraph('node:of', [inlineField('pageNumber'), text(' of '), inlineField('pageCount')], 'right')])
  })

  it('joins a field that comes last to the paragraph before it', () => {
    expect(convert([paragraph('node:a', [text('Page ')], 'center'), field('pageNumber', 'lower-roman')]))
      .toEqual({ content: [paragraph('node:a', [text('Page '), inlineField('pageNumber', 'lower-roman')], 'center')], issues: [] })
  })

  it('keeps two fields in a row on one line', () => {
    expect(convert([paragraph('node:a', [text('Draft ')]), field('documentTitle'), field('currentDate', 'YYYY')]).content)
      .toEqual([paragraph('node:a', [text('Draft '), inlineField('documentTitle'), inlineField('currentDate', 'YYYY')])])
  })

  it('makes one line with the first alignment for a field between paragraphs with different alignment', () => {
    const result = convert([
      paragraph('node:left', [text('Page ')], 'left'), field('pageNumber'), paragraph('node:right', [text(' (draft)')], 'right'),
      paragraph('node:next', [text('Second line')], 'right'),
    ])

    expect(result.content).toEqual([
      paragraph('node:left', [text('Page '), inlineField('pageNumber'), text(' (draft)')], 'left'),
      paragraph('node:next', [text('Second line')], 'right'),
    ])
    expect(headerFooterPlainText(result.content, context).text).toBe('Page 14 (draft)\nSecond line')
  })

  it('joins an old top-level field to a new-form paragraph that already has inline fields (case 18)', () => {
    expect(convert([paragraph('node:a', [text('Page '), inlineField('pageNumber')]), paragraph('node:b', [text(' of ')]), field('pageCount')]).content)
      .toEqual([paragraph('node:a', [text('Page '), inlineField('pageNumber')]), paragraph('node:b', [text(' of '), inlineField('pageCount')])])
  })

  it('loads the old-format fixture unchanged and normalizes it to the new-format fixture', () => {
    const load = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/documents/${name}`, import.meta.url), 'utf8')) as IncantlyDocument
    const legacy = load('v1-pages-legacy-fields.json')
    const current = load('v1-pages-headers-footers.json')

    expect(validateDocument(legacy).issues).toEqual([])
    expect(parseIncantlyDocument(legacy).document).toEqual(legacy)
    const serialized = JSON.parse(serializeIncantlyDocument(legacy)) as IncantlyDocument
    expect(serialized.metadata.layout).toEqual(current.metadata.layout)
    expect(serialized.content).toEqual(current.content)
  })
})
