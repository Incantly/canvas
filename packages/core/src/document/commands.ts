import { normalizeInlineContent, normalizeTextMarks } from './inline.js'
import { assetId, type AssetId, type DocumentNodeId, type DocumentTransactionId } from './ids.js'
import type { DocumentOperation } from './operations.js'
import {
  applyDocumentTransaction,
  type ApplyDocumentTransactionResult,
  type DocumentTransaction,
  type DocumentTransactionOrigin,
} from './transactions.js'
import type {
  DocumentNode, IncantlyDocument, InlineNode, PageSetup, TextAlignment, TextMark, TextMarkType,
} from './types.js'
import { validateDocument } from './validate.js'

interface InsertPosition { parentId?: DocumentNodeId; index: number }
interface TextSeed { text?: string }

export interface InsertParagraphCommand extends InsertPosition, TextSeed { type: 'insertParagraph'; nodeId: DocumentNodeId }
export interface InsertHeadingCommand extends InsertPosition, TextSeed { type: 'insertHeading'; nodeId: DocumentNodeId; level: 1 | 2 | 3 | 4 | 5 | 6 }
export interface InsertBlockquoteCommand extends InsertPosition, TextSeed { type: 'insertBlockquote'; nodeId: DocumentNodeId; paragraphId: DocumentNodeId }
export interface InsertBulletListCommand extends InsertPosition, TextSeed { type: 'insertBulletList'; nodeId: DocumentNodeId; itemId: DocumentNodeId; paragraphId: DocumentNodeId }
export interface InsertOrderedListCommand extends InsertPosition, TextSeed { type: 'insertOrderedList'; nodeId: DocumentNodeId; itemId: DocumentNodeId; paragraphId: DocumentNodeId; start?: number }
export interface InsertChecklistCommand extends InsertPosition, TextSeed { type: 'insertChecklist'; nodeId: DocumentNodeId; itemId: DocumentNodeId; paragraphId: DocumentNodeId; checked?: boolean }
export interface InsertHorizontalRuleCommand extends InsertPosition { type: 'insertHorizontalRule'; nodeId: DocumentNodeId }
export interface InsertCodeBlockCommand extends InsertPosition, TextSeed { type: 'insertCodeBlock'; nodeId: DocumentNodeId; language?: string }
export interface InsertMathBlockCommand extends InsertPosition { type: 'insertMathBlock'; nodeId: DocumentNodeId; latex: string; numbered?: boolean; label?: string }

export interface InsertTableCommandIds {
  tableId: DocumentNodeId
  rowIds: DocumentNodeId[]
  cellIds: DocumentNodeId[][]
  paragraphIds: DocumentNodeId[][]
}
export interface InsertTableCommand extends InsertPosition {
  type: 'insertTable'
  rows: number
  columns: number
  headerRow?: boolean
  ids: InsertTableCommandIds
}

export interface InsertImageCommand extends InsertPosition { type: 'insertImage'; nodeId: DocumentNodeId; assetId: AssetId; alt?: string; caption?: string }
export interface InsertFileAttachmentCommand extends InsertPosition { type: 'insertFileAttachment'; nodeId: DocumentNodeId; assetId: AssetId; filename?: string; mimeType?: string }
export interface InsertAudioCommand extends InsertPosition { type: 'insertAudio'; nodeId: DocumentNodeId; assetId: AssetId; title?: string; caption?: string }
export interface InsertVideoEmbedCommand extends InsertPosition { type: 'insertVideoEmbed'; nodeId: DocumentNodeId; provider: 'youtube' | 'vimeo'; videoId: string; title?: string; caption?: string }
export interface InsertPdfEmbedCommand extends InsertPosition { type: 'insertPdfEmbed'; nodeId: DocumentNodeId; assetId: AssetId; page?: number; display?: 'card' | 'preview' | 'reader' }
export interface InsertCanvasEmbedCommand extends InsertPosition { type: 'insertCanvasEmbed'; nodeId: DocumentNodeId; canvasId: string; previewAssetId?: AssetId; caption?: string }
export interface InsertPageBreakCommand extends InsertPosition { type: 'insertPageBreak'; nodeId: DocumentNodeId }

