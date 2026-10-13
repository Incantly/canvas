import type { DocumentId, DocumentNodeId } from './ids.js'
import type { DocumentOperation } from './operations.js'
import type { DocumentNode, IncantlyDocument } from './types.js'

export type DocumentSelectionAffinity = 'backward' | 'forward'

export interface DocumentTextPoint {
  nodeId: DocumentNodeId
  /** Node-local UTF-16 offset. This is not a ProseMirror document position. */
  offset: number
  affinity?: DocumentSelectionAffinity
}

interface DocumentSelectionBase { documentId: DocumentId }
export interface NoDocumentSelection extends DocumentSelectionBase { type: 'none' }
export interface DocumentTextSelection extends DocumentSelectionBase {
  type: 'text'
  anchor: DocumentTextPoint
  focus: DocumentTextPoint
}
export interface DocumentNodeSelection extends DocumentSelectionBase {
  type: 'node'
  nodeId: DocumentNodeId
}
export interface DocumentBlockRangeSelection extends DocumentSelectionBase {
  type: 'blockRange'
  anchorNodeId: DocumentNodeId
  focusNodeId: DocumentNodeId
}

export type DocumentSelection =
  | NoDocumentSelection | DocumentTextSelection | DocumentNodeSelection | DocumentBlockRangeSelection

export type DocumentSelectionIssueCode =
  | 'document_mismatch' | 'invalid_selection' | 'node_not_found'
  | 'invalid_text_target' | 'offset_out_of_bounds' | 'range_disconnected'

export interface DocumentSelectionIssue {
  code: DocumentSelectionIssueCode
  path: string
  message: string
}

export interface ResolvedDocumentSelection {
  selection: DocumentSelection
  selectedNodeIds: DocumentNodeId[]
  collapsed: boolean
  direction: 'forward' | 'backward'
}

export interface ResolveDocumentSelectionResult {
  ok: boolean
  resolved?: ResolvedDocumentSelection
  issues: DocumentSelectionIssue[]
}

export type DocumentSelectionMappingFailureCode =
  | DocumentSelectionIssueCode | 'selected_node_deleted' | 'selected_node_replaced'

export interface DocumentSelectionMappingFailure {
  code: DocumentSelectionMappingFailureCode
  path: string
  message: string
  nodeId?: DocumentNodeId
}

export interface MapDocumentSelectionResult {
  ok: boolean
  selection?: DocumentSelection
  failure?: DocumentSelectionMappingFailure
}

interface IndexedNode { node: DocumentNode; order: number }

function childNodes(node: DocumentNode): DocumentNode[] {
  switch (node.type) {
    case 'blockquote': case 'bulletList': case 'orderedList': case 'checklist':
    case 'listItem': case 'checklistItem': case 'table': case 'tableRow':
    case 'tableHeaderCell': case 'tableCell':
      return node.content as DocumentNode[]
    default:
      return []
  }
}

function indexDocumentNodes(document: IncantlyDocument): { byId: Map<DocumentNodeId, IndexedNode>; ordered: IndexedNode[] } {
  const ordered: IndexedNode[] = []
  const visit = (nodes: readonly DocumentNode[]): void => {
    for (const node of nodes) {
      const entry = { node, order: ordered.length }
      ordered.push(entry)
      // Valid documents have unique IDs; keep the first occurrence defensively.
      if (!byId.has(node.id)) byId.set(node.id, entry)
      visit(childNodes(node))
    }
  }
  const byId = new Map<DocumentNodeId, IndexedNode>()
  if (document.metadata.research?.abstract) visit(document.metadata.research.abstract)
  visit(document.content)
  return { byId, ordered }
}

function textLength(node: DocumentNode): number | null {
  if (node.type === 'codeBlock') return node.text.length
  if (node.type !== 'paragraph' && node.type !== 'heading') return null
  return node.content.reduce((length, inline) => length + (inline.type === 'text' ? inline.text.length : 1), 0)
}

function resolvePoint(point: DocumentTextPoint, path: string, index: ReturnType<typeof indexDocumentNodes>,
  issues: DocumentSelectionIssue[]): IndexedNode | null {
  const entry = index.byId.get(point.nodeId)
  if (!entry) { issues.push({ code: 'node_not_found', path: `${path}.nodeId`, message: `Selection node "${point.nodeId}" was not found` }); return null }
  const length = textLength(entry.node)
  if (length === null) { issues.push({ code: 'invalid_text_target', path: `${path}.nodeId`, message: `${entry.node.type} does not support text offsets` }); return null }
  if (!Number.isInteger(point.offset) || point.offset < 0 || point.offset > length) {
    issues.push({ code: 'offset_out_of_bounds', path: `${path}.offset`, message: `Offset must be between 0 and ${length}` })
    return null
  }
  if (point.affinity !== undefined && point.affinity !== 'backward' && point.affinity !== 'forward') {
    issues.push({ code: 'invalid_selection', path: `${path}.affinity`, message: 'Affinity must be backward or forward' })
    return null
  }
  return entry
}

