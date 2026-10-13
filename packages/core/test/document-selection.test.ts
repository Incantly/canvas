import { describe, expect, it } from 'vitest'
import {
  applyDocumentTransaction,
  createCollapsedTextSelection,
  createDocument,
  createParagraph,
  documentId,
  documentNodeId,
  documentTransactionId,
  mapDocumentSelection,
  resolveDocumentSelection,
  type DocumentNode,
  type DocumentOperation,
  type DocumentSelection,
  type IncantlyDocument,
} from '../src/document/index.js'

const now = '2026-09-20T10:00:00.000Z'
const later = '2026-09-20T11:00:00.000Z'
const id = (value: string) => documentNodeId(`node:${value}`)

function fixture(): IncantlyDocument {
  const quote: DocumentNode = {
    id: id('quote'), type: 'blockquote',
    content: [createParagraph({ id: id('inside-quote'), text: 'Quoted text' })],
  }
  return createDocument({
    id: 'document:selection',
    content: [
      createParagraph({ id: id('first'), text: 'Hello world' }),
      quote,
      { id: id('code'), type: 'codeBlock', text: 'const x = 1' },
    ],
    now,
  })
}

function apply(document: IncantlyDocument, operations: readonly DocumentOperation[]): IncantlyDocument {
  const result = applyDocumentTransaction(document, {
    id: documentTransactionId('transaction:selection'),
    documentId: document.id,
    origin: 'user',
    timestamp: later,
    operations,
  })
  expect(result.ok).toBe(true)
  return result.document
}

describe('portable document selection contract', () => {
  it('resolves collapsed, forward, backward, node, and block-range selections', () => {
    const document = fixture()
    const collapsed = createCollapsedTextSelection(document.id, id('first'), 5)
    const forward: DocumentSelection = {
      type: 'text', documentId: document.id,
      anchor: { nodeId: id('first'), offset: 2 },
      focus: { nodeId: id('inside-quote'), offset: 4 },
    }
    const backward: DocumentSelection = {
      ...forward,
      anchor: forward.type === 'text' ? forward.focus : { nodeId: id('first'), offset: 0 },
      focus: forward.type === 'text' ? forward.anchor : { nodeId: id('first'), offset: 0 },
    }
    const nodeSelection: DocumentSelection = { type: 'node', documentId: document.id, nodeId: id('quote') }
    const blockRange: DocumentSelection = {
      type: 'blockRange', documentId: document.id,
      anchorNodeId: id('first'), focusNodeId: id('code'),
    }

    expect(resolveDocumentSelection(document, collapsed).resolved).toMatchObject({
      collapsed: true, direction: 'forward', selectedNodeIds: [id('first')],
    })
    expect(resolveDocumentSelection(document, forward).resolved).toMatchObject({
      collapsed: false, direction: 'forward', selectedNodeIds: [id('first'), id('quote'), id('inside-quote')],
    })
    expect(resolveDocumentSelection(document, backward).resolved?.direction).toBe('backward')
    expect(resolveDocumentSelection(document, nodeSelection).resolved?.selectedNodeIds).toEqual([id('quote')])
    expect(resolveDocumentSelection(document, blockRange).resolved?.selectedNodeIds)
      .toEqual([id('first'), id('quote'), id('inside-quote'), id('code')])
  })

  it('is JSON serializable and uses stable IDs with node-local offsets', () => {
    const document = fixture()
    const selection = createCollapsedTextSelection(document.id, id('first'), 3, 'backward')

    expect(JSON.parse(JSON.stringify(selection))).toEqual(selection)
    expect(selection).toEqual({
      type: 'text',
      documentId: 'document:selection',
      anchor: { nodeId: 'node:first', offset: 3, affinity: 'backward' },
      focus: { nodeId: 'node:first', offset: 3, affinity: 'backward' },
    })
  })

  it('reports document, node, target, and offset failures explicitly', () => {
    const document = fixture()
    const mismatched: DocumentSelection = { type: 'node', documentId: documentId('document:other'), nodeId: id('first') }
    const missing: DocumentSelection = { type: 'node', documentId: document.id, nodeId: id('missing') }
    const invalidTarget: DocumentSelection = {
      type: 'text', documentId: document.id,
      anchor: { nodeId: id('quote'), offset: 0 }, focus: { nodeId: id('quote'), offset: 0 },
    }
    const invalidOffset = createCollapsedTextSelection(document.id, id('first'), 100)

    expect(resolveDocumentSelection(document, mismatched).issues[0].code).toBe('document_mismatch')
    expect(resolveDocumentSelection(document, missing).issues[0].code).toBe('node_not_found')
    expect(resolveDocumentSelection(document, invalidTarget).issues[0].code).toBe('invalid_text_target')
    expect(resolveDocumentSelection(document, invalidOffset).issues[0].code).toBe('offset_out_of_bounds')
  })
})

