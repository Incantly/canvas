import type { Snapshot } from '@incantly/canvas/headless'
import {
  createSerialQueue,
  migrateSnapshot,
  safeParseSnapshot,
  snapshotFingerprint,
} from '@incantly/canvas/headless'

export interface NotebookPersistence {
  load(notebookId: string): Promise<Snapshot | null>
  save(notebookId: string, snap: Snapshot): Promise<void>
  delete(notebookId: string): Promise<void>
}

export interface NotebookPersistenceOptions {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}

export function createNotebookPersistence(opts: NotebookPersistenceOptions): NotebookPersistence {
  const queue = createSerialQueue()
  let lastSavedFingerprint = ''

  const key = (notebookId: string) => `ic:snapshot:${notebookId}`

  return {
    async load(notebookId) {
      const raw = await opts.getItem(key(notebookId))
      if (!raw) return null
      const parsed = safeParseSnapshot(raw)
      if (!parsed.ok) return null
      lastSavedFingerprint = snapshotFingerprint(parsed.snap)
      return parsed.snap
    },

    save(notebookId, snap) {
      return queue.enqueue(async () => {
        const migrated = migrateSnapshot(snap)
        const fp = snapshotFingerprint(migrated)
        if (fp === lastSavedFingerprint) return
        await opts.setItem(key(notebookId), JSON.stringify(migrated))
        lastSavedFingerprint = fp
      })
    },

    delete(notebookId) {
      return queue.enqueue(async () => {
        await opts.removeItem(key(notebookId))
        lastSavedFingerprint = ''
      })
    },
  }
}
