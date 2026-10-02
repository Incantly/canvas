import { describe, expect, it } from 'vitest'
import {
  DOCUMENT_TRANSACTION_LIMITS,
  applyDocumentTransaction,
  assetId,
  createDocument,
  createDocumentTransactionId,
  createParagraph,
  documentId,
  documentNodeId,
  documentTransactionId,
  type DocumentNode,
  type DocumentOperation,
  type DocumentTransaction,
  type IncantlyDocument,
} from '../src/document/index.js'

const now = '2026-09-20T10:00:00.000Z'
const later = '2026-09-20T11:00:00.000Z'
const nodeId = (value: string) => documentNodeId(`node:${value}`)

function transaction(document: IncantlyDocument, operations: readonly DocumentOperation[],
  overrides: Partial<DocumentTransaction> = {}): DocumentTransaction {
  return {
    id: documentTransactionId('transaction:test'),
    documentId: document.id,
    origin: 'user',
    timestamp: later,
    operations,
    ...overrides,
  }
}

describe('document transaction model', () => {
  it('provides branded transaction IDs and explicit per-origin batch limits', () => {
    expect(documentTransactionId('transaction:known')).toBe('transaction:known')
    expect(createDocumentTransactionId()).toMatch(/^transaction:/)
    expect(Object.keys(DOCUMENT_TRANSACTION_LIMITS)).toEqual([
      'user', 'remote', 'ai', 'import', 'migration', 'system',
    ])
    expect(DOCUMENT_TRANSACTION_LIMITS.import.maxOperations)
      .toBeGreaterThan(DOCUMENT_TRANSACTION_LIMITS.user.maxOperations)
    expect(DOCUMENT_TRANSACTION_LIMITS.ai.maxInsertedTextLength)
      .toBeGreaterThan(DOCUMENT_TRANSACTION_LIMITS.user.maxInsertedTextLength)
  })

  it('atomically inserts, updates, moves, and deletes nodes', () => {
    const first = createParagraph({ id: nodeId('first'), text: 'First' })
    const second = createParagraph({ id: nodeId('second'), text: 'Second' })
    const quote: DocumentNode = {
      id: nodeId('quote'), type: 'blockquote',
      content: [createParagraph({ id: nodeId('quote-existing'), text: 'Existing' })],
    }
    const document = createDocument({ id: 'document:operations', content: [first, second, quote], now })
    const inserted = createParagraph({ id: nodeId('inserted'), text: 'Temporary' })
    const updated: DocumentNode = {
      id: first.id, type: 'heading', attrs: { level: 2 },
      content: [{ type: 'text', text: 'Updated heading' }],
    }
    const before = JSON.stringify(document)

    const result = applyDocumentTransaction(document, transaction(document, [
      { type: 'insertNode', index: 1, node: inserted },
      { type: 'updateNode', nodeId: first.id, node: updated },
      { type: 'moveNode', nodeId: second.id, parentId: quote.id, index: 0 },
      { type: 'deleteNode', nodeId: inserted.id },
    ]))

    expect(result.ok).toBe(true)
    expect(JSON.stringify(document)).toBe(before)
    expect(result.document).not.toBe(document)
    expect(result.document.updatedAt).toBe(later)
    expect(result.document.content.map((node) => node.type)).toEqual(['heading', 'blockquote'])
    expect((result.document.content[1] as Extract<DocumentNode, { type: 'blockquote' }>).content.map((node) => node.id))
      .toEqual([second.id, nodeId('quote-existing')])
    expect(new Set(result.changedNodeIds)).toEqual(new Set([first.id, second.id, quote.id, inserted.id]))
    expect(result.issues).toEqual([])
    expect(result.validationIssues).toEqual([])
  })

  it('replaces inline and code-block text while preserving unaffected marks', () => {
    const paragraph: DocumentNode = {
      id: nodeId('text'), type: 'paragraph', content: [
        { type: 'text', text: 'Hello', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' world', marks: [{ type: 'italic' }] },
      ],
    }
    const code: DocumentNode = { id: nodeId('code'), type: 'codeBlock', text: 'const x = 1' }
    const document = createDocument({ id: 'document:text', content: [paragraph, code], now })

    const result = applyDocumentTransaction(document, transaction(document, [
      { type: 'replaceText', nodeId: paragraph.id, from: 5, to: 6, text: '\nnew ', marks: [{ type: 'underline' }] },
      { type: 'replaceText', nodeId: code.id, from: 10, to: 11, text: '42' },
    ]))

    expect(result.ok).toBe(true)
    expect((result.document.content[0] as typeof paragraph).content).toEqual([
      { type: 'text', text: 'Hello', marks: [{ type: 'bold' }] },
      { type: 'hardBreak' },
      { type: 'text', text: 'new ', marks: [{ type: 'underline' }] },
      { type: 'text', text: 'world', marks: [{ type: 'italic' }] },
    ])
    expect((result.document.content[1] as typeof code).text).toBe('const x = 42')
  })

  it('sets primary/preview assets and clears optional preview references', () => {
    const image: DocumentNode = { id: nodeId('image'), type: 'image', attrs: { assetId: assetId('asset:old') } }
    const canvas: DocumentNode = { id: nodeId('canvas'), type: 'canvasEmbed', attrs: { canvasId: 'canvas:one' } }
    const document = createDocument({ id: 'document:assets', content: [image, canvas], now })

    const set = applyDocumentTransaction(document, transaction(document, [
      { type: 'setAssetReference', nodeId: image.id, slot: 'primary', assetId: assetId('asset:new') },
      { type: 'setAssetReference', nodeId: canvas.id, slot: 'preview', assetId: assetId('asset:preview') },
    ]))
    expect(set.ok).toBe(true)
    expect((set.document.content[0] as typeof image).attrs.assetId).toBe('asset:new')
    expect((set.document.content[1] as typeof canvas).attrs.previewAssetId).toBe('asset:preview')

    const cleared = applyDocumentTransaction(set.document, transaction(set.document, [
      { type: 'clearAssetReference', nodeId: canvas.id, slot: 'preview' },
    ], { id: documentTransactionId('transaction:clear') }))
    expect(cleared.ok).toBe(true)
    expect((cleared.document.content[1] as typeof canvas).attrs.previewAssetId).toBeUndefined()
  })
})

