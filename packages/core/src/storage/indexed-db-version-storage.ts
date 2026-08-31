import type { DocumentVersion, VersionStorage } from '../version-history.js'

const DB_NAME = 'incantly-versions'
const DB_VERSION = 1
const STORE = 'versions'

function isValidDocumentVersion(v: unknown): v is DocumentVersion {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (
    typeof o.id === 'string' &&
    typeof o.notebookId === 'string' &&
    typeof o.createdAt === 'number' &&
    typeof o.kind === 'string' &&
    o.snapshot != null &&
    o.schema != null
  )
}

function isQuotaExceeded(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { name?: string; code?: number }
  return e.name === 'QuotaExceededError' || e.code === 22
}

function quotaExceededMessage(): string {
  return 'Document version storage is full. Delete old versions or free browser storage to save more.'
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this environment'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'id' })
        os.createIndex('notebookId', 'notebookId', { unique: false })
        os.createIndex('notebookCreatedAt', ['notebookId', 'createdAt'], { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Failed to open version database'))
  })
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

export class IndexedDbVersionStorage implements VersionStorage {
  private dbPromise: Promise<IDBDatabase>

  constructor() {
    this.dbPromise = openDb()
  }

  private async db(): Promise<IDBDatabase> {
    return this.dbPromise
  }

  async list(notebookId: string, opts?: { limit?: number }): Promise<DocumentVersion[]> {
    const db = await this.db()
    const tx = db.transaction(STORE, 'readonly')
    const index = tx.objectStore(STORE).index('notebookCreatedAt')
    const range = IDBKeyRange.bound([notebookId, 0], [notebookId, Number.MAX_SAFE_INTEGER])
    const req = index.openCursor(range, 'prev')
    const result: DocumentVersion[] = []
    const limit = opts?.limit

    await new Promise<void>((resolve, reject) => {
      req.onsuccess = () => {
        const cursor = req.result
        if (!cursor) {
          resolve()
          return
        }
        const v = cursor.value
        if (isValidDocumentVersion(v)) {
          result.push(v)
          if (limit != null && result.length >= limit) {
            resolve()
            return
          }
        }
        cursor.continue()
      }
      req.onerror = () => reject(req.error ?? new Error('IndexedDB cursor failed'))
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
    })

    return result
  }

  async get(notebookId: string, versionId: string): Promise<DocumentVersion | null> {
    const db = await this.db()
    const tx = db.transaction(STORE, 'readonly')
    const v = await idbRequest(tx.objectStore(STORE).get(versionId))
    if (!isValidDocumentVersion(v) || v.notebookId !== notebookId) return null
    return v
  }

  async put(version: DocumentVersion): Promise<void> {
    const db = await this.db()
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    try {
      await idbRequest(store.put(version))
    } catch (err) {
      if (isQuotaExceeded(err)) throw new Error(quotaExceededMessage())
      throw err
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => {
        const err = tx.error
        if (isQuotaExceeded(err)) reject(new Error(quotaExceededMessage()))
        else reject(err ?? new Error('IndexedDB write failed'))
      }
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
    })
  }

  async delete(notebookId: string, versionId: string): Promise<void> {
    const existing = await this.get(notebookId, versionId)
    if (!existing) return
    const db = await this.db()
    const tx = db.transaction(STORE, 'readwrite')
    await idbRequest(tx.objectStore(STORE).delete(versionId))
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'))
    })
  }

  async prune(notebookId: string, keep: number): Promise<void> {
    const versions = await this.list(notebookId)
    const toDrop = versions.slice(keep)
    for (const v of toDrop) {
      await this.delete(notebookId, v.id)
    }
  }
}
