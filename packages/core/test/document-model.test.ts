import { describe, expect, it } from 'vitest'
import {
  CURRENT_DOCUMENT_SCHEMA_VERSION,
  DEFAULT_PAGE_SETUP,
  assetId,
  citationId,
  commentId,
  createDocument,
  createDocumentId,
  createDocumentNodeId,
  createParagraph,
  documentId,
  documentNodeId,
} from '../src/document/index.js'

describe('standalone document model', () => {
  it('creates a versioned document with an initial paragraph', () => {
    const document = createDocument({
      id: 'document:test',
      title: 'Research notes',
      now: '2026-09-20T10:00:00.000Z',
    })

    expect(document).toMatchObject({
      schemaVersion: CURRENT_DOCUMENT_SCHEMA_VERSION,
      id: 'document:test',
      type: 'document',
      metadata: {
        title: 'Research notes',
        language: 'en',
        authors: [],
        tags: [],
        pageSetup: DEFAULT_PAGE_SETUP,
      },
      createdAt: '2026-09-20T10:00:00.000Z',
      updatedAt: '2026-09-20T10:00:00.000Z',
    })
    expect(document.content).toHaveLength(1)
    expect(document.content[0]).toMatchObject({ type: 'paragraph', content: [] })
  })

  it('creates paragraphs with stable supplied identifiers and text', () => {
    const paragraph = createParagraph({
      id: 'node:introduction',
      text: 'A continuous writing surface.',
      attrs: { alignment: 'justify', lineHeight: 1.6 },
    })

    expect(paragraph).toEqual({
      id: 'node:introduction',
      type: 'paragraph',
      attrs: { alignment: 'justify', lineHeight: 1.6 },
      content: [{ type: 'text', text: 'A continuous writing surface.' }],
    })
  })

  it('merges partial metadata and page setup with independent defaults', () => {
    const first = createDocument({
      metadata: {
        language: 'fr',
        authors: [{ name: 'Ada Lovelace', orcid: '0000-0000-0000-0000' }],
        tags: ['research'],
        pageSetup: {
          mode: 'paginated',
          size: 'letter',
          columns: 2,
          margins: { left: 54 },
        },
        research: {
          title: 'Analytical Engine Notes',
          keywords: ['computing'],
          citationStyle: 'ieee',
        },
      },
      content: [],
    })
    const second = createDocument()

    expect(first.metadata.pageSetup).toEqual({
      mode: 'paginated',
      size: 'letter',
      orientation: 'portrait',
      margins: { top: 72, right: 72, bottom: 72, left: 54 },
      columns: 2,
    })
    expect(first.metadata.language).toBe('fr')
    expect(first.metadata.research?.keywords).toEqual(['computing'])

    first.metadata.pageSetup.margins.top = 12
    expect(second.metadata.pageSetup.margins.top).toBe(72)
  })

  it('can intentionally create an empty document', () => {
    expect(createDocument({ createInitialParagraph: false }).content).toEqual([])
    expect(createDocument({ content: [] }).content).toEqual([])
  })

  it('provides branded ID constructors and generators', () => {
    expect(documentId('document:known')).toBe('document:known')
    expect(documentNodeId('node:known')).toBe('node:known')
    expect(assetId('asset:known')).toBe('asset:known')
    expect(commentId('comment:known')).toBe('comment:known')
    expect(citationId('citation:known')).toBe('citation:known')
    expect(createDocumentId()).toMatch(/^document:/)
    expect(createDocumentNodeId()).toMatch(/^node:/)
  })
})