export interface SetTextMarkCommand { type: 'setTextMark'; nodeId: DocumentNodeId; from: number; to: number; mark: TextMark }
export interface UnsetTextMarkCommand { type: 'unsetTextMark'; nodeId: DocumentNodeId; from: number; to: number; markType: TextMarkType }
export interface ReplaceTextCommand { type: 'replaceText'; nodeId: DocumentNodeId; from: number; to: number; text: string; marks?: TextMark[] }
export interface DeleteNodeCommand { type: 'deleteNode'; nodeId: DocumentNodeId }
export interface SetBlockAlignmentCommand { type: 'setBlockAlignment'; nodeId: DocumentNodeId; alignment: TextAlignment }
export interface IndentListItemCommand { type: 'indentListItem'; nodeId: DocumentNodeId; nestedListId?: DocumentNodeId }
export interface OutdentListItemCommand { type: 'outdentListItem'; nodeId: DocumentNodeId }
export interface SetPageSetupCommand { type: 'setPageSetup'; pageSetup: PageSetup }

export type DocumentCommand =
  | InsertParagraphCommand | InsertHeadingCommand | InsertBlockquoteCommand
  | InsertBulletListCommand | InsertOrderedListCommand | InsertChecklistCommand
  | InsertHorizontalRuleCommand | InsertCodeBlockCommand | InsertMathBlockCommand
  | InsertTableCommand | InsertImageCommand | InsertFileAttachmentCommand | InsertAudioCommand
  | InsertVideoEmbedCommand | InsertPdfEmbedCommand | InsertCanvasEmbedCommand | InsertPageBreakCommand
  | SetTextMarkCommand | UnsetTextMarkCommand | ReplaceTextCommand | DeleteNodeCommand
  | SetBlockAlignmentCommand | IndentListItemCommand | OutdentListItemCommand | SetPageSetupCommand

export type DocumentCommandIssueCode = 'node_not_found' | 'invalid_target' | 'invalid_range' | 'invalid_payload' | 'not_available'
export interface DocumentCommandIssue { code: DocumentCommandIssueCode; path: string; message: string }
export interface DocumentCommandPlanResult { ok: boolean; operations: DocumentOperation[]; issues: DocumentCommandIssue[] }
export interface DocumentCommandState {
  canExecute: boolean
  active: boolean
  value?: unknown
  issues: DocumentCommandIssue[]
}
export interface DocumentCommandExecutionContext {
  transactionId: DocumentTransactionId
  timestamp: string
  origin?: DocumentTransactionOrigin
}
export interface ExecuteDocumentCommandResult extends ApplyDocumentTransactionResult {
  commandType: DocumentCommand['type']
  commandIssues: DocumentCommandIssue[]
}

interface NodeEntry { node: DocumentNode; parentId?: DocumentNodeId; container: DocumentNode[]; index: number }
const CONTAINER_TYPES = new Set(['blockquote', 'bulletList', 'orderedList', 'checklist', 'listItem', 'checklistItem', 'table', 'tableRow', 'tableHeaderCell', 'tableCell'])
const children = (node: DocumentNode): DocumentNode[] =>
  CONTAINER_TYPES.has(node.type) ? (node as DocumentNode & { content: DocumentNode[] }).content : []

function roots(document: IncantlyDocument): DocumentNode[][] {
  return document.metadata.research?.abstract ? [document.content, document.metadata.research.abstract] : [document.content]
}

function findEntry(document: IncantlyDocument, id: DocumentNodeId): NodeEntry | null {
  const pending: Array<{ container: DocumentNode[]; parentId?: DocumentNodeId }> = roots(document).map((container) => ({ container }))
  while (pending.length) {
    const current = pending.pop() as { container: DocumentNode[]; parentId?: DocumentNodeId }
    for (let index = 0; index < current.container.length; index++) {
      const node = current.container[index]
      if (node.id === id) return { node, container: current.container, index, ...(current.parentId ? { parentId: current.parentId } : {}) }
      const content = children(node)
      if (content.length) pending.push({ container: content, parentId: node.id })
    }
  }
  return null
}

const cloneNode = <T extends DocumentNode>(node: T): T => JSON.parse(JSON.stringify(node)) as T
const inline = (text = ''): InlineNode[] => text ? [{ type: 'text', text }] : []
const paragraph = (id: DocumentNodeId, text = ''): DocumentNode => ({ id, type: 'paragraph', content: inline(text) })
const fail = (code: DocumentCommandIssueCode, path: string, message: string): DocumentCommandPlanResult =>
  ({ ok: false, operations: [], issues: [{ code, path, message }] })