describe('selection mapping across document changes', () => {
  it('maps offsets through text replacement operations using affinity', () => {
    const before = fixture()
    const operations: DocumentOperation[] = [
      { type: 'replaceText', nodeId: id('first'), from: 5, to: 5, text: ' brave' },
    ]
    const after = apply(before, operations)
    const range: DocumentSelection = {
      type: 'text', documentId: before.id,
      anchor: { nodeId: id('first'), offset: 2 },
      focus: { nodeId: id('first'), offset: 8 },
    }
    const backward = createCollapsedTextSelection(before.id, id('first'), 5, 'backward')
    const forward = createCollapsedTextSelection(before.id, id('first'), 5, 'forward')

    expect(mapDocumentSelection(range, before, after, operations).selection).toMatchObject({
      anchor: { offset: 2 }, focus: { offset: 14 },
    })
    expect((mapDocumentSelection(backward, before, after, operations).selection as typeof backward).anchor.offset).toBe(5)
    expect((mapDocumentSelection(forward, before, after, operations).selection as typeof forward).anchor.offset).toBe(11)
  })

  it('maps stable node selections across moves', () => {
    const before = fixture()
    const operations: DocumentOperation[] = [
      { type: 'moveNode', nodeId: id('code'), parentId: id('quote'), index: 1 },
    ]
    const after = apply(before, operations)
    const selection: DocumentSelection = { type: 'node', documentId: before.id, nodeId: id('code') }

    expect(mapDocumentSelection(selection, before, after, operations)).toEqual({ ok: true, selection })
  })

  it('reports deleted and text-incompatible replacement targets', () => {
    const before = fixture()
    const textSelection = createCollapsedTextSelection(before.id, id('first'), 3)
    const deleted = apply(before, [{ type: 'deleteNode', nodeId: id('first') }])
    expect(mapDocumentSelection(textSelection, before, deleted)).toMatchObject({
      ok: false,
      failure: { code: 'selected_node_deleted', nodeId: id('first') },
    })

    const replacement: DocumentNode = { id: id('first'), type: 'horizontalRule' }
    const replaced = apply(before, [{ type: 'updateNode', nodeId: id('first'), node: replacement }])
    expect(mapDocumentSelection(textSelection, before, replaced)).toMatchObject({
      ok: false,
      failure: { code: 'selected_node_replaced', nodeId: id('first') },
    })
  })

  it('reports out-of-bounds offsets when no operation mapping is available', () => {
    const before = fixture()
    const selection = createCollapsedTextSelection(before.id, id('first'), 10)
    const after = apply(before, [{ type: 'replaceText', nodeId: id('first'), from: 0, to: 11, text: 'Hi' }])

    expect(mapDocumentSelection(selection, before, after)).toMatchObject({
      ok: false,
      failure: { code: 'offset_out_of_bounds' },
    })
  })

  it('refuses mapping between different documents', () => {
    const before = fixture()
    const after = { ...fixture(), id: documentId('document:different') }
    const selection: DocumentSelection = { type: 'node', documentId: before.id, nodeId: id('first') }

    expect(mapDocumentSelection(selection, before, after)).toMatchObject({
      ok: false,
      failure: { code: 'document_mismatch' },
    })
  })
})
