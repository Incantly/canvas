import { describe, expect, it } from 'vitest'
import {
  createDocument,
  createParagraph,
  documentNodeId,
  documentToHtml,
  exportMarkdown,
  exportText,
  normalizeDocumentNode,
  recoverDocument,
  validateDocument,
  type DocumentNode,
  type IncantlyDocument,
} from '../src/document/index.js'

const sentence = (): DocumentNode => ({
  id: documentNodeId('node:sentence'),
  type: 'paragraph',
  content: [
    { type: 'text', text: 'Energy is ' },
    { type: 'inlineMath', latex: 'E=mc^2' },
    { type: 'text', text: ' here.' },
  ],
})

const validDocument = (content: DocumentNode[]): IncantlyDocument =>
  createDocument({ id: 'document:test', content, now: '2026-09-20T10:00:00.000Z' })

describe('inline math node', () => {
  it('validates inline math inside a paragraph', () => {
    const result = validateDocument(validDocument([sentence()]))

    expect(result.valid).toBe(true)
    expect(result.issues).toEqual([])
  })

  it('rejects empty or non-string latex', () => {
    const bad = sentence() as unknown as { content: Array<Record<string, unknown>> }
    bad.content[1].latex = ''

    const result = validateDocument(validDocument([sentence() as DocumentNode, bad as unknown as DocumentNode]))

    expect(result.valid).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '$.content[1].content[1].latex' }),
    ]))
  })

  it('recovers inline math and drops empty latex', () => {
    const recovered = recoverDocument({
      schemaVersion: 1,
      id: 'document:test',
      type: 'document',
      metadata: { title: 't' },
      content: [{
        id: 'node:p', type: 'paragraph',
        content: [
          { type: 'inlineMath', latex: 'x^2' },
          { type: 'inlineMath', latex: '' },
          { type: 'text', text: 'tail' },
        ],
      }],
      createdAt: '2026-09-20T10:00:00.000Z',
      updatedAt: '2026-09-20T10:00:00.000Z',
    })
    const paragraph = recovered.document.content[0] as { content: unknown[] }

    expect(paragraph.content).toEqual([
      { type: 'inlineMath', latex: 'x^2' },
      { type: 'text', text: 'tail' },
    ])
  })

  it('normalizes without merging math into adjacent text', () => {
    const normalized = normalizeDocumentNode(sentence()) as { content: unknown[] }

    expect(normalized.content).toHaveLength(3)
    expect(normalized.content[1]).toEqual({ type: 'inlineMath', latex: 'E=mc^2' })
  })

  it('projects to html, markdown, and plain text with dollar delimiters', () => {
    const document = validDocument([sentence()])

    expect(documentToHtml(document)).toContain('<code class="math-inline" data-latex="E=mc^2">E=mc^2</code>')

    const markdown = exportMarkdown(document)
    expect(markdown.output.kind).toBe('text')
    if (markdown.output.kind === 'text') expect(markdown.output.text).toContain('$E=mc^2$')

    const text = exportText(document)
    expect(text.output.kind).toBe('text')
    if (text.output.kind === 'text') expect(text.output.text).toContain('$E=mc^2$')
  })

  it('keeps adjacent paragraphs independent', () => {
    const document = validDocument([sentence(), createParagraph({ id: 'node:after', text: 'after' })])
    expect(validateDocument(document).valid).toBe(true)
  })
})
