/**
 * Adversarial tests mirroring webview-entry.ts dispatch guards for version handlers.
 * Keeps handler logic in sync with packages/react-native/src/webview-entry.ts.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { Store } from '../../core/src/store.js'
import { NOTEBOOK_ID } from '../../core/src/pages.js'
import {
  createVersionManager,
  type VersionManager,
  type DocumentVersion,
} from '../../core/src/version-history.js'
import { MemoryVersionStorage } from '../../core/src/storage/memory-version-storage.js'

const versionSummary = (v: DocumentVersion) => ({
  id: v.id,
  createdAt: v.createdAt,
  label: v.label,
  kind: v.kind,
})

describe('webview version dispatch (malformed)', () => {
  let posts: object[]
  let versionManager: VersionManager | null
  let boardReady: boolean

  const post = (msg: object): void => {
    posts.push(msg)
  }

  const dispatch = async (m: any): Promise<void> => {
    const handlers: Record<string, (msg: any) => Promise<void>> = {
      async listVersions(msg: any) {
        const versions = await versionManager!.list()
        post({
          type: 'versions',
          id: msg.id,
          versions: versions.map(versionSummary),
        })
      },
      async revertVersion(msg: any) {
        await versionManager!.revert(msg.versionId)
        post({ type: 'reverted', id: msg.id, versionId: msg.versionId })
      },
      async saveVersion(msg: any) {
        const saved = await versionManager!.checkpoint('manual', msg.label)
        post({
          type: 'versionSaved',
          id: msg.id,
          versionId: saved.id,
          createdAt: saved.createdAt,
          label: saved.label,
          kind: saved.kind,
        })
      },
    }

    try {
      if (!m || !handlers[m.type]) return
      if (!boardReady) return
      await handlers[m.type](m)
    } catch (e: any) {
      post({ type: 'error', message: String((e && e.message) || e) })
    }
  }

  beforeEach(() => {
    posts = []
    boardReady = true
    const store = new Store()
    versionManager = createVersionManager({
      storage: new MemoryVersionStorage(),
      store,
      notebookId: NOTEBOOK_ID,
    })
  })

  it('ignores null and unknown messages', async () => {
    await dispatch(null)
    await dispatch(undefined)
    await dispatch({ type: 'notARealHandler' })
    expect(posts).toEqual([])
  })

  it('ignores version commands before board init', async () => {
    boardReady = false
    await dispatch({ type: 'listVersions', id: 'r1' })
    await dispatch({ type: 'revertVersion', id: 'r2', versionId: 'version:x' })
    await dispatch({ type: 'saveVersion', id: 'r3' })
    expect(posts).toEqual([])
  })

  it('revertVersion without versionId posts error', async () => {
    await dispatch({ type: 'revertVersion', id: 'r1' })
    expect(posts).toEqual([{ type: 'error', message: 'Version not found: undefined' }])
  })

  it('revertVersion with missing version posts error', async () => {
    await dispatch({ type: 'revertVersion', id: 'r1', versionId: 'version:missing' })
    expect(posts).toEqual([{ type: 'error', message: 'Version not found: version:missing' }])
  })

  it('listVersions returns summaries without full snapshot payload', async () => {
    await versionManager!.checkpoint('manual', 'secret content')
    await dispatch({ type: 'listVersions', id: 'r1' })
    const msg = posts[0] as { type: string; versions: Record<string, unknown>[] }
    expect(msg.type).toBe('versions')
    expect(msg.versions[0]).not.toHaveProperty('snapshot')
    expect(msg.versions[0]).not.toHaveProperty('schema')
  })

  it('saveVersion tolerates non-string label without crashing', async () => {
    await dispatch({ type: 'saveVersion', id: 'r1', label: 123 })
    expect(posts[0]).toMatchObject({ type: 'versionSaved', id: 'r1' })
  })
})
