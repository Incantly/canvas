import { normalizeInlineContent } from './inline.js'
import type { DocumentId, DocumentNodeId, DocumentTransactionId } from './ids.js'
import type { DocumentOperation, ReplaceDocumentTextOperation } from './operations.js'
import type { DocumentNode, IncantlyDocument, InlineNode, TextMark } from './types.js'
import { validateDocument, type DocumentValidationIssue } from './validate.js'

export type DocumentTransactionOrigin = 'user' | 'remote' | 'ai' | 'import' | 'migration' | 'system'

export interface DocumentTransaction {
  id: DocumentTransactionId
  documentId: DocumentId
  origin: DocumentTransactionOrigin
  /** ISO UTC timestamp. Used as the successful document updatedAt value. */
  timestamp: string
  operations: readonly DocumentOperation[]
}

export interface DocumentTransactionBatchLimits {
  maxOperations: number
  maxInsertedNodes: number
  maxInsertedTextLength: number
}

export const DOCUMENT_TRANSACTION_LIMITS: Readonly<Record<DocumentTransactionOrigin, DocumentTransactionBatchLimits>> = {
  user: { maxOperations: 1_000, maxInsertedNodes: 5_000, maxInsertedTextLength: 250_000 },
  remote: { maxOperations: 2_000, maxInsertedNodes: 10_000, maxInsertedTextLength: 500_000 },
  ai: { maxOperations: 5_000, maxInsertedNodes: 50_000, maxInsertedTextLength: 1_000_000 },
  import: { maxOperations: 10_000, maxInsertedNodes: 100_000, maxInsertedTextLength: 2_000_000 },
  migration: { maxOperations: 10_000, maxInsertedNodes: 100_000, maxInsertedTextLength: 2_000_000 },
  system: { maxOperations: 5_000, maxInsertedNodes: 50_000, maxInsertedTextLength: 1_000_000 },
}

export type DocumentTransactionIssueCode =
  | 'document_id_mismatch' | 'invalid_transaction' | 'operation_limit'
  | 'node_not_found' | 'parent_not_found' | 'invalid_index' | 'invalid_target'
  | 'invalid_text_range' | 'asset_target_mismatch'

export interface DocumentTransactionIssue {
  code: DocumentTransactionIssueCode
  operationIndex?: number
  path: string
  message: string
}

export interface ApplyDocumentTransactionResult {
  ok: boolean
  /** Updated document on success; the original input object on rollback. */
  document: IncantlyDocument
  changedNodeIds: DocumentNodeId[]
  issues: DocumentTransactionIssue[]
  validationIssues: DocumentValidationIssue[]
}

interface NodeLocation {
  node: DocumentNode
  container: DocumentNode[]
  index: number
  parentId?: DocumentNodeId
}

const isContainerNode = (node: DocumentNode): node is DocumentNode & { content: DocumentNode[] } =>
  ['blockquote', 'bulletList', 'orderedList', 'checklist', 'listItem', 'checklistItem',
    'table', 'tableRow', 'tableHeaderCell', 'tableCell'].includes(node.type)

function childNodes(node: DocumentNode): DocumentNode[] {
  return isContainerNode(node) ? node.content as DocumentNode[] : []
}

function documentRoots(document: IncantlyDocument): DocumentNode[][] {
  const roots = [document.content]
  const abstract = document.metadata.research?.abstract
  if (abstract) roots.push(abstract)
  return roots
}

function findNode(document: IncantlyDocument, id: DocumentNodeId): NodeLocation | null {
  const pending: Array<{ container: DocumentNode[]; parentId?: DocumentNodeId }> =
    documentRoots(document).map((container) => ({ container }))
  while (pending.length) {
    const { container, parentId } = pending.pop() as { container: DocumentNode[]; parentId?: DocumentNodeId }
    for (let index = 0; index < container.length; index++) {
      const node = container[index]
      if (node.id === id) return { node, container, index, ...(parentId ? { parentId } : {}) }
      const children = childNodes(node)
      if (children.length) pending.push({ container: children, parentId: node.id })
    }
  }
  return null
}

