import type { DocumentVersion, VersionStorage } from '@incantly/canvas/headless'
import { createMutex, snapshotFingerprint } from '@incantly/canvas/headless'
import type { SqliteDriver } from './sqlite-driver.js'

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS versions (
  id TEXT PRIMARY KEY,
  notebook_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  kind TEXT NOT NULL,
  label TEXT,
  fingerprint TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  schema_json TEXT NOT NULL,
  snapshot TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS versions_notebook_created
  ON versions (notebook_id, created_at DESC);
`

const ID_MAX = 256

export interface SqliteVersionStorageOptions {
  onQuotaError?: (message: string) => void
}

interface VersionRow {
  id: string
  notebook_id: string
  created_at: number
  kind: string
  label: string | null
  fingerprint: string
  byte_size: number
  schema_json: string
  snapshot: string
}

function isSafeId(id: unknown): id is string {
  return (
    typeof id === 'string' &&
    id.length > 0 &&
    id.length <= ID_MAX &&
    !id.includes('..') &&
    !/[\\/\0]/.test(id)
  )
}

function isQuotaExceeded(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /SQLITE_FULL|disk is full|database or disk is full|QuotaExceeded/i.test(msg)
}

function quotaMessage(): string {
  return 'Version storage is full. Delete old versions or free device storage to save more.'
}

function parseRow(row: VersionRow): DocumentVersion | null {
  if (!isSafeId(row.id) || !isSafeId(row.notebook_id)) return null
  if (typeof row.created_at !== 'number' || typeof row.kind !== 'string') return null
  let schema: DocumentVersion['schema']
  let snapshot: DocumentVersion['snapshot']
  try {
    schema = JSON.parse(row.schema_json) as DocumentVersion['schema']
    snapshot = JSON.parse(row.snapshot) as DocumentVersion['snapshot']
  } catch {
    return null
  }
  if (!schema || !snapshot || typeof snapshot !== 'object') return null
  const version: DocumentVersion = {
    id: row.id,
    notebookId: row.notebook_id,
    createdAt: row.created_at,
    kind: row.kind as DocumentVersion['kind'],
    schema,
    snapshot,
  }
  if (row.label) version.label = row.label
  return version
}

/** Persistent `VersionStorage` for React Native — host injects SQLite. */
export function createSqliteVersionStorage(
  driver: SqliteDriver,
  opts: SqliteVersionStorageOptions = {},
): VersionStorage & { ready(): Promise<void> } {
  const mutex = createMutex()
  let schemaReady: Promise<void> | null = null

  const ensureSchema = (): Promise<void> => {
    if (!schemaReady) {
      schemaReady = driver.exec(SCHEMA_SQL).catch((err) => {
        schemaReady = null
        throw err
      })
    }
    return schemaReady
  }

  const withWrite = <T>(fn: () => Promise<T>): Promise<T> =>
    mutex.run(async () => {
      await ensureSchema()
      try {
        return await driver.transaction(fn)
      } catch (err) {
        if (isQuotaExceeded(err)) {
          opts.onQuotaError?.(quotaMessage())
        }
        throw err
      }
    })

  return {
    ready: () => ensureSchema(),

    async list(notebookId, listOpts) {
      if (!isSafeId(notebookId)) return []
      await ensureSchema()
      const limit = listOpts?.limit
      const sql =
        limit != null
          ? `SELECT id, notebook_id, created_at, kind, label, fingerprint, byte_size, schema_json, snapshot
             FROM versions WHERE notebook_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`
          : `SELECT id, notebook_id, created_at, kind, label, fingerprint, byte_size, schema_json, snapshot
             FROM versions WHERE notebook_id = ? ORDER BY created_at DESC, id DESC`
      const params = limit != null ? [notebookId, limit] : [notebookId]
      const rows = await driver.all<VersionRow>(sql, params)
      const out: DocumentVersion[] = []
      for (const row of rows) {
        const parsed = parseRow(row)
        if (parsed && parsed.notebookId === notebookId) out.push(parsed)
      }
      return out
    },

    async get(notebookId, versionId) {
      if (!isSafeId(notebookId) || !isSafeId(versionId)) return null
      await ensureSchema()
      const row = await driver.get<VersionRow>(
        `SELECT id, notebook_id, created_at, kind, label, fingerprint, byte_size, schema_json, snapshot
         FROM versions WHERE notebook_id = ? AND id = ? LIMIT 1`,
        [notebookId, versionId],
      )
      if (!row) return null
      const parsed = parseRow(row)
      if (!parsed || parsed.notebookId !== notebookId) return null
      return parsed
    },

    async put(version) {
      if (!isSafeId(version.id) || !isSafeId(version.notebookId)) {
        throw new Error('Invalid version or notebook id')
      }
      await withWrite(async () => {
        const snapshotJson = JSON.stringify(version.snapshot)
        const schemaJson = JSON.stringify(version.schema)
        const fingerprint = snapshotFingerprint(version.snapshot)
        await driver.run(
          `INSERT OR REPLACE INTO versions
            (id, notebook_id, created_at, kind, label, fingerprint, byte_size, schema_json, snapshot)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            version.id,
            version.notebookId,
            version.createdAt,
            version.kind,
            version.label ?? null,
            fingerprint,
            snapshotJson.length,
            schemaJson,
            snapshotJson,
          ],
        )
      })
    },

    async delete(notebookId, versionId) {
      if (!isSafeId(notebookId) || !isSafeId(versionId)) return
      await withWrite(async () => {
        await driver.run(`DELETE FROM versions WHERE notebook_id = ? AND id = ?`, [
          notebookId,
          versionId,
        ])
      })
    },

    async prune(notebookId, keep) {
      if (!isSafeId(notebookId)) return
      const cap = Number.isFinite(keep) ? Math.max(0, Math.floor(keep)) : 0
      await withWrite(async () => {
        const rows = await driver.all<VersionRow>(
          `SELECT id FROM versions WHERE notebook_id = ? ORDER BY created_at DESC, id DESC`,
          [notebookId],
        )
        const drop = rows.slice(cap)
        for (const row of drop) {
          if (!isSafeId(row.id)) continue
          await driver.run(`DELETE FROM versions WHERE notebook_id = ? AND id = ?`, [
            notebookId,
            row.id,
          ])
        }
      })
    },
  }
}
