import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PAGE_SETUP,
  assetId,
  createDocument,
  createParagraph,
  documentCommandToOperations,
  documentNodeId,
  documentTransactionId,
  executeDocumentCommand,
  queryDocumentCommandState,
  validateDocument,
  type DocumentCommand,
  type DocumentNode,
  type IncantlyDocument,
} from '../src/document/index.js'

const now = '2026-09-20T10:00:00.000Z'
const later = '2026-09-20T11:00:00.000Z'
const id = (value: string) => documentNodeId(`node:${value}`)
const emptyDocument = (): IncantlyDocument => createDocument({ id: 'document:commands', content: [], now })
const context = (suffix = 'command') => ({ transactionId: documentTransactionId(`transaction:${suffix}`), timestamp: later })

const insertionCommands: Array<{ command: DocumentCommand; nodeType: DocumentNode['type'] }> = [
  { command: { type: 'insertParagraph', index: 0, nodeId: id('paragraph'), text: 'Paragraph' }, nodeType: 'paragraph' },
  { command: { type: 'insertHeading', index: 0, nodeId: id('heading'), level: 2, text: 'Heading' }, nodeType: 'heading' },
  { command: { type: 'insertBlockquote', index: 0, nodeId: id('quote'), paragraphId: id('quote-p'), text: 'Quote' }, nodeType: 'blockquote' },
  { command: { type: 'insertBulletList', index: 0, nodeId: id('bullet'), itemId: id('bullet-item'), paragraphId: id('bullet-p'), text: 'Bullet' }, nodeType: 'bulletList' },
  { command: { type: 'insertOrderedList', index: 0, nodeId: id('ordered'), itemId: id('ordered-item'), paragraphId: id('ordered-p'), start: 3, text: 'Ordered' }, nodeType: 'orderedList' },
  { command: { type: 'insertChecklist', index: 0, nodeId: id('checklist'), itemId: id('check-item'), paragraphId: id('check-p'), checked: true, text: 'Done' }, nodeType: 'checklist' },
  { command: { type: 'insertHorizontalRule', index: 0, nodeId: id('rule') }, nodeType: 'horizontalRule' },
  { command: { type: 'insertCodeBlock', index: 0, nodeId: id('code'), language: 'typescript', text: 'const x = 1' }, nodeType: 'codeBlock' },
  { command: { type: 'insertMathBlock', index: 0, nodeId: id('math'), latex: 'E=mc^2', numbered: true }, nodeType: 'mathBlock' },
  {
    command: {
      type: 'insertTable', index: 0, rows: 2, columns: 2, headerRow: true,
      ids: {
        tableId: id('table'), rowIds: [id('row-1'), id('row-2')],
        cellIds: [[id('cell-1'), id('cell-2')], [id('cell-3'), id('cell-4')]],
        paragraphIds: [[id('cell-p-1'), id('cell-p-2')], [id('cell-p-3'), id('cell-p-4')]],
      },
    },
    nodeType: 'table',
  },
  { command: { type: 'insertImage', index: 0, nodeId: id('image'), assetId: assetId('asset:image'), alt: 'Diagram' }, nodeType: 'image' },
  { command: { type: 'insertFileAttachment', index: 0, nodeId: id('file'), assetId: assetId('asset:file'), filename: 'paper.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }, nodeType: 'fileAttachment' },
  { command: { type: 'insertAudio', index: 0, nodeId: id('audio'), assetId: assetId('asset:audio'), title: 'Interview' }, nodeType: 'audio' },
  { command: { type: 'insertVideoEmbed', index: 0, nodeId: id('video'), provider: 'youtube', videoId: 'abc_123' }, nodeType: 'videoEmbed' },
  { command: { type: 'insertPdfEmbed', index: 0, nodeId: id('pdf'), assetId: assetId('asset:pdf'), page: 2, display: 'reader' }, nodeType: 'pdfEmbed' },
  { command: { type: 'insertCanvasEmbed', index: 0, nodeId: id('canvas'), canvasId: 'canvas:one', previewAssetId: assetId('asset:preview') }, nodeType: 'canvasEmbed' },
  { command: { type: 'insertPageBreak', index: 0, nodeId: id('page-break') }, nodeType: 'pageBreak' },
]

describe('serializable shared document commands', () => {
  it.each(insertionCommands)('executes $command.type without React or browser state', ({ command, nodeType }) => {
    const document = emptyDocument()
    const serializedCommand = JSON.parse(JSON.stringify(command)) as DocumentCommand
    const result = executeDocumentCommand(document, serializedCommand, context(command.type))

    expect(result.ok).toBe(true)
    expect(result.commandIssues).toEqual([])
    expect(result.document.content[0].type).toBe(nodeType)
    expect(validateDocument(result.document).valid).toBe(true)
  })

  it('produces deterministic output from the same command and context', () => {
    const document = emptyDocument()
    const command: DocumentCommand = { type: 'insertParagraph', index: 0, nodeId: id('deterministic'), text: 'Same input' }

    const first = executeDocumentCommand(document, command, context('deterministic'))
    const second = executeDocumentCommand(document, command, context('deterministic'))

    expect(first).toEqual(second)
    expect(JSON.stringify(first.document)).toBe(JSON.stringify(second.document))
  })

  it('rejects malformed table dimensions and invalid insertion targets during planning', () => {
    const list: DocumentNode = { id: id('list'), type: 'bulletList', content: [] }
    const document = createDocument({ id: 'document:invalid-command', content: [list], now })
    const malformed: DocumentCommand = {
      type: 'insertTable', index: 1, rows: 2, columns: 2,
      ids: { tableId: id('bad-table'), rowIds: [id('only-row')], cellIds: [], paragraphIds: [] },
    }
    const invalidParent: DocumentCommand = {
      type: 'insertParagraph', parentId: list.id, index: 0, nodeId: id('bad-child'),
    }

    expect(documentCommandToOperations(document, malformed)).toMatchObject({ ok: false })
    expect(queryDocumentCommandState(document, invalidParent)).toMatchObject({
      canExecute: false,
      active: false,
    })
  })
})

describe('formatting and editing commands', () => {
  it('sets, queries, and unsets marks over a text range', () => {
    const paragraph = createParagraph({ id: id('text'), text: 'Hello world' })
    const document = createDocument({ id: 'document:marks', content: [paragraph], now })
    const set: DocumentCommand = { type: 'setTextMark', nodeId: paragraph.id, from: 0, to: 5, mark: { type: 'bold' } }

    expect(queryDocumentCommandState(document, set)).toMatchObject({ canExecute: true, active: false })
    const marked = executeDocumentCommand(document, set, context('mark'))
    expect(marked.ok).toBe(true)
    expect((marked.document.content[0] as typeof paragraph).content).toEqual([
      { type: 'text', text: 'Hello', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' world' },
    ])
    expect(queryDocumentCommandState(marked.document, set)).toMatchObject({ canExecute: true, active: true })

    const unset: DocumentCommand = { type: 'unsetTextMark', nodeId: paragraph.id, from: 0, to: 5, markType: 'bold' }
    const unmarked = executeDocumentCommand(marked.document, unset, context('unmark'))
    expect(unmarked.ok).toBe(true)
    expect((unmarked.document.content[0] as typeof paragraph).content).toEqual([{ type: 'text', text: 'Hello world' }])
  })

  it('replaces text, applies alignment, deletes nodes, and exposes command state', () => {
    const paragraph = createParagraph({ id: id('edit'), text: 'Original' })
    const document = createDocument({ id: 'document:editing', content: [paragraph], now })
    const replacement = executeDocumentCommand(document, {
      type: 'replaceText', nodeId: paragraph.id, from: 0, to: 8, text: 'Replacement', marks: [{ type: 'italic' }],
    }, context('replace'))
    expect(replacement.ok).toBe(true)

    const alignment: DocumentCommand = { type: 'setBlockAlignment', nodeId: paragraph.id, alignment: 'center' }
    expect(queryDocumentCommandState(replacement.document, alignment)).toMatchObject({ active: false, value: 'left' })
    const aligned = executeDocumentCommand(replacement.document, alignment, context('align'))
    expect(aligned.ok).toBe(true)
    expect(queryDocumentCommandState(aligned.document, alignment)).toMatchObject({ active: true, value: 'center' })

    const deleted = executeDocumentCommand(aligned.document, { type: 'deleteNode', nodeId: paragraph.id }, context('delete'))
    expect(deleted.ok).toBe(true)
    expect(deleted.document.content).toEqual([])
    expect(queryDocumentCommandState(deleted.document, { type: 'deleteNode', nodeId: paragraph.id }).canExecute).toBe(false)
  })

  it('updates and queries page setup through a transaction operation', () => {
    const document = emptyDocument()
    const pageSetup = { ...DEFAULT_PAGE_SETUP, mode: 'paginated' as const, size: 'letter' as const, margins: { ...DEFAULT_PAGE_SETUP.margins, left: 54 } }
    const command: DocumentCommand = { type: 'setPageSetup', pageSetup }

    expect(queryDocumentCommandState(document, command)).toMatchObject({ canExecute: true, active: false })
    const result = executeDocumentCommand(document, command, context('page-setup'))
    expect(result.ok).toBe(true)
    expect(result.document.metadata.pageSetup).toEqual(pageSetup)
    expect(queryDocumentCommandState(result.document, command)).toMatchObject({ canExecute: true, active: true })
  })
})

describe('list indentation commands', () => {
  const listDocument = (): IncantlyDocument => {
    const list: DocumentNode = {
      id: id('outer-list'), type: 'bulletList', content: [
        { id: id('first-item'), type: 'listItem', content: [createParagraph({ id: id('first-p'), text: 'First' })] },
        { id: id('second-item'), type: 'listItem', content: [createParagraph({ id: id('second-p'), text: 'Second' })] },
      ],
    }
    return createDocument({ id: 'document:indent', content: [list], now })
  }

  it('indents under the previous item and outdents back into the outer list', () => {
    const document = listDocument()
    const indent: DocumentCommand = { type: 'indentListItem', nodeId: id('second-item'), nestedListId: id('nested-list') }
    const indented = executeDocumentCommand(document, indent, context('indent'))

    expect(indented.ok).toBe(true)
    const outer = indented.document.content[0] as Extract<DocumentNode, { type: 'bulletList' }>
    expect(outer.content).toHaveLength(1)
    const nested = outer.content[0].content[1] as Extract<DocumentNode, { type: 'bulletList' }>
    expect(nested.content.map((item) => item.id)).toEqual([id('second-item')])

    const outdent: DocumentCommand = { type: 'outdentListItem', nodeId: id('second-item') }
    const outdented = executeDocumentCommand(indented.document, outdent, context('outdent'))
    expect(outdented.ok).toBe(true)
    expect((outdented.document.content[0] as Extract<DocumentNode, { type: 'bulletList' }>).content.map((item) => item.id))
      .toEqual([id('first-item'), id('second-item')])
  })

  it('reports unavailable indentation through capability queries', () => {
    const document = listDocument()
    expect(queryDocumentCommandState(document, {
      type: 'indentListItem', nodeId: id('first-item'), nestedListId: id('unused'),
    })).toMatchObject({ canExecute: false, active: false })
    expect(queryDocumentCommandState(document, {
      type: 'outdentListItem', nodeId: id('second-item'),
    })).toMatchObject({ canExecute: false, active: false })
  })
})