/** Resolves a portable selection for toolbar state, AI operations, or a platform bridge. */
export function resolveDocumentSelection(document: IncantlyDocument,
  selection: DocumentSelection): ResolveDocumentSelectionResult {
  const issues: DocumentSelectionIssue[] = []
  if (selection.documentId !== document.id) {
    return { ok: false, issues: [{ code: 'document_mismatch', path: '$.documentId', message: 'Selection belongs to a different document' }] }
  }
  if (selection.type === 'none') return {
    ok: true,
    resolved: { selection, selectedNodeIds: [], collapsed: true, direction: 'forward' },
    issues,
  }
  const index = indexDocumentNodes(document)
  if (selection.type === 'node') {
    if (!index.byId.has(selection.nodeId)) return { ok: false, issues: [{ code: 'node_not_found', path: '$.nodeId', message: 'Selected node was not found' }] }
    return { ok: true, resolved: { selection, selectedNodeIds: [selection.nodeId], collapsed: false, direction: 'forward' }, issues }
  }
  if (selection.type === 'blockRange') {
    const anchor = index.byId.get(selection.anchorNodeId)
    const focus = index.byId.get(selection.focusNodeId)
    if (!anchor) issues.push({ code: 'node_not_found', path: '$.anchorNodeId', message: 'Range anchor node was not found' })
    if (!focus) issues.push({ code: 'node_not_found', path: '$.focusNodeId', message: 'Range focus node was not found' })
    if (!anchor || !focus) return { ok: false, issues }
    const start = Math.min(anchor.order, focus.order)
    const end = Math.max(anchor.order, focus.order)
    return {
      ok: true,
      resolved: {
        selection,
        selectedNodeIds: index.ordered.slice(start, end + 1).map((entry) => entry.node.id),
        collapsed: anchor.order === focus.order,
        direction: anchor.order <= focus.order ? 'forward' : 'backward',
      },
      issues,
    }
  }
  const anchor = resolvePoint(selection.anchor, '$.anchor', index, issues)
  const focus = resolvePoint(selection.focus, '$.focus', index, issues)
  if (!anchor || !focus) return { ok: false, issues }
  const start = Math.min(anchor.order, focus.order)
  const end = Math.max(anchor.order, focus.order)
  const sameNode = selection.anchor.nodeId === selection.focus.nodeId
  const collapsed = sameNode && selection.anchor.offset === selection.focus.offset
  const forward = anchor.order < focus.order || (sameNode && selection.anchor.offset <= selection.focus.offset)
  return {
    ok: true,
    resolved: {
      selection,
      selectedNodeIds: index.ordered.slice(start, end + 1).map((entry) => entry.node.id),
      collapsed,
      direction: forward ? 'forward' : 'backward',
    },
    issues,
  }
}

function mapPointThroughOperations(point: DocumentTextPoint, operations: readonly DocumentOperation[]): DocumentTextPoint {
  let offset = point.offset
  for (const operation of operations) {
    if (operation.type !== 'replaceText' || operation.nodeId !== point.nodeId) continue
    const removed = operation.to - operation.from
    const inserted = operation.text.length
    if (offset < operation.from) continue
    if (offset > operation.to) offset += inserted - removed
    else offset = operation.from + ((point.affinity ?? 'forward') === 'forward' ? inserted : 0)
  }
  return { ...point, offset }
}

function firstResolutionFailure(result: ResolveDocumentSelectionResult): DocumentSelectionMappingFailure {
  const issue = result.issues[0] ?? { code: 'invalid_selection' as const, path: '$', message: 'Selection is invalid' }
  return { ...issue }
}

/**
 * Maps a selection into a changed document. Transaction operations improve caret mapping;
 * without them, stable IDs and existing offsets are validated strictly against the result.
 */
export function mapDocumentSelection(selection: DocumentSelection, before: IncantlyDocument,
  after: IncantlyDocument, operations: readonly DocumentOperation[] = []): MapDocumentSelectionResult {
  const initial = resolveDocumentSelection(before, selection)
  if (!initial.ok) return { ok: false, failure: firstResolutionFailure(initial) }
  if (before.id !== after.id || selection.documentId !== after.id)
    return { ok: false, failure: { code: 'document_mismatch', path: '$.documentId', message: 'Cannot map a selection between different documents' } }

  let mapped: DocumentSelection = selection
  if (selection.type === 'text') mapped = {
    ...selection,
    anchor: mapPointThroughOperations(selection.anchor, operations),
    focus: mapPointThroughOperations(selection.focus, operations),
  }
  const resolved = resolveDocumentSelection(after, mapped)
  if (resolved.ok) return { ok: true, selection: mapped }
  const issue = resolved.issues[0]
  if (issue?.code === 'node_not_found') {
    const nodeId = selection.type === 'node' ? selection.nodeId
      : selection.type === 'blockRange'
        ? (issue.path.includes('focus') ? selection.focusNodeId : selection.anchorNodeId)
        : selection.type === 'text'
          ? (issue.path.includes('focus') ? selection.focus.nodeId : selection.anchor.nodeId)
          : undefined
    return { ok: false, failure: { code: 'selected_node_deleted', path: issue.path, message: issue.message, ...(nodeId ? { nodeId } : {}) } }
  }
  if (issue?.code === 'invalid_text_target') {
    const nodeId = selection.type === 'text' ? selection.anchor.nodeId : undefined
    return { ok: false, failure: { code: 'selected_node_replaced', path: issue.path, message: issue.message, ...(nodeId ? { nodeId } : {}) } }
  }
  return { ok: false, failure: firstResolutionFailure(resolved) }
}

export const createCollapsedTextSelection = (documentId: DocumentId, nodeId: DocumentNodeId,
  offset: number, affinity: DocumentSelectionAffinity = 'forward'): DocumentTextSelection => ({
  type: 'text', documentId,
  anchor: { nodeId, offset, affinity },
  focus: { nodeId, offset, affinity },
})
