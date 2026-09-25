import { getSchema } from '@tiptap/core'
import { EditorState } from '@tiptap/pm/state'
import { describe, expect, it } from 'vitest'
import { createDocument, createParagraph } from '@incantly/canvas/document'
import {
  DocumentCheckpointTracker,
  getIncantlyTransactionMeta,
  incantlyDocumentExtensions,
  incantlyDocumentToProseMirror,
  mapProseMirrorTransaction,
  setIncantlyTransactionMeta,
} from '../src/document/index.js'

const NOW = '2026-09-20T10:00:00.000Z'
const LATER = '2026-09-20T10:00:01.000Z'
const schema = getSchema(incantlyDocumentExtensions)

const setup = (text = 'Hello') => {
  const document = createDocument({
    id: 'document:transactions',
    now: NOW,
    content: [createParagraph({ id: 'node:paragraph', text })],
  })
  const proseMirror = schema.nodeFromJSON(incantlyDocumentToProseMirror(document).value)
  return { document, state: EditorState.create({ schema, doc: proseMirror }) }
}

describe('ProseMirror transaction mapping', () => {
  it('maps ordinary typing to an incremental canonical replaceText operation', () => {
    const { document, state } = setup()
    const transaction = setIncantlyTransactionMeta(state.tr.insertText('!', 6), { origin: 'user' })
    const change = mapProseMirrorTransaction({ document, transaction, timestamp: LATER })

    expect(change.mode).toBe('incremental')
    expect(change.origin).toBe('user')
    expect(change.operations).toEqual([{
      type: 'replaceText', nodeId: 'node:paragraph', from: 5, to: 5, text: '!',
    }])
    expect(change.changedNodeIds).toEqual(['node:paragraph'])
    expect(change.document.content[0]).toMatchObject({ content: [{ type: 'text', text: 'Hello!' }] })
    expect(change.adapterReport).toBeUndefined()
  })

  it('retains typed remote origin metadata', () => {
    const { document, state } = setup()
    const transaction = setIncantlyTransactionMeta(state.tr.insertText(' remote', 6), { origin: 'remote' })

    expect(getIncantlyTransactionMeta(transaction)).toEqual({ origin: 'remote' })
    expect(mapProseMirrorTransaction({ document, transaction, timestamp: LATER }).canonicalTransaction?.origin).toBe('remote')
  })

  it('creates a structural checkpoint and reports changed node IDs', () => {
    const { document, state } = setup()
    const paragraph = schema.nodes.paragraph.create({ id: 'node:second' })
    const transaction = state.tr.insert(state.doc.content.size, paragraph)
    const change = mapProseMirrorTransaction({ document, transaction, timestamp: LATER })

    expect(change.mode).toBe('checkpoint')
    expect(change.checkpointReason).toBe('structural')
    expect(change.operations).toEqual([])
    expect(change.changedNodeIds).toContain('node:second')
    expect(change.document.content.map((node) => node.id)).toEqual(['node:paragraph', 'node:second'])
  })

  it('creates periodic checkpoints without reparsing incremental typing', () => {
    const initial = setup('A')
    const tracker = new DocumentCheckpointTracker({
      maxIncrementalTransactions: 2,
      maxIntervalMs: 60_000,
      initialTimestamp: Date.parse(NOW),
    })
    const firstTransaction = initial.state.tr.insertText('B', 2)
    const first = mapProseMirrorTransaction({
      document: initial.document, transaction: firstTransaction, checkpointTracker: tracker, timestamp: LATER,
    })
    const nextState = initial.state.apply(firstTransaction)
    const secondTransaction = nextState.tr.insertText('C', 3)
    const second = mapProseMirrorTransaction({
      document: first.document, transaction: secondTransaction, checkpointTracker: tracker,
      timestamp: '2026-09-20T10:00:02.000Z',
    })

    expect(first.mode).toBe('incremental')
    expect(second.mode).toBe('checkpoint')
    expect(second.checkpointReason).toBe('periodic')
    expect(second.operations).toHaveLength(1)
    expect(second.adapterReport).toBeUndefined()
  })

  it('keeps undo and redo state out of canonical JSON', () => {
    const { document, state } = setup()
    const transaction = setIncantlyTransactionMeta(state.tr.addMark(1, 6, schema.marks.bold.create()), {
      origin: 'user', historyAction: 'undo',
    })
    const change = mapProseMirrorTransaction({ document, transaction, timestamp: LATER })

    expect(change.mode).toBe('checkpoint')
    expect(change.historyAction).toBe('undo')
    expect(change.checkpointReason).toBe('history')
    expect(JSON.stringify(change.document)).not.toMatch(/undo|redo|history/i)
  })

  it('does not emit a document change for selection-only transactions', () => {
    const { document, state } = setup()
    const change = mapProseMirrorTransaction({ document, transaction: state.tr, timestamp: LATER })

    expect(change).toMatchObject({ mode: 'none', operations: [], changedNodeIds: [], document })
  })
})