const success = (...operations: DocumentOperation[]): DocumentCommandPlanResult => ({ ok: true, operations, issues: [] })

function validChild(parent: DocumentNode | undefined, node: DocumentNode): boolean {
  if (!parent) return !['listItem', 'checklistItem', 'tableRow', 'tableHeaderCell', 'tableCell'].includes(node.type)
  if (parent.type === 'bulletList' || parent.type === 'orderedList') return node.type === 'listItem'
  if (parent.type === 'checklist') return node.type === 'checklistItem'
  if (parent.type === 'table') return node.type === 'tableRow'
  if (parent.type === 'tableRow') return node.type === 'tableHeaderCell' || node.type === 'tableCell'
  return ['blockquote', 'listItem', 'checklistItem', 'tableHeaderCell', 'tableCell'].includes(parent.type)
    && !['listItem', 'checklistItem', 'tableRow', 'tableHeaderCell', 'tableCell'].includes(node.type)
}

function planInsert(document: IncantlyDocument, command: InsertPosition, node: DocumentNode): DocumentCommandPlanResult {
  const parent = command.parentId ? findEntry(document, command.parentId)?.node : undefined
  if (command.parentId && !parent) return fail('node_not_found', '$.parentId', 'Insertion parent was not found')
  const container = parent ? children(parent) : document.content
  if (parent && !CONTAINER_TYPES.has(parent.type)) return fail('invalid_target', '$.parentId', 'Insertion parent cannot contain block nodes')
  if (!Number.isInteger(command.index) || command.index < 0 || command.index > container.length)
    return fail('invalid_range', '$.index', 'Insertion index is out of bounds')
  if (!validChild(parent, node)) return fail('invalid_target', '$.parentId', `${node.type} is not valid in this parent`)
  return success({ type: 'insertNode', ...(command.parentId ? { parentId: command.parentId } : {}), index: command.index, node })
}

function inlineLength(content: readonly InlineNode[]): number {
  return content.reduce((sum, node) => sum + (node.type === 'text' ? node.text.length : 1), 0)
}

function transformMarks(content: readonly InlineNode[], from: number, to: number,
  transform: (marks: TextMark[]) => TextMark[]): InlineNode[] {
  let offset = 0
  const output: InlineNode[] = []
  for (const node of content) {
    const length = node.type === 'text' ? node.text.length : 1
    if (node.type === 'hardBreak' || to <= offset || from >= offset + length) output.push(node.type === 'text' ? { ...node, ...(node.marks ? { marks: node.marks.map((mark) => ({ ...mark })) } : {}) } : { type: 'hardBreak' })
    else {
      const localFrom = Math.max(0, from - offset)
      const localTo = Math.min(length, to - offset)
      if (localFrom > 0) output.push({ type: 'text', text: node.text.slice(0, localFrom), ...(node.marks ? { marks: node.marks.map((mark) => ({ ...mark })) } : {}) })
      const selected = node.text.slice(localFrom, localTo)
      const marks = transform(node.marks ? node.marks.map((mark) => ({ ...mark })) : [])
      if (selected) output.push({ type: 'text', text: selected, ...(marks.length ? { marks } : {}) })
      if (localTo < length) output.push({ type: 'text', text: node.text.slice(localTo), ...(node.marks ? { marks: node.marks.map((mark) => ({ ...mark })) } : {}) })
    }
    offset += length
  }
  return normalizeInlineContent(output)
}

function planMark(document: IncantlyDocument, command: SetTextMarkCommand | UnsetTextMarkCommand): DocumentCommandPlanResult {
  const entry = findEntry(document, command.nodeId)
  if (!entry) return fail('node_not_found', '$.nodeId', 'Text block was not found')
  if (entry.node.type !== 'paragraph' && entry.node.type !== 'heading') return fail('invalid_target', '$.nodeId', 'Marks require a paragraph or heading')
  const length = inlineLength(entry.node.content)
  if (!Number.isInteger(command.from) || !Number.isInteger(command.to) || command.from < 0 || command.to <= command.from || command.to > length)
    return fail('invalid_range', '$', 'Mark range must be a non-empty range within the inline content')
  const node = cloneNode(entry.node)
  node.content = command.type === 'setTextMark'
    ? transformMarks(node.content, command.from, command.to, (marks) => normalizeTextMarks([...marks, command.mark]))
    : transformMarks(node.content, command.from, command.to, (marks) => marks.filter((mark) => mark.type !== command.markType))
  return success({ type: 'updateNode', nodeId: command.nodeId, node })
}

