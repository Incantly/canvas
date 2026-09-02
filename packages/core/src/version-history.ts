import type { Snapshot, Diff, DiffSource } from './types/operations.js'
import type { SerializedSchema } from './types/schema.js'
import { CURRENT_SCHEMA } from './types/schema.js'
import { NOTEBOOK_ID } from './pages.js'
import { newId } from './utils/id.js'
import { snapshotFingerprint } from './utils/snapshot/fingerprint.js'

export type VersionKind = 'autosave' | 'manual' | 'revert' | 'import'

/** Minimal store surface required by VersionManager (avoids private-field type mismatch across packages). */
export interface VersionManagerStore {
  getSnapshot(): Snapshot
  loadSnapshot(snap: Snapshot, source?: DiffSource): void
  listen(
    fn: (diff: Diff, source: DiffSource) => void,
    opts?: { source?: DiffSource | 'all' },
  ): () => void
}

export interface DocumentVersion {
  id: string
  notebookId: string
  createdAt: number
  label?: string
  kind: VersionKind
  schema: SerializedSchema
  snapshot: Snapshot
}

export interface VersionStorage {
  list(notebookId: string, opts?: { limit?: number }): Promise<DocumentVersion[]>
  get(notebookId: string, versionId: string): Promise<DocumentVersion | null>
  put(version: DocumentVersion): Promise<void>
  delete(notebookId: string, versionId: string): Promise<void>
  prune(notebookId: string, keep: number): Promise<void>
}

export interface VersionManagerOptions {
  storage: VersionStorage
  store: VersionManagerStore
  notebookId?: string
  autosaveMs?: number
  maxVersions?: number
  maxStorageMb?: number
  preRevertCheckpoint?: boolean
  onVersionsChange?: () => void
}

export interface VersionManager {
  checkpoint(kind?: VersionKind, label?: string): Promise<DocumentVersion>
  list(): Promise<DocumentVersion[]>
  revert(versionId: string): Promise<void>
  dispose(): void
}

const DEFAULT_AUTOSAVE_MS = 45_000
const DEFAULT_MAX_VERSIONS = 15
const DEFAULT_MAX_STORAGE_MB = 50

function estimateVersionBytes(version: DocumentVersion): number {
  try {
    return JSON.stringify(version).length
  } catch {
    return 0
  }
}

export function createVersionManager(opts: VersionManagerOptions): VersionManager {
  const storage = opts.storage
  const store = opts.store
  const notebookId = opts.notebookId ?? NOTEBOOK_ID
  const autosaveMs = opts.autosaveMs ?? DEFAULT_AUTOSAVE_MS
  const maxVersions = opts.maxVersions ?? DEFAULT_MAX_VERSIONS
  const maxStorageMb = opts.maxStorageMb ?? DEFAULT_MAX_STORAGE_MB
  const preRevertCheckpoint = opts.preRevertCheckpoint !== false
  const onVersionsChange = opts.onVersionsChange

  let lastFingerprint = ''
  let autosaveTimer: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  const unlisten = store.listen(() => {
    if (disposed) return
    if (autosaveTimer) clearTimeout(autosaveTimer)
    autosaveTimer = setTimeout(() => {
      autosaveTimer = null
      void checkpointInternal('autosave').catch((err) => {
        console.warn('version autosave failed', err)
      })
    }, autosaveMs)
  }, { source: 'user' })

  async function notify(): Promise<void> {
    onVersionsChange?.()
  }

  async function pruneStorage(): Promise<void> {
    await storage.prune(notebookId, maxVersions)
    const maxBytes = maxStorageMb * 1024 * 1024
    let versions = await storage.list(notebookId)
    let total = versions.reduce((sum, v) => sum + estimateVersionBytes(v), 0)
    while (total > maxBytes && versions.length > 1) {
      const autosaves = [...versions].reverse().filter((v) => v.kind === 'autosave')
      const drop = autosaves[0] ?? versions[versions.length - 1]
      await storage.delete(notebookId, drop.id)
      versions = await storage.list(notebookId)
      total = versions.reduce((sum, v) => sum + estimateVersionBytes(v), 0)
    }
  }

  async function checkpointInternal(
    kind: VersionKind,
    label?: string,
    force = false,
  ): Promise<DocumentVersion | null> {
    const snapshot = store.getSnapshot()
    const fingerprint = snapshotFingerprint(snapshot)
    if (!force && kind === 'autosave' && fingerprint === lastFingerprint) {
      return null
    }

    const version: DocumentVersion = {
      id: newId('version'),
      notebookId,
      createdAt: Date.now(),
      label,
      kind,
      schema: snapshot.schema ?? CURRENT_SCHEMA,
      snapshot,
    }

    await storage.put(version)
    lastFingerprint = fingerprint
    await pruneStorage()
    await notify()
    return version
  }

  return {
    async checkpoint(kind: VersionKind = 'manual', label?: string): Promise<DocumentVersion> {
      const version = await checkpointInternal(kind, label, true)
      if (!version) {
        throw new Error('Failed to create version checkpoint')
      }
      return version
    },

    list(): Promise<DocumentVersion[]> {
      return storage.list(notebookId)
    },

    async revert(versionId: string): Promise<void> {
      const version = await storage.get(notebookId, versionId)
      if (!version) {
        throw new Error(`Version not found: ${versionId}`)
      }
      if (preRevertCheckpoint) {
        await checkpointInternal('revert', 'Before revert', true)
      }
      store.loadSnapshot(version.snapshot, 'remote')
      lastFingerprint = snapshotFingerprint(version.snapshot)
      await notify()
    },

    dispose(): void {
      disposed = true
      if (autosaveTimer) {
        clearTimeout(autosaveTimer)
        autosaveTimer = null
      }
      unlisten()
    },
  }
}