function destinationContainer(document: IncantlyDocument, parentId: DocumentNodeId | undefined): DocumentNode[] | null {
  if (!parentId) return document.content
  const parent = findNode(document, parentId)?.node
  return parent && isContainerNode(parent) ? parent.content as DocumentNode[] : null
}

function collectNodeIds(node: DocumentNode, output: Set<DocumentNodeId>): void {
  const pending = [node]
  while (pending.length) {
    const current = pending.pop() as DocumentNode
    output.add(current.id)
    pending.push(...childNodes(current))
  }
}

function measureNode(node: DocumentNode): { nodes: number; text: number; cyclic: boolean } {
  let nodes = 0
  let text = 0
  const seen = new Set<object>()
  const pending = [node]
  while (pending.length) {
    const current = pending.pop() as DocumentNode
    if (seen.has(current)) return { nodes, text, cyclic: true }
    seen.add(current)
    nodes++
    if (current.type === 'paragraph' || current.type === 'heading')
      text += current.content.reduce((sum, inline) => sum + (inline.type === 'text' ? inline.text.length : 1), 0)
    else if (current.type === 'codeBlock') text += current.text.length
    else if (current.type === 'mathBlock') text += current.attrs.latex.length
    pending.push(...childNodes(current))
  }
  return { nodes, text, cyclic: false }
}

function cloneDocument(document: IncantlyDocument): IncantlyDocument {
  return JSON.parse(JSON.stringify(document)) as IncantlyDocument
}

function transactionIssue(code: DocumentTransactionIssueCode, path: string, message: string,
  operationIndex?: number): DocumentTransactionIssue {
  return { code, path, message, ...(operationIndex === undefined ? {} : { operationIndex }) }
}

function inlineLength(content: readonly InlineNode[]): number {
  return content.reduce((total, node) => total + (node.type === 'text' ? node.text.length : 1), 0)
}

function sliceInline(content: readonly InlineNode[], from: number, to: number): InlineNode[] {
  const output: InlineNode[] = []
  let offset = 0
  for (const node of content) {
    const length = node.type === 'text' ? node.text.length : 1
    const start = Math.max(0, from - offset)
    const end = Math.min(length, to - offset)
    if (start < end) {
      if (node.type === 'hardBreak') output.push({ type: 'hardBreak' })
      else {
        const text = node.text.slice(start, end)
        if (text) output.push({ type: 'text', text, ...(node.marks?.length ? { marks: node.marks.map((mark) => ({ ...mark })) } : {}) })
      }
    }
    offset += length
    if (offset >= to) break
  }
  return output
}

function textToInline(text: string, marks: readonly TextMark[] | undefined): InlineNode[] {
  const parts = text.split('\n')
  const output: InlineNode[] = []
  parts.forEach((part, index) => {
    if (part) output.push({ type: 'text', text: part, ...(marks?.length ? { marks: marks.map((mark) => ({ ...mark })) } : {}) })
    if (index < parts.length - 1) output.push({ type: 'hardBreak' })
  })
  return output
}

function replaceText(node: DocumentNode, operation: ReplaceDocumentTextOperation): DocumentTransactionIssue | null {
  if (!Number.isInteger(operation.from) || !Number.isInteger(operation.to) || operation.from < 0 || operation.to < operation.from)
    return transactionIssue('invalid_text_range', '', 'Text offsets must be ordered non-negative integers')
  if (node.type === 'codeBlock') {
    if (operation.marks?.length) return transactionIssue('invalid_target', '', 'Code-block text does not accept inline marks')
    if (operation.to > node.text.length) return transactionIssue('invalid_text_range', '', 'Text range exceeds the code block')
    node.text = node.text.slice(0, operation.from) + operation.text + node.text.slice(operation.to)
    return null
  }
  if (node.type !== 'paragraph' && node.type !== 'heading')
    return transactionIssue('invalid_target', '', 'Text can only be replaced in paragraphs, headings, or code blocks')
  const length = inlineLength(node.content)
  if (operation.to > length) return transactionIssue('invalid_text_range', '', 'Text range exceeds the inline content')
  node.content = normalizeInlineContent([
    ...sliceInline(node.content, 0, operation.from),
    ...textToInline(operation.text, operation.marks),
    ...sliceInline(node.content, operation.to, length),
  ])
  return null
}