function planIndent(document: IncantlyDocument, command: IndentListItemCommand): DocumentCommandPlanResult {
  const item = findEntry(document, command.nodeId)
  if (!item) return fail('node_not_found', '$.nodeId', 'List item was not found')
  if (item.node.type !== 'listItem' && item.node.type !== 'checklistItem') return fail('invalid_target', '$.nodeId', 'Only list items can be indented')
  if (!item.parentId) return fail('not_available', '$.nodeId', 'List item has no containing list')
  const list = findEntry(document, item.parentId)
  if (!list || (list.node.type !== 'bulletList' && list.node.type !== 'orderedList' && list.node.type !== 'checklist')) return fail('invalid_target', '$.nodeId', 'List item parent is invalid')
  if (item.index === 0) return fail('not_available', '$.nodeId', 'The first list item cannot be indented')
  const previous = list.node.content[item.index - 1]
  if (!previous || (previous.type !== 'listItem' && previous.type !== 'checklistItem')) return fail('not_available', '$.nodeId', 'No previous list item is available')
  const nested = previous.content.find((node): node is Extract<DocumentNode, { type: 'bulletList' | 'orderedList' | 'checklist' }> =>
    node.type === list.node.type)
  if (nested) return success({ type: 'moveNode', nodeId: item.node.id, parentId: nested.id, index: nested.content.length })
  if (!command.nestedListId) return fail('invalid_payload', '$.nestedListId', 'A nestedListId is required when creating a nested list')
  const updatedPrevious = cloneNode(previous)
  const nestedList = { id: command.nestedListId, type: list.node.type, content: [cloneNode(item.node)] } as DocumentNode
  updatedPrevious.content.push(nestedList)
  return success(
    { type: 'updateNode', nodeId: previous.id, node: updatedPrevious },
    { type: 'deleteNode', nodeId: item.node.id },
  )
}

function planOutdent(document: IncantlyDocument, command: OutdentListItemCommand): DocumentCommandPlanResult {
  const item = findEntry(document, command.nodeId)
  if (!item) return fail('node_not_found', '$.nodeId', 'List item was not found')
  if (!item.parentId) return fail('not_available', '$.nodeId', 'List item is not nested')
  const innerList = findEntry(document, item.parentId)
  if (!innerList?.parentId) return fail('not_available', '$.nodeId', 'List item is already at the outermost level')
  const parentItem = findEntry(document, innerList.parentId)
  if (!parentItem?.parentId || (parentItem.node.type !== 'listItem' && parentItem.node.type !== 'checklistItem'))
    return fail('not_available', '$.nodeId', 'Nested list has no parent list item')
  const outerList = findEntry(document, parentItem.parentId)
  if (!outerList || (outerList.node.type !== 'bulletList' && outerList.node.type !== 'orderedList' && outerList.node.type !== 'checklist'))
    return fail('invalid_target', '$.nodeId', 'Outer list is invalid')
  return success({ type: 'moveNode', nodeId: item.node.id, parentId: outerList.node.id, index: parentItem.index + 1 })
}

