import type { AssetId, DocumentNodeId } from './ids.js'
import type { DocumentNode, PageSetup, TextMark } from './types.js'

export interface InsertDocumentNodeOperation {
  type: 'insertNode'
  /** Omit to insert into the document body. */
  parentId?: DocumentNodeId
  index: number
  node: DocumentNode
}

export interface UpdateDocumentNodeOperation {
  type: 'updateNode'
  nodeId: DocumentNodeId
  /** Complete replacement. Its ID must match nodeId. */
  node: DocumentNode
}

export interface MoveDocumentNodeOperation {
  type: 'moveNode'
  nodeId: DocumentNodeId
  /** Omit to move into the document body. Index is evaluated after removal. */
  parentId?: DocumentNodeId
  index: number
}

export interface DeleteDocumentNodeOperation {
  type: 'deleteNode'
  nodeId: DocumentNodeId
}

export interface ReplaceDocumentTextOperation {
  type: 'replaceText'
  nodeId: DocumentNodeId
  /** UTF-16 offsets, matching JavaScript and ProseMirror string positions. */
  from: number
  to: number
  text: string
  /** Applied to inserted inline text. Code blocks do not accept marks. */
  marks?: TextMark[]
}

export interface SetDocumentAssetReferenceOperation {
  type: 'setAssetReference'
  nodeId: DocumentNodeId
  assetId: AssetId
  /** Primary applies to image/file/audio/PDF nodes; preview applies to canvas embeds. */
  slot: 'primary' | 'preview'
}

export interface ClearDocumentAssetReferenceOperation {
  type: 'clearAssetReference'
  nodeId: DocumentNodeId
  /** Only optional preview references can be cleared. */
  slot: 'preview'
}

export interface SetDocumentPageSetupOperation {
  type: 'setPageSetup'
  pageSetup: PageSetup
}

export type DocumentOperation =
  | InsertDocumentNodeOperation
  | UpdateDocumentNodeOperation
  | MoveDocumentNodeOperation
  | DeleteDocumentNodeOperation
  | ReplaceDocumentTextOperation
  | SetDocumentAssetReferenceOperation
  | ClearDocumentAssetReferenceOperation
  | SetDocumentPageSetupOperation
