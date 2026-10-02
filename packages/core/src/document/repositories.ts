import type { AssetBinary, AssetMetadata, AssetRecord } from './assets.js'
import type { AssetId, DocumentId } from './ids.js'
import type { IncantlyDocument } from './types.js'

export interface DocumentCheckpoint {
  document: IncantlyDocument
  revision: string
  savedAt: string
  /** Optional compacted collaboration state; canonical JSON remains required. */
  collaborationState?: Uint8Array
}

export interface AppendDocumentUpdatesOptions {
  expectedRevision?: string
  origin?: 'user' | 'remote' | 'ai' | 'import' | 'migration' | 'system'
}

export interface AppendDocumentUpdatesResult {
  revision: string
  appended: number
}

export interface DocumentRepository {
  loadDocument(id: DocumentId): Promise<DocumentCheckpoint | null>
  saveCheckpoint(checkpoint: DocumentCheckpoint): Promise<void>
  appendUpdates(
    id: DocumentId,
    updates: readonly Uint8Array[],
    options?: AppendDocumentUpdatesOptions,
  ): Promise<AppendDocumentUpdatesResult>
}

export interface AssetRepository {
  put(data: AssetBinary, metadata: AssetMetadata): Promise<AssetRecord>
  get(id: AssetId): Promise<AssetBinary | null>
  getRecord(id: AssetId): Promise<AssetRecord | null>
  findByHash(hash: AssetRecord['hash']): Promise<AssetRecord | null>
  remove(id: AssetId): Promise<void>
}
