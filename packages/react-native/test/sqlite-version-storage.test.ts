import { describe, expect, it } from 'vitest'
import { Store, createVersionManager } from '@incantly/canvas/headless'
import type { DocumentVersion } from '@incantly/canvas/headless'
import type { SqliteDriver } from '../src/storage/sqlite-driver.js'
import { createSqliteVersionStorage } from '../src/storage/sqlite-version-storage.js'

interface Row {
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

function createMemorySqliteDriver(opts?: { failPut?: boolean }): SqliteDriver {
  const rows: Row[] = []
  return {
    async exec() {},
    async run(sql, params = []) {
      if (opts?.failPut && /INSERT/i.test(sql)) {
        throw new Error('database or disk is full')
      }
      if (/INSERT OR REPLACE/i.test(sql)) {
        const [
          id,
          notebook_id,
          created_at,
          kind,
          label,
          fingerprint,
          byte_size,
          schema_json,
          snapshot,
        ] = params as [
          string,
          string,
          number,
          string,
          string | null,
          string,
          number,
          string,
          string,
        ]
        const next: Row = {
          id,
          notebook_id,
          created_at,
          kind,
          label,
          fingerprint,
          byte_size,
          schema_json,
          snapshot,
        }
        const i = rows.findIndex((r) => r.id === id)
        if (i >= 0) rows[i] = next
        else rows.push(next)
        return
      }
      if (/DELETE FROM versions WHERE notebook_id = \? AND id = \?/i.test(sql)) {
        const [notebookId, id] = params as [string, string]
        const i = rows.findIndex((r) => r.notebook_id === notebookId && r.id === id)
        if (i >= 0) rows.splice(i, 1)
      }
    },
    async all(sql, params = []) {
      const notebookId = params[0] as string
      let list = rows
        .filter((r) => r.notebook_id === notebookId)
        .sort((a, b) => b.created_at - a.created_at || b.id.localeCompare(a.id))
      if (/LIMIT \?/i.test(sql) && params[1] != null) {
        list = list.slice(0, Number(params[1]))
      }
      return list as never
    },
    async get(sql, params = []) {
      if (/AND id = \?/i.test(sql)) {
        const [notebookId, id] = params as [string, string]
        return (rows.find((r) => r.notebook_id === notebookId && r.id === id) ?? null) as never
      }
      return null
    },
    async transaction(fn) {
      return fn()
    },
  }
}

function sampleVersion(over: Partial<DocumentVersion> = {}): DocumentVersion {
  const store = new Store()
  const snapshot = store.getSnapshot()
  return {
    id: over.id ?? 'version:a',
    notebookId: over.notebookId ?? 'notebook:main',
    createdAt: over.createdAt ?? 1,
    kind: over.kind ?? 'manual',
    label: over.label,
    schema: snapshot.schema ?? {
      schemaVersion: 1,
      sequences: {},
    },
    snapshot: over.snapshot ?? snapshot,
  }
}

describe('createSqliteVersionStorage', () => {
  it('puts, lists summaries scoped to notebook, and gets one version', async () => {
    const storage = createSqliteVersionStorage(createMemorySqliteDriver())
    const a = sampleVersion({ id: 'version:a', createdAt: 2, label: 'A' })
    const other = sampleVersion({
      id: 'version:b',
      notebookId: 'notebook:other',
      createdAt: 3,
      label: 'Other',
    })
    await storage.put(a)
    await storage.put(other)

    const list = await storage.list('notebook:main')
    expect(list.map((v) => v.id)).toEqual(['version:a'])
    expect(list[0]?.label).toBe('A')

    const got = await storage.get('notebook:main', 'version:a')
    expect(got?.id).toBe('version:a')
    expect(got?.snapshot.document.store).toBeDefined()

    expect(await storage.get('notebook:other', 'version:a')).toBeNull()
  })

  it('rejects path-like ids and skips corrupt rows', async () => {
    const storage = createSqliteVersionStorage(createMemorySqliteDriver())
    await expect(
      storage.put(sampleVersion({ id: '../etc/passwd' })),
    ).rejects.toThrow(/Invalid version/)

    expect(await storage.get('notebook:main', 'version:missing')).toBeNull()
    expect(await storage.list('../hack')).toEqual([])
  })

  it('prunes oldest beyond keep count', async () => {
    const storage = createSqliteVersionStorage(createMemorySqliteDriver())
    await storage.put(sampleVersion({ id: 'version:old', createdAt: 1 }))
    await storage.put(sampleVersion({ id: 'version:new', createdAt: 2 }))
    await storage.prune('notebook:main', 1)
    const list = await storage.list('notebook:main')
    expect(list.map((v) => v.id)).toEqual(['version:new'])
  })

  it('surfaces quota errors via onQuotaError', async () => {
    let quota = ''
    const storage = createSqliteVersionStorage(createMemorySqliteDriver({ failPut: true }), {
      onQuotaError: (m) => {
        quota = m
      },
    })
    await expect(storage.put(sampleVersion())).rejects.toThrow(/disk is full/)
    expect(quota).toMatch(/full/)
  })

  it('works with VersionManager checkpoint and revert', async () => {
    const store = new Store()
    store.normalizePages('remote')
    const storage = createSqliteVersionStorage(createMemorySqliteDriver())
    const vm = createVersionManager({
      storage,
      store,
      notebookId: 'notebook:main',
      autosaveMs: 60_000,
    })
    store.setNotebookDocument([{ type: 'paragraph', content: [{ text: 'before' }] }], 'user')
    const saved = await vm.checkpoint('manual', 'Before')
    store.setNotebookDocument([{ type: 'paragraph', content: [{ text: 'after' }] }], 'user')
    await vm.revert(saved.id)
    const blocks = store.notebookDocumentBlocks()
    const text = blocks[0] && 'content' in blocks[0] ? blocks[0].content[0]?.text : ''
    expect(text).toBe('before')
    vm.dispose()
  })
})
