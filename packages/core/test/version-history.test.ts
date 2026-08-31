import { describe, it, expect, vi } from 'vitest'
import { Store } from '../src/store.js'
import { NOTEBOOK_ID } from '../src/pages.js'
import { createVersionManager } from '../src/version-history.js'
import { MemoryVersionStorage } from '../src/storage/memory-version-storage.js'
import { CURRENT_SCHEMA } from '../src/types/schema.js'

const shape = (id: string, x = 0): any => ({
  id,
  typeName: 'shape',
  type: 'geo',
  x,
  y: 0,
  rot: 0,
  z: 1,
  props: {
    geo: 'rectangle',
    w: 10,
    h: 10,
    color: 'black',
    size: 'm',
    dash: 'draw',
    fill: 'none',
    font: 'draw',
  },
})

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('VersionManager', () => {
  it('checkpoint creates retrievable version', async () => {
    const storage = new MemoryVersionStorage()
    const store = new Store()
    store.put(shape('a'))
    const manager = createVersionManager({
      storage,
      store,
      notebookId: NOTEBOOK_ID,
    })

    const version = await manager.checkpoint('manual', 'baseline')
    expect(version.id).toMatch(/^version:/)
    expect(version.notebookId).toBe(NOTEBOOK_ID)
    expect(version.kind).toBe('manual')
    expect(version.label).toBe('baseline')
    expect(version.schema).toEqual(CURRENT_SCHEMA)
    expect(version.snapshot.document.store.a).toBeTruthy()

    const fetched = await storage.get(NOTEBOOK_ID, version.id)
    expect(fetched?.id).toBe(version.id)
  })

  it('list returns versions sorted newest first', async () => {
    const storage = new MemoryVersionStorage()
    const store = new Store()
    const manager = createVersionManager({
      storage,
      store,
      notebookId: NOTEBOOK_ID,
    })

    const first = await manager.checkpoint('manual', 'first')
    await wait(2)
    const second = await manager.checkpoint('manual', 'second')

    const list = await manager.list()
    expect(list.length).toBe(2)
    expect(list[0].id).toBe(second.id)
    expect(list[1].id).toBe(first.id)
    expect(list[0].createdAt).toBeGreaterThanOrEqual(list[1].createdAt)
  })

  it('revert restores content and clears undo stack', async () => {
    const storage = new MemoryVersionStorage()
    const store = new Store()
    store.put(shape('a', 0))
    const manager = createVersionManager({
      storage,
      store,
      notebookId: NOTEBOOK_ID,
      preRevertCheckpoint: false,
    })

    const baseline = await manager.checkpoint('manual')
    store.put(shape('b', 50))
    store.put(shape('c', 100))
    expect(store.undos.length).toBeGreaterThan(0)

    await manager.revert(baseline.id)

    expect(store.has('b')).toBe(false)
    expect(store.has('c')).toBe(false)
    expect(store.has('a')).toBe(true)
    expect(store.get('a')?.x).toBe(0)
    expect(store.undos.length).toBe(0)
    expect(store.redos.length).toBe(0)
  })

  it('creates pre-revert checkpoint when enabled', async () => {
    const storage = new MemoryVersionStorage()
    const store = new Store()
    store.put(shape('a'))
    const manager = createVersionManager({
      storage,
      store,
      notebookId: NOTEBOOK_ID,
      preRevertCheckpoint: true,
    })

    const baseline = await manager.checkpoint('manual')
    store.put(shape('b', 25))

    await manager.revert(baseline.id)

    const list = await manager.list()
    const revertCheckpoint = list.find((v) => v.kind === 'revert')
    expect(revertCheckpoint).toBeTruthy()
    expect(revertCheckpoint!.snapshot.document.store.b).toBeTruthy()
  })

  it('maxVersions prune drops oldest', async () => {
    const storage = new MemoryVersionStorage()
    const store = new Store()
    const manager = createVersionManager({
      storage,
      store,
      notebookId: NOTEBOOK_ID,
      maxVersions: 3,
    })

    const ids: string[] = []
    for (let i = 0; i < 5; i++) {
      store.put(shape(`s${i}`, i))
      const v = await manager.checkpoint('manual', `v${i}`)
      ids.push(v.id)
    }

    const list = await manager.list()
    expect(list.length).toBe(3)
    expect(list.map((v) => v.id)).toEqual([ids[4], ids[3], ids[2]])
  })

  it('dirty check skips duplicate autosave', async () => {
    const storage = new MemoryVersionStorage()
    const store = new Store()
    const manager = createVersionManager({
      storage,
      store,
      notebookId: NOTEBOOK_ID,
      autosaveMs: 25,
    })

    store.put(shape('a'))
    await wait(60)
    const afterFirst = await manager.list()
    expect(afterFirst.filter((v) => v.kind === 'autosave').length).toBe(1)

    store.put(shape('b'))
    store.remove(['b'])
    await wait(60)

    const afterSecond = await manager.list()
    expect(afterSecond.filter((v) => v.kind === 'autosave').length).toBe(1)
  })

  it('revert to missing versionId throws', async () => {
    const storage = new MemoryVersionStorage()
    const store = new Store()
    const manager = createVersionManager({
      storage,
      store,
      notebookId: NOTEBOOK_ID,
    })

    await expect(manager.revert('version:does-not-exist')).rejects.toThrow(
      'Version not found: version:does-not-exist',
    )
  })

  it('dispose clears listeners', async () => {
    const storage = new MemoryVersionStorage()
    const store = new Store()
    const manager = createVersionManager({
      storage,
      store,
      notebookId: NOTEBOOK_ID,
      autosaveMs: 25,
    })

    manager.dispose()
    store.put(shape('a'))
    await wait(60)

    expect((await storage.list(NOTEBOOK_ID)).length).toBe(0)
  })
})

describe('MemoryVersionStorage', () => {
  it('skips corrupt entries on list', async () => {
    const storage = new MemoryVersionStorage()
    storage.injectCorrupt('bad', { id: 'bad', notebookId: NOTEBOOK_ID, broken: true })

    const version = await createVersionManager({
      storage,
      store: new Store(),
      notebookId: NOTEBOOK_ID,
    }).checkpoint('manual')

    const list = await storage.list(NOTEBOOK_ID)
    expect(list.length).toBe(1)
    expect(list[0].id).toBe(version.id)
  })

  it('prune keeps newest N by createdAt', async () => {
    const storage = new MemoryVersionStorage()
    const store = new Store()
    const manager = createVersionManager({
      storage,
      store,
      notebookId: NOTEBOOK_ID,
    })

    const versions = []
    for (let i = 0; i < 4; i++) {
      versions.push(await manager.checkpoint('manual', `v${i}`))
      await wait(2)
    }

    await storage.prune(NOTEBOOK_ID, 2)
    const list = await storage.list(NOTEBOOK_ID)
    expect(list.length).toBe(2)
    expect(list[0].id).toBe(versions[3].id)
    expect(list[1].id).toBe(versions[2].id)
  })
})