export function documentCommandToOperations(document: IncantlyDocument, command: DocumentCommand): DocumentCommandPlanResult {
  switch (command.type) {
    case 'insertParagraph': return planInsert(document, command, paragraph(command.nodeId, command.text))
    case 'insertHeading': return planInsert(document, command, { id: command.nodeId, type: 'heading', attrs: { level: command.level }, content: inline(command.text) })
    case 'insertBlockquote': return planInsert(document, command, { id: command.nodeId, type: 'blockquote', content: [paragraph(command.paragraphId, command.text)] })
    case 'insertBulletList': return planInsert(document, command, { id: command.nodeId, type: 'bulletList', content: [{ id: command.itemId, type: 'listItem', content: [paragraph(command.paragraphId, command.text)] }] })
    case 'insertOrderedList': return planInsert(document, command, { id: command.nodeId, type: 'orderedList', ...(command.start && command.start !== 1 ? { attrs: { start: command.start } } : {}), content: [{ id: command.itemId, type: 'listItem', content: [paragraph(command.paragraphId, command.text)] }] })
    case 'insertChecklist': return planInsert(document, command, { id: command.nodeId, type: 'checklist', content: [{ id: command.itemId, type: 'checklistItem', attrs: { checked: command.checked === true }, content: [paragraph(command.paragraphId, command.text)] }] })
    case 'insertHorizontalRule': return planInsert(document, command, { id: command.nodeId, type: 'horizontalRule' })
    case 'insertCodeBlock': return planInsert(document, command, { id: command.nodeId, type: 'codeBlock', ...(command.language ? { attrs: { language: command.language } } : {}), text: command.text ?? '' })
    case 'insertMathBlock': return planInsert(document, command, { id: command.nodeId, type: 'mathBlock', attrs: { latex: command.latex, ...(command.numbered ? { numbered: true } : {}), ...(command.label ? { label: command.label } : {}) } })
    case 'insertTable': {
      if (!Number.isInteger(command.rows) || !Number.isInteger(command.columns) || command.rows < 1 || command.columns < 1)
        return fail('invalid_payload', '$', 'Table rows and columns must be positive integers')
      if (command.ids.rowIds.length !== command.rows || command.ids.cellIds.length !== command.rows || command.ids.paragraphIds.length !== command.rows
        || command.ids.cellIds.some((row) => row.length !== command.columns) || command.ids.paragraphIds.some((row) => row.length !== command.columns))
        return fail('invalid_payload', '$.ids', 'Table IDs must match the requested dimensions')
      const content = Array.from({ length: command.rows }, (_, row) => ({
        id: command.ids.rowIds[row], type: 'tableRow' as const,
        content: Array.from({ length: command.columns }, (_, column) => ({
          id: command.ids.cellIds[row][column], type: command.headerRow && row === 0 ? 'tableHeaderCell' as const : 'tableCell' as const,
          content: [paragraph(command.ids.paragraphIds[row][column])],
        })),
      }))
      return planInsert(document, command, { id: command.ids.tableId, type: 'table', content })
    }
    case 'insertImage': return planInsert(document, command, { id: command.nodeId, type: 'image', attrs: { assetId: command.assetId, ...(command.alt ? { alt: command.alt } : {}), ...(command.caption ? { caption: command.caption } : {}) } })
    case 'insertFileAttachment': return planInsert(document, command, { id: command.nodeId, type: 'fileAttachment', attrs: { assetId: command.assetId, ...(command.filename ? { filename: command.filename } : {}), ...(command.mimeType ? { mimeType: command.mimeType } : {}) } })
    case 'insertAudio': return planInsert(document, command, { id: command.nodeId, type: 'audio', attrs: { assetId: command.assetId, ...(command.title ? { title: command.title } : {}), ...(command.caption ? { caption: command.caption } : {}) } })
    case 'insertVideoEmbed': return planInsert(document, command, { id: command.nodeId, type: 'videoEmbed', attrs: { provider: command.provider, videoId: command.videoId, ...(command.title ? { title: command.title } : {}), ...(command.caption ? { caption: command.caption } : {}) } })
    case 'insertPdfEmbed': return planInsert(document, command, { id: command.nodeId, type: 'pdfEmbed', attrs: { assetId: command.assetId, ...(command.page ? { page: command.page } : {}), display: command.display ?? 'card' } })
    case 'insertCanvasEmbed': return planInsert(document, command, { id: command.nodeId, type: 'canvasEmbed', attrs: { canvasId: command.canvasId, ...(command.previewAssetId ? { previewAssetId: command.previewAssetId } : {}), ...(command.caption ? { caption: command.caption } : {}) } })
    case 'insertPageBreak': return planInsert(document, command, { id: command.nodeId, type: 'pageBreak' })
    case 'setTextMark': case 'unsetTextMark': return planMark(document, command)
    case 'replaceText': {
      const node = findEntry(document, command.nodeId)?.node
      if (!node) return fail('node_not_found', '$.nodeId', 'Text block was not found')
      if (node.type !== 'paragraph' && node.type !== 'heading' && node.type !== 'codeBlock') return fail('invalid_target', '$.nodeId', 'Text replacement requires a paragraph, heading, or code block')
      const length = node.type === 'codeBlock' ? node.text.length : inlineLength(node.content)
      if (!Number.isInteger(command.from) || !Number.isInteger(command.to) || command.from < 0 || command.to < command.from || command.to > length)
        return fail('invalid_range', '$', 'Replacement range is outside the text block')
      if (node.type === 'codeBlock' && command.marks?.length) return fail('invalid_payload', '$.marks', 'Code blocks do not accept inline marks')
      return success({ type: 'replaceText', nodeId: command.nodeId, from: command.from, to: command.to, text: command.text, ...(command.marks ? { marks: command.marks } : {}) })
    }
    case 'deleteNode': return findEntry(document, command.nodeId) ? success({ type: 'deleteNode', nodeId: command.nodeId }) : fail('node_not_found', '$.nodeId', 'Node to delete was not found')
    case 'setBlockAlignment': {
      const entry = findEntry(document, command.nodeId)
      if (!entry) return fail('node_not_found', '$.nodeId', 'Block was not found')
      if (entry.node.type !== 'paragraph' && entry.node.type !== 'heading') return fail('invalid_target', '$.nodeId', 'Alignment requires a paragraph or heading')
      const node = cloneNode(entry.node)
      node.attrs = { ...(node.attrs ?? {}), alignment: command.alignment } as typeof node.attrs
      return success({ type: 'updateNode', nodeId: node.id, node })
    }
    case 'indentListItem': return planIndent(document, command)
    case 'outdentListItem': return planOutdent(document, command)
    case 'setPageSetup': {
      const candidate = { ...document, metadata: { ...document.metadata, pageSetup: command.pageSetup } }
      if (!validateDocument(candidate).valid) return fail('invalid_payload', '$.pageSetup', 'Page setup is invalid')
      return success({ type: 'setPageSetup', pageSetup: command.pageSetup })
    }
  }
}

