import { describe, expect, it } from 'vitest'
import {
  DOCUMENT_NODE_RULES,
  VIDEO_EMBED_PROVIDERS,
  assetId,
  canCombineTextMarks,
  citationId,
  createParagraph,
  documentId,
  documentNodeId,
  documentNodeToPlainText,
  documentNodesToPlainText,
  fallbackForUnsupportedNode,
  normalizeDocumentNode,
  normalizeInlineContent,
  normalizeLinkHref,
  normalizeTextMarks,
  type DocumentNode,
  type DocumentNodeType,
} from '../src/document/index.js'

const id = (value: string) => documentNodeId(`node:${value}`)

describe('document inline content', () => {
  it('defines compatible formatting marks and atomic code/math marks', () => {
    expect(canCombineTextMarks('bold', 'italic')).toBe(true)
    expect(canCombineTextMarks('bold', 'link')).toBe(true)
    expect(canCombineTextMarks('code', 'bold')).toBe(false)
    expect(canCombineTextMarks('inlineMath', 'citation')).toBe(false)
    expect(canCombineTextMarks('bold', 'bold')).toBe(false)
  })

  it('normalizes, orders, deduplicates, and rejects malformed marks', () => {
    expect(normalizeTextMarks([
      { type: 'highlight', color: ' yellow ' },
      { type: 'bold' },
      { type: 'bold' },
      { type: 'citation', citationId: ' citation:ada ' },
      { type: 'link', href: ' javascript:alert(1)' },
      { type: 'unknown' },
      null,
    ])).toEqual([
      { type: 'bold' },
      { type: 'highlight', color: 'yellow' },
      { type: 'citation', citationId: citationId('citation:ada') },
    ])

    expect(normalizeTextMarks([{ type: 'bold' }, { type: 'code' }, { type: 'italic' }]))
      .toEqual([{ type: 'code' }])
    expect(normalizeTextMarks([{ type: 'inlineMath', latex: ' x^2 ' }, { type: 'bold' }]))
      .toEqual([{ type: 'inlineMath', latex: 'x^2' }])
  })

  it('normalizes safe links and rejects dangerous or unsupported protocols', () => {
    expect(normalizeLinkHref(' HTTPS://Example.com/path ')).toBe('https://example.com/path')
    expect(normalizeLinkHref('mailto:hello@example.com')).toBe('mailto:hello@example.com')
    expect(normalizeLinkHref('/documents/one')).toBe('/documents/one')
    expect(normalizeLinkHref('#section')).toBe('#section')
    expect(normalizeLinkHref('javascript:alert(1)')).toBeNull()
    expect(normalizeLinkHref('data:text/html,bad')).toBeNull()
    expect(normalizeLinkHref('not a URL')).toBeNull()
  })

  it('supports hard breaks and merges adjacent text with equal marks', () => {
    expect(normalizeInlineContent([
      { type: 'text', text: 'Hello', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' world', marks: [{ type: 'bold' }] },
      { type: 'text', text: '' },
      { type: 'unsupported', text: 'drop' },
      { type: 'hardBreak', unexpected: true },
      { type: 'text', text: 'Next line', marks: [{ type: 'link', href: 'https://incantly.com' }] },
    ])).toEqual([
      { type: 'text', text: 'Hello world', marks: [{ type: 'bold' }] },
      { type: 'hardBreak' },
      { type: 'text', text: 'Next line', marks: [{ type: 'link', href: 'https://incantly.com/' }] },
    ])
  })
})

