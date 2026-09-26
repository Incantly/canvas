import { describe, expect, it } from 'vitest'
import {
  createDocument,
  createParagraph,
  documentNodeId,
  documentToHtml,
  exportMarkdown,
  normalizeDocumentNode,
  recoverDocument,
  validateDocument,
  type DocumentNode,
  type IncantlyDocument,
} from '../src/document/index.js'

const details = (summary = 'Summary', open?: boolean): DocumentNode => ({
  id: documentNodeId('node:details'),
  type: 'details',
  attrs: { summary, ...(open === true ? { open: true as const } : {}) },
  content: [createParagraph({ id: 'node:body', text: 'Hidden body' })],
})

const validDocument = (content: DocumentNode[]): IncantlyDocument =>
  createDocument({ id: 'document:test', content, now: '2026-09-20T10:00:00.000Z' })

describe('details node', () => {
  it('validates a well-formed details node', () => {
    const result = validateDocument(validDocument([details('Summary', true)]))

    expect(result.valid).toBe(true)
    expect(result.issues).toEqual([])
  })

  it('rejects a non-string summary and a non-boolean open flag', () => {
    const bad = details() as unknown as Record<string, unknown>
    ;(bad.attrs as Record<string, unknown>).summary = 42
    ;(bad.attrs as Record<string, unknown>).open = 'yes'

    const result = validateDocument(validDocument([bad as DocumentNode]))

    expect(result.valid).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '$.content[0].attrs.summary' }),
      expect.objectContaining({ path: '$.content[0].attrs.open' }),
    ]))
  })

  it('recovers missing attrs and normalizes summary whitespace', () => {
    const recovered = recoverDocument({
      schemaVersion: 1,
      id: 'document:test',
      type: 'document',
      metadata: { title: 't' },
      content: [{ id: 'node:details', type: 'details', attrs: { summary: '  Padded  ' }, content: [] }],
      createdAt: '2026-09-20T10:00:00.000Z',
      updatedAt: '2026-09-20T10:00:00.000Z',
    })

    expect(recovered.document.content[0]).toMatchObject({
      type: 'details',
      attrs: { summary: 'Padded' },
    })
    expect((recovered.document.content[0] as { content: unknown[] }).content).toHaveLength(1)
  })

  it('normalizes an open flag and keeps body paragraphs', () => {
    const normalized = normalizeDocumentNode(details('S', true))

    expect(normalized).toMatchObject({ type: 'details', attrs: { summary: 'S', open: true } })
  })

  it('renders HTML and markdown projections', () => {
    const document = validDocument([details('Summary', true)])

    expect(documentToHtml(document)).toContain('<details open><summary>Summary</summary>')
    const markdown = exportMarkdown(document)
    expect(markdown.output.kind).toBe('text')
    if (markdown.output.kind === 'text') expect(markdown.output.text).toContain('**Summary**')
  })
})