function applyOperation(document: IncantlyDocument, operation: DocumentOperation, index: number,
  changed: Set<DocumentNodeId>): DocumentTransactionIssue | null {
  const path = `$.operations[${index}]`
  switch (operation.type) {
    case 'insertNode': {
      const container = destinationContainer(document, operation.parentId)
      if (!container) return transactionIssue('parent_not_found', `${path}.parentId`, 'Insertion parent is missing or cannot contain block nodes', index)
      if (!Number.isInteger(operation.index) || operation.index < 0 || operation.index > container.length)
        return transactionIssue('invalid_index', `${path}.index`, 'Insertion index is out of bounds', index)
      container.splice(operation.index, 0, cloneDocument({ content: [operation.node] } as IncantlyDocument).content[0])
      collectNodeIds(operation.node, changed)
      if (operation.parentId) changed.add(operation.parentId)
      return null
    }
    case 'updateNode': {
      const location = findNode(document, operation.nodeId)
      if (!location) return transactionIssue('node_not_found', `${path}.nodeId`, 'Node to update was not found', index)
      if (operation.node.id !== operation.nodeId)
        return transactionIssue('invalid_target', `${path}.node.id`, 'Replacement node ID must match nodeId', index)
      collectNodeIds(location.node, changed)
      collectNodeIds(operation.node, changed)
      location.container[location.index] = JSON.parse(JSON.stringify(operation.node)) as DocumentNode
      return null
    }
    case 'moveNode': {
      const source = findNode(document, operation.nodeId)
      if (!source) return transactionIssue('node_not_found', `${path}.nodeId`, 'Node to move was not found', index)
      const [node] = source.container.splice(source.index, 1)
      const container = destinationContainer(document, operation.parentId)
      if (!container) return transactionIssue('parent_not_found', `${path}.parentId`, 'Move parent is missing, inside the moved subtree, or cannot contain block nodes', index)
      if (!Number.isInteger(operation.index) || operation.index < 0 || operation.index > container.length)
        return transactionIssue('invalid_index', `${path}.index`, 'Move index is out of bounds after removal', index)
      container.splice(operation.index, 0, node)
      changed.add(operation.nodeId)
      if (source.parentId) changed.add(source.parentId)
      if (operation.parentId) changed.add(operation.parentId)
      return null
    }
    case 'deleteNode': {
      const location = findNode(document, operation.nodeId)
      if (!location) return transactionIssue('node_not_found', `${path}.nodeId`, 'Node to delete was not found', index)
      collectNodeIds(location.node, changed)
      location.container.splice(location.index, 1)
      if (location.parentId) changed.add(location.parentId)
      return null
    }
    case 'replaceText': {
      const location = findNode(document, operation.nodeId)
      if (!location) return transactionIssue('node_not_found', `${path}.nodeId`, 'Text node target was not found', index)
      const issue = replaceText(location.node, operation)
      if (issue) return { ...issue, path, operationIndex: index }
      changed.add(operation.nodeId)
      return null
    }
    case 'setAssetReference': {
      const location = findNode(document, operation.nodeId)
      if (!location) return transactionIssue('node_not_found', `${path}.nodeId`, 'Asset node target was not found', index)
      if (operation.slot === 'preview' && location.node.type === 'canvasEmbed')
        location.node.attrs.previewAssetId = operation.assetId
      else if (operation.slot === 'primary') {
        switch (location.node.type) {
          case 'image': case 'fileAttachment': case 'audio': case 'pdfEmbed':
            location.node.attrs.assetId = operation.assetId
            break
          default:
            return transactionIssue('asset_target_mismatch', path, 'Primary asset slot is not supported by this node type', index)
        }
      }
      else return transactionIssue('asset_target_mismatch', path, 'Asset slot is not supported by this node type', index)
      changed.add(operation.nodeId)
      return null
    }
    case 'clearAssetReference': {
      const location = findNode(document, operation.nodeId)
      if (!location) return transactionIssue('node_not_found', `${path}.nodeId`, 'Asset node target was not found', index)
      if (location.node.type !== 'canvasEmbed')
        return transactionIssue('asset_target_mismatch', path, 'Only optional canvas preview assets can be cleared', index)
      delete location.node.attrs.previewAssetId
      changed.add(operation.nodeId)
      return null
    }
  }
}