describe('document block nodes', () => {
  const paragraph = createParagraph({ id: id('paragraph'), text: 'Paragraph' })
  const allNodes = [
    paragraph,
    { id: id('heading'), type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Heading' }] },
    { id: id('blockquote'), type: 'blockquote', content: [paragraph] },
    { id: id('bullet-list'), type: 'bulletList', content: [{ id: id('bullet-item'), type: 'listItem', content: [paragraph] }] },
    { id: id('ordered-list'), type: 'orderedList', attrs: { start: 3 }, content: [{ id: id('ordered-item'), type: 'listItem', content: [paragraph] }] },
    { id: id('checklist'), type: 'checklist', content: [{ id: id('check-item'), type: 'checklistItem', attrs: { checked: true }, content: [paragraph] }] },
    { id: id('list-item'), type: 'listItem', content: [paragraph] },
    { id: id('checklist-item'), type: 'checklistItem', attrs: { checked: false }, content: [paragraph] },
    { id: id('rule'), type: 'horizontalRule' },
    { id: id('code'), type: 'codeBlock', attrs: { language: 'ts' }, text: 'const x = 1' },
    { id: id('math'), type: 'mathBlock', attrs: { latex: 'E = mc^2', numbered: true, label: 'energy' } },
    { id: id('table'), type: 'table', attrs: { caption: 'Results' }, content: [{ id: id('row'), type: 'tableRow', content: [{ id: id('header-cell'), type: 'tableHeaderCell', content: [paragraph] }, { id: id('cell'), type: 'tableCell', content: [paragraph] }] }] },
    { id: id('row-standalone'), type: 'tableRow', content: [{ id: id('cell-2'), type: 'tableCell', content: [paragraph] }] },
    { id: id('header-cell-standalone'), type: 'tableHeaderCell', content: [paragraph] },
    { id: id('cell-standalone'), type: 'tableCell', attrs: { colspan: 2, rowspan: 2 }, content: [paragraph] },
    { id: id('image'), type: 'image', attrs: { assetId: assetId('asset:image'), alt: 'Diagram', display: 'figure' } },
    { id: id('file'), type: 'fileAttachment', attrs: { assetId: assetId('asset:docx'), filename: 'paper.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' } },
    { id: id('audio'), type: 'audio', attrs: { assetId: assetId('asset:audio'), title: 'Interview' } },
    { id: id('video'), type: 'videoEmbed', attrs: { provider: 'youtube', videoId: 'abc123', title: 'Lecture' } },
    { id: id('pdf'), type: 'pdfEmbed', attrs: { assetId: assetId('asset:pdf'), page: 2, display: 'reader', extractedDocumentId: documentId('document:extracted') } },
    { id: id('canvas'), type: 'canvasEmbed', attrs: { canvasId: 'canvas:one', previewAssetId: assetId('asset:preview'), caption: 'Experiment map' } },
    { id: id('page-break'), type: 'pageBreak' },
  ] satisfies DocumentNode[]

  it('defines attributes and a rule contract for every initial node type', () => {
    const expected: DocumentNodeType[] = [
      'paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'checklist',
      'listItem', 'checklistItem', 'horizontalRule', 'codeBlock', 'mathBlock', 'table',
      'tableRow', 'tableHeaderCell', 'tableCell', 'image', 'fileAttachment', 'audio',
      'videoEmbed', 'pdfEmbed', 'canvasEmbed', 'pageBreak',
    ]
    expect(allNodes.map((node) => node.type)).toEqual(expected)
    expect(Object.keys(DOCUMENT_NODE_RULES)).toEqual(expected)
    for (const nodeType of expected) {
      expect(DOCUMENT_NODE_RULES[nodeType].allowedChildren).toBeDefined()
      expect(DOCUMENT_NODE_RULES[nodeType].maxDepth).toBeGreaterThan(0)
      expect(DOCUMENT_NODE_RULES[nodeType].normalization).not.toBe('')
      expect(['paragraph', 'attachment', 'omit']).toContain(DOCUMENT_NODE_RULES[nodeType].unsupportedFallback)
    }
    expect(VIDEO_EMBED_PROVIDERS).toEqual(['youtube', 'vimeo'])
  })

  it('normalizes inline content, numeric attributes, and empty block containers', () => {
    const heading = normalizeDocumentNode({
      id: id('bad-heading'), type: 'heading', attrs: { level: 9 as 6 },
      content: [{ type: 'text', text: 'A' }, { type: 'text', text: 'B' }],
    })
    const list = normalizeDocumentNode({
      id: id('bad-list'), type: 'orderedList', attrs: { start: -4 },
      content: [{ id: id('empty-item'), type: 'listItem', content: [] }],
    })
    const cell = normalizeDocumentNode({
      id: id('bad-cell'), type: 'tableCell', attrs: { colspan: 0, rowspan: 2.8 }, content: [],
    })

    expect(heading).toMatchObject({ attrs: { level: 6 }, content: [{ type: 'text', text: 'AB' }] })
    expect(list).toMatchObject({ attrs: {}, content: [{ content: [{ type: 'paragraph' }] }] })
    expect(cell).toMatchObject({ attrs: { rowspan: 2 }, content: [{ type: 'paragraph' }] })
  })

  it('extracts plain text for every node category', () => {
    expect(documentNodeToPlainText(allNodes[0])).toBe('Paragraph')
    const text = documentNodesToPlainText(allNodes)
    expect(text).toContain('Heading')
    expect(text).toContain('const x = 1')
    expect(text).toContain('E = mc^2')
    expect(text).toContain('Diagram')
    expect(text).toContain('paper.docx')
    expect(text).toContain('Interview')
    expect(text).toContain('Lecture')
    expect(text).toContain('Experiment map')
  })

  it('provides an explicit generic fallback for unsupported imported content', () => {
    expect(fallbackForUnsupportedNode('  Preserved unsupported content  ')).toMatchObject({
      type: 'paragraph', content: [{ type: 'text', text: 'Preserved unsupported content' }],
    })
    expect(fallbackForUnsupportedNode('  ')).toBeNull()
  })
})
