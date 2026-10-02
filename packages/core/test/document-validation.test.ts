import { describe, expect, it } from 'vitest'
import {
  DOCUMENT_LIMITS,
  createDocument,
  createParagraph,
  documentNodeId,
  normalizeDocument,
  recoverDocument,
  validateDocument,
  type DocumentNode,
  type IncantlyDocument,
} from '../src/document/index.js'

const paragraph = (id: string, text = 'safe') => createParagraph({ id, text })
const validDocument = (content: DocumentNode[] = [paragraph('node:one')]): IncantlyDocument =>
  createDocument({ id: 'document:test', content, now: '2026-09-20T10:00:00.000Z' })

describe('strict document validation', () => {
  it('accepts a valid document and returns the typed value', () => {
    const document = validDocument()
    const result = validateDocument(document)

    expect(result.valid).toBe(true)
    expect(result.issues).toEqual([])
    expect(result.document).toBe(document)
  })

  it('returns structured paths and error codes without coercing input', () => {
    const input = validDocument() as unknown as Record<string, unknown>
    input.schemaVersion = 99
    input.metadata = { title: 42, language: 'not a valid tag!', authors: {}, tags: [], pageSetup: null }

    const result = validateDocument(input)

    expect(result.valid).toBe(false)
    expect(result.document).toBeUndefined()
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'unsupported_schema_version', path: '$.schemaVersion' }),
      expect.objectContaining({ code: 'invalid_type', path: '$.metadata.title' }),
      expect.objectContaining({ code: 'invalid_language', path: '$.metadata.language' }),
    ]))
  })

  it('enforces node child rules and reports duplicate node IDs', () => {
    const duplicate = paragraph('node:duplicate')
    const document = validDocument([
      duplicate,
      paragraph('node:duplicate'),
      { id: documentNodeId('node:bad-row'), type: 'tableRow', content: [] },
      {
        id: documentNodeId('node:list'), type: 'bulletList',
        content: [paragraph('node:not-a-list-item') as unknown as never],
      },
    ])

    const result = validateDocument(document)

    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'duplicate_node_id', path: '$.content[1].id' }),
      expect.objectContaining({ code: 'invalid_child', path: '$.content[2].type' }),
      expect.objectContaining({ code: 'invalid_child', path: '$.content[3].content[0].type' }),
    ]))
  })

  it('validates URLs, colors, dimensions, language IDs, MIME types, and filenames', () => {
    const document = validDocument([
      { id: documentNodeId('node:link'), type: 'paragraph', content: [{ type: 'text', text: 'bad', marks: [{ type: 'link', href: 'javascript:alert(1)' }] }] } as DocumentNode,
      { id: documentNodeId('node:color'), type: 'paragraph', content: [{ type: 'text', text: 'bad', marks: [{ type: 'textColor', color: 'url(javascript:bad)' }] }] } as DocumentNode,
      { id: documentNodeId('node:code'), type: 'codeBlock', attrs: { language: '<script>' }, text: 'x' },
      { id: documentNodeId('node:file'), type: 'fileAttachment', attrs: { assetId: 'asset:file' as never, filename: '../bad.docx', mimeType: 'invalid' } },
      { id: documentNodeId('node:image'), type: 'image', attrs: { assetId: 'asset:image' as never, width: -1 } },
    ])

    const codes = validateDocument(document).issues.map((entry) => entry.code)
    expect(codes).toEqual(expect.arrayContaining([
      'invalid_url', 'invalid_color', 'invalid_language', 'invalid_filename',
      'invalid_mime_type', 'invalid_value',
    ]))
  })

  it('rejects executable and prototype-pollution-shaped keys', () => {
    const document = JSON.parse(JSON.stringify(validDocument())) as Record<string, unknown>
    const content = document.content as Array<Record<string, unknown>>
    content[0].attrs = JSON.parse('{"onclick":"run()","__proto__":{"polluted":true}}')

    const result = validateDocument(document)

    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'unsafe_key', path: '$.content[0].attrs.onclick' }),
      expect.objectContaining({ code: 'unsafe_key', path: '$.content[0].attrs.__proto__' }),
    ]))
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined()
  })

  it('stops deep nesting and oversized tables at explicit limits', () => {
    let nested: Record<string, unknown> = paragraph('node:leaf') as unknown as Record<string, unknown>
    for (let index = 0; index < DOCUMENT_LIMITS.maxDepth + 3; index++) {
      nested = { id: `node:quote:${index}`, type: 'blockquote', content: [nested] }
    }
    const rows = Array.from({ length: DOCUMENT_LIMITS.maxTableRows + 1 }, (_, index) => ({
      id: `node:row:${index}`, type: 'tableRow', content: [],
    }))
    const document = validDocument([
      nested as unknown as DocumentNode,
      { id: documentNodeId('node:table'), type: 'table', content: rows as never },
    ])

    const codes = validateDocument(document).issues.map((entry) => entry.code)
    expect(codes).toContain('limit_depth')
    expect(codes).toContain('limit_table')
  })
})

describe('safe document recovery', () => {
  it('repairs duplicate IDs only in explicit recovery and is idempotent', () => {
    const input = validDocument([paragraph('node:same', 'A'), paragraph('node:same', 'B')])
    const recovered = recoverDocument(input)

    expect(recovered.document.content.map((node) => node.id)).toEqual(['node:same', 'node:same~2'])
    expect(recovered.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'duplicate_node_id', severity: 'warning' }),
    ]))
    expect(validateDocument(recovered.document).valid).toBe(true)
    expect(normalizeDocument(recovered.document)).toEqual(recovered.document)
  })

  it('preserves unsupported imported text through a fallback and import report', () => {
    const input = validDocument() as unknown as Record<string, unknown>
    input.content = [
      { id: 'node:unknown', type: 'interactiveWidget', attrs: { onclick: 'bad()' }, content: [{ text: 'Preserve this research note' }] },
    ]

    const recovered = recoverDocument(input)

    expect(recovered.document.content[0]).toMatchObject({
      type: 'paragraph', content: [{ type: 'text', text: 'Preserve this research note' }],
    })
    expect(recovered.unsupportedContent).toEqual([
      expect.objectContaining({ path: '$.content[0]', originalType: 'interactiveWidget', action: 'converted_to_paragraph' }),
    ])
    expect(validateDocument(recovered.document).valid).toBe(true)
  })

  it('reconstructs allowlisted fields and removes unsafe or malformed attributes', () => {
    const input = validDocument() as unknown as Record<string, unknown>
    input.metadata = { title: 'Recovered', language: '<script>', authors: [], tags: [], pageSetup: { mode: 'bad', size: 'custom', width: -1, height: 0, orientation: 'bad', margins: {}, columns: 99 } }
    input.content = [{
      id: 'node:file', type: 'fileAttachment',
      attrs: { assetId: 'asset:one', filename: '../unsafe.pdf', mimeType: 'not mime', onclick: 'run()' },
    }]

    const recovered = recoverDocument(input)
    const file = recovered.document.content[0]

    expect(recovered.document.metadata.language).toBe('en')
    expect(recovered.document.metadata.pageSetup).toMatchObject({ mode: 'continuous', size: 'custom', columns: 1 })
    expect(file).toEqual({ id: 'node:file', type: 'fileAttachment', attrs: { assetId: 'asset:one' } })
    expect(validateDocument(recovered.document).valid).toBe(true)
  })
})