function preflightTransaction(transaction: DocumentTransaction): DocumentTransactionIssue[] {
  const issues: DocumentTransactionIssue[] = []
  if (!String(transaction.id).trim()) issues.push(transactionIssue('invalid_transaction', '$.id', 'Transaction ID is required'))
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(transaction.timestamp))
    issues.push(transactionIssue('invalid_transaction', '$.timestamp', 'Transaction timestamp must be an ISO UTC timestamp'))
  const limits = DOCUMENT_TRANSACTION_LIMITS[transaction.origin]
  if (!limits) { issues.push(transactionIssue('invalid_transaction', '$.origin', 'Transaction origin is invalid')); return issues }
  if (transaction.operations.length > limits.maxOperations)
    issues.push(transactionIssue('operation_limit', '$.operations', `Transaction exceeds the ${transaction.origin} operation limit of ${limits.maxOperations}`))
  let insertedNodes = 0
  let insertedText = 0
  transaction.operations.forEach((operation) => {
    if (operation.type === 'insertNode' || operation.type === 'updateNode') {
      const measurement = measureNode(operation.node)
      insertedNodes += measurement.nodes
      insertedText += measurement.text
      if (measurement.cyclic)
        issues.push(transactionIssue('invalid_transaction', '$.operations', 'Operation contains cyclic or reused node objects'))
    }
    else if (operation.type === 'replaceText') insertedText += operation.text.length
  })
  if (insertedNodes > limits.maxInsertedNodes)
    issues.push(transactionIssue('operation_limit', '$.operations', `Transaction exceeds the ${transaction.origin} inserted-node limit of ${limits.maxInsertedNodes}`))
  if (insertedText > limits.maxInsertedTextLength)
    issues.push(transactionIssue('operation_limit', '$.operations', `Transaction exceeds the ${transaction.origin} inserted-text limit of ${limits.maxInsertedTextLength}`))
  return issues
}

/** Applies a complete transaction atomically; any failure returns the original document unchanged. */
export function applyDocumentTransaction(document: IncantlyDocument,
  transaction: DocumentTransaction): ApplyDocumentTransactionResult {
  const originalValidation = validateDocument(document)
  if (!originalValidation.valid)
    return { ok: false, document, changedNodeIds: [], issues: [], validationIssues: originalValidation.issues }
  if (transaction.documentId !== document.id)
    return { ok: false, document, changedNodeIds: [], issues: [transactionIssue('document_id_mismatch', '$.documentId', 'Transaction documentId does not match the target document')], validationIssues: [] }
  const preflight = preflightTransaction(transaction)
  if (preflight.length) return { ok: false, document, changedNodeIds: [], issues: preflight, validationIssues: [] }

  let working: IncantlyDocument
  const changed = new Set<DocumentNodeId>()
  try {
    working = cloneDocument(document)
    for (let index = 0; index < transaction.operations.length; index++) {
      const operationIssue = applyOperation(working, transaction.operations[index], index, changed)
      if (operationIssue)
        return { ok: false, document, changedNodeIds: [], issues: [operationIssue], validationIssues: [] }
    }
  } catch {
    return { ok: false, document, changedNodeIds: [], issues: [transactionIssue('invalid_transaction', '$.operations', 'Transaction contains a non-serializable operation payload')], validationIssues: [] }
  }
  working.updatedAt = transaction.timestamp
  const validation = validateDocument(working)
  if (!validation.valid)
    return { ok: false, document, changedNodeIds: [], issues: [], validationIssues: validation.issues }
  return { ok: true, document: working, changedNodeIds: [...changed], issues: [], validationIssues: [] }
}