function markIsActive(node: Extract<DocumentNode, { type: 'paragraph' | 'heading' }>,
  from: number, to: number, markType: TextMarkType): boolean {
  let offset = 0
  let sawText = false
  for (const inlineNode of node.content) {
    const length = inlineNode.type === 'text' ? inlineNode.text.length : 1
    if (inlineNode.type === 'text' && from < offset + length && to > offset) {
      sawText = true
      if (!inlineNode.marks?.some((mark) => mark.type === markType)) return false
    }
    offset += length
  }
  return sawText
}

export function queryDocumentCommandState(document: IncantlyDocument, command: DocumentCommand): DocumentCommandState {
  const plan = documentCommandToOperations(document, command)
  if (!plan.ok) return { canExecute: false, active: false, issues: plan.issues }
  if (command.type === 'setTextMark' || command.type === 'unsetTextMark') {
    const node = findEntry(document, command.nodeId)?.node
    const active = !!node && (node.type === 'paragraph' || node.type === 'heading')
      && markIsActive(node, command.from, command.to, command.type === 'setTextMark' ? command.mark.type : command.markType)
    return { canExecute: true, active, issues: [] }
  }
  if (command.type === 'setBlockAlignment') {
    const node = findEntry(document, command.nodeId)?.node
    const value = node && (node.type === 'paragraph' || node.type === 'heading') ? node.attrs?.alignment ?? 'left' : undefined
    return { canExecute: true, active: value === command.alignment, value, issues: [] }
  }
  if (command.type === 'setPageSetup')
    return { canExecute: true, active: JSON.stringify(document.metadata.pageSetup) === JSON.stringify(command.pageSetup), value: document.metadata.pageSetup, issues: [] }
  return { canExecute: true, active: false, issues: [] }
}

export function executeDocumentCommand(document: IncantlyDocument, command: DocumentCommand,
  context: DocumentCommandExecutionContext): ExecuteDocumentCommandResult {
  const plan = documentCommandToOperations(document, command)
  if (!plan.ok) return {
    ok: false,
    document,
    changedNodeIds: [],
    issues: [],
    validationIssues: [],
    commandType: command.type,
    commandIssues: plan.issues,
  }
  const transaction: DocumentTransaction = {
    id: context.transactionId,
    documentId: document.id,
    origin: context.origin ?? 'user',
    timestamp: context.timestamp,
    operations: plan.operations,
  }
  return { ...applyDocumentTransaction(document, transaction), commandType: command.type, commandIssues: [] }
}

/** Convenience helper for hosts converting uploaded IDs into command payloads. */
export const commandAssetId = assetId
