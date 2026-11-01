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
 *  8. Fields sit next to paragraphs, not inside them: "Page {n} of {N}" must read as one line.
 *  9. Marks and hard breaks inside header text: plain text drops marks, keeps the break.
 * 10. Strict validation must reject block content (headings, images, tables) in headers,
 *     unknown fields, unknown variant keys, a section without an ID, a starting number < 1
 *     or fractional, and columns other than 1 or 2.
 * 11. Duplicate paragraph IDs across variants are allowed (odd starts as a copy of default),
 *     duplicates inside one variant are not.
 * 12. Recovery must keep the layout (it used to drop it), downgrade block content to
 *     paragraphs, drop unknown fields, clamp the starting number and coerce columns.
 */
import { describe, expect, it } from 'vitest'
import {
  createDocument,
  formatHeaderFooterField,
  formatPageNumber,
  headerFooterDocumentTitle,
  headerFooterLines,
  headerFooterPlainText,
  normalizeHeaderFooterContent,
  recoverDocument,
  serializeIncantlyDocument,
  validateDocument,
  validateHeaderFooterContent,
  type HeaderFooterContent,
  type HeaderFooterField,
  type IncantlyDocument,
} from '../src/document/index.js'

const field = (name: string, format?: string): HeaderFooterField =>
  ({ type: 'field', field: name, ...(format ? { format } : {}) }) as HeaderFooterField
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

describe('headerFooterPlainText and headerFooterLines', () => {
  const pageOf = [
    { id: 'node:1', type: 'paragraph', attrs: { alignment: 'center' }, content: [{ type: 'text', text: 'Page ', marks: [{ type: 'bold' }] }] },
    field('pageNumber'),
    { id: 'node:2', type: 'paragraph', content: [{ type: 'text', text: ' of ' }] },
    field('pageCount'),
  ] as HeaderFooterContent[]
  const twoLines = [
    { id: 'node:3', type: 'paragraph', attrs: { alignment: 'right' }, content: [{ type: 'text', text: 'Draft', marks: [{ type: 'italic' }] }, { type: 'hardBreak' }, { type: 'text', text: 'v2' }] },
    { id: 'node:4', type: 'paragraph', content: [{ type: 'text', text: 'Lab copy' }] },
  ] as HeaderFooterContent[]

  it('reads "Page {n} of {N}" as one line with the first paragraph alignment (case 8)', () => {
    expect(headerFooterLines(pageOf, context)).toEqual({ lines: [{ alignment: 'center', text: 'Page 14 of 120' }], warnings: [] })
    expect(headerFooterPlainText(pageOf, context).text).toBe('Page 14 of 120')
  })

  it('starts a new line for a paragraph that follows a paragraph, drops marks and keeps hard breaks (case 9)', () => {
    expect(headerFooterLines(twoLines, context).lines).toEqual([
      { alignment: 'right', text: 'Draft\nv2' },
      { alignment: 'left', text: 'Lab copy' },
    ])
    expect(headerFooterPlainText(twoLines, context).text).toBe('Draft\nv2\nLab copy')
  })

  it('continues the line when a paragraph directly follows a field', () => {
    expect(headerFooterLines([...pageOf, ...twoLines], context).lines.map((line) => line.text))
      .toEqual(['Page 14 of 120Draft\nv2', 'Lab copy'])
  })

  it('renders plain text for previews and collects warnings', () => {
    expect(headerFooterPlainText([field('documentTitle'), field('wordCount')], context))
      .toEqual({ text: 'Coral bleaching survey', warnings: [expect.objectContaining({ code: 'unknown_field' })] })
    expect(headerFooterPlainText([], context)).toEqual({ text: '', warnings: [] })
  })

  it('starts a line with a field when nothing precedes it', () => {
    expect(headerFooterLines([field('pageNumber', 'lower-roman')], context).lines).toEqual([{ alignment: 'left', text: 'xiv' }])
  })
})

function documentWithFooter(footer: unknown, pageSetup: Record<string, unknown> = {}): IncantlyDocument {
  const base = createDocument({ id: 'document:hf', title: 'Footer test', now: '2026-11-01T00:00:00.000Z' })
  const setup = { ...base.metadata.pageSetup, mode: 'paginated', ...pageSetup }
  const section = { id: 'section-1', pageSetup: setup, footers: { default: footer } }
  return { ...base, metadata: { ...base.metadata, layout: { version: 1, defaultSection: section, sections: [section] } } } as unknown as IncantlyDocument
}