describe('atomic rollback and transaction safety', () => {
  it('rolls back the whole batch when an operation creates invalid structure', () => {
    const checklist: DocumentNode = { id: nodeId('checklist'), type: 'checklist', content: [] }
    const original = createDocument({ id: 'document:rollback', content: [checklist], now })
    const before = JSON.stringify(original)

    const result = applyDocumentTransaction(original, transaction(original, [
      { type: 'insertNode', index: 0, node: createParagraph({ id: nodeId('valid-first'), text: 'Would succeed' }) },
      { type: 'insertNode', parentId: checklist.id, index: 0, node: createParagraph({ id: nodeId('invalid-child'), text: 'Invalid checklist child' }) },
    ]))

    expect(result.ok).toBe(false)
    expect(result.document).toBe(original)
    expect(JSON.stringify(original)).toBe(before)
    expect(result.changedNodeIds).toEqual([])
    expect(result.validationIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'invalid_child' }),
    ]))
  })

  it('rolls back on operation errors, ID mismatches, and invalid text ranges', () => {
    const paragraph = createParagraph({ id: nodeId('paragraph'), text: 'Short' })
    const document = createDocument({ id: 'document:errors', content: [paragraph], now })

    const missing = applyDocumentTransaction(document, transaction(document, [
      { type: 'deleteNode', nodeId: nodeId('missing') },
    ]))
    expect(missing).toMatchObject({ ok: false, document, changedNodeIds: [] })
    expect(missing.issues[0]).toMatchObject({ code: 'node_not_found', operationIndex: 0 })

    const range = applyDocumentTransaction(document, transaction(document, [
      { type: 'replaceText', nodeId: paragraph.id, from: 0, to: 100, text: 'No' },
    ]))
    expect(range.issues[0]).toMatchObject({ code: 'invalid_text_range', operationIndex: 0 })

    const mismatch = applyDocumentTransaction(document, transaction(document, [], {
      documentId: documentId('document:other'),
    }))
    expect(mismatch.issues[0]).toMatchObject({ code: 'document_id_mismatch' })
  })

  it('rejects transactions that exceed origin-specific batching limits', () => {
    const paragraph = createParagraph({ id: nodeId('paragraph'), text: 'Text' })
    const document = createDocument({ id: 'document:limits', content: [paragraph], now })
    const operations: DocumentOperation[] = Array.from(
      { length: DOCUMENT_TRANSACTION_LIMITS.user.maxOperations + 1 },
      () => ({ type: 'deleteNode', nodeId: paragraph.id }),
    )

    const result = applyDocumentTransaction(document, transaction(document, operations))

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'operation_limit', path: '$.operations' }),
    ]))
    expect(result.document).toBe(document)
  })

  it('rejects an invalid source document before applying operations', () => {
    const document = createDocument({ id: 'document:invalid-source', now })
    ;(document.content[0] as { id: string }).id = ''

    const result = applyDocumentTransaction(document, transaction(document, []))

    expect(result.ok).toBe(false)
    expect(result.validationIssues.length).toBeGreaterThan(0)
    expect(result.document).toBe(document)
  })
})