describe('header/footer validation (cases 10, 11)', () => {
  it('accepts paragraphs with marks, hard breaks, inline math and known fields', () => {
    const content = [
      { id: 'node:p', type: 'paragraph', attrs: { alignment: 'right' }, content: [{ type: 'text', text: 'Fig. ', marks: [{ type: 'italic' }] }, { type: 'hardBreak' }, { type: 'inlineMath', latex: 'x^2' }] },
      field('pageNumber', 'upper-roman'),
    ]

    expect(validateHeaderFooterContent(content)).toEqual([])
    expect(validateDocument(documentWithFooter(content)).issues).toEqual([])
  })

  it('rejects block content, unknown fields and bad formats', () => {
    const issues = validateHeaderFooterContent([
      { id: 'node:h', type: 'heading', attrs: { level: 1 }, content: [] },
      { id: 'node:i', type: 'image', attrs: { assetId: 'asset:1' } },
      field('wordCount'),
      { type: 'field', field: 'pageNumber', format: 7 },
      'text',
    ])

    expect(issues.map((entry) => [entry.code, entry.path])).toEqual([
      ['unsupported_content', '$[0].type'],
      ['unsupported_content', '$[1].type'],
      ['invalid_value', '$[2].field'],
      ['invalid_type', '$[3].format'],
      ['invalid_type', '$[4]'],
    ])
    expect(validateHeaderFooterContent('nope').map((entry) => entry.code)).toEqual(['invalid_type'])
  })

  it('rejects duplicate paragraph IDs inside one variant but not across variants', () => {
    const paragraph = { id: 'node:same', type: 'paragraph', content: [] }

    expect(validateHeaderFooterContent([paragraph, { ...paragraph }]).map((entry) => entry.code)).toEqual(['duplicate_node_id'])
    const document = documentWithFooter([paragraph]) as unknown as { metadata: { layout: { sections: Array<{ footers: Record<string, unknown> }> } } }
    document.metadata.layout.sections[0]!.footers.odd = [{ ...paragraph }]
    expect(validateDocument(document).issues).toEqual([])
  })

  it('rejects bad sections inside a stored layout', () => {
    const document = documentWithFooter([field('pageNumber')], { startingPageNumber: 0, columns: 3 }) as unknown as {
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

describe('header/footer normalization (case 12)', () => {
  it('downgrades block content to paragraphs, drops unknown fields and repairs IDs', () => {
    const result = normalizeHeaderFooterContent([
      { id: 'node:h', type: 'heading', attrs: { level: 2, alignment: 'center' }, content: [{ type: 'text', text: 'Title' }] },
      { id: 'node:t', type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'cell' }] }] }] }] },
      field('wordCount'),
      { type: 'field', field: 'pageNumber', format: 'x'.repeat(65) },
      { id: 'node:h', type: 'paragraph', content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] },
      { type: 'image', attrs: { assetId: 'asset:1' } },
    ])

    expect(result.content).toEqual([
      { id: 'node:h', type: 'paragraph', attrs: { alignment: 'center' }, content: [{ type: 'text', text: 'Title' }] },
      { id: 'node:t', type: 'paragraph', content: [{ type: 'text', text: 'cell' }] },
      { type: 'field', field: 'pageNumber' },
      { id: 'node:h~2', type: 'paragraph', content: [{ type: 'text', text: 'ab' }] },
    ])
    expect(result.issues.map((entry) => [entry.code, entry.path])).toEqual([
      ['unsupported_content', '$[0]'],
      ['unsupported_content', '$[1]'],
      ['unsupported_content', '$[2]'],
      ['limit_attribute', '$[3].format'],
      ['duplicate_node_id', '$[4].id'],
      ['unsupported_content', '$[5]'],
    ])
    expect(result.issues.every((entry) => entry.severity === 'warning')).toBe(true)
    expect(validateHeaderFooterContent(result.content)).toEqual([])
  })

  it('keeps the layout through recovery and serialization while repairing it', () => {
    const footer = [{ id: 'node:h', type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Page ' }] }, field('pageNumber'), field('wordCount')]
    const document = documentWithFooter(footer, { startingPageNumber: -2, columns: 4 })
    const recovered = recoverDocument(document)
    const section = recovered.document.metadata.layout!.sections[0]!

    expect(section.pageSetup).toMatchObject({ startingPageNumber: 1, columns: 1 })
    expect(section.footers?.default).toEqual([
      { id: 'node:h', type: 'paragraph', content: [{ type: 'text', text: 'Page ' }] },
      { type: 'field', field: 'pageNumber' },
    ])
    expect(recovered.document.metadata.layout!.defaultSection.id).toBe('section-1')
    expect(validateDocument(recovered.document).issues).toEqual([])

    const valid = recovered.document
    expect(JSON.parse(serializeIncantlyDocument(valid)).metadata.layout).toEqual(valid.metadata.layout)
  })

  it('rebuilds a layout with a missing default section or an unsupported version', () => {
    const base = documentWithFooter([field('pageNumber')]) as unknown as { metadata: { layout: Record<string, unknown> } }
    const missingDefault = recoverDocument({ ...base, metadata: { ...base.metadata, layout: { ...base.metadata.layout, defaultSection: undefined } } })
    const futureVersion = recoverDocument({ ...base, metadata: { ...base.metadata, layout: { ...base.metadata.layout, version: 2 } } })

    expect(missingDefault.document.metadata.layout?.defaultSection.id).toBe('section-1')
    expect(validateDocument(missingDefault.document).valid).toBe(true)
    expect(futureVersion.document.metadata.layout).toBeUndefined()
    expect(futureVersion.issues.map((entry) => entry.path)).toContain('$.metadata.layout.version')
  })
})
