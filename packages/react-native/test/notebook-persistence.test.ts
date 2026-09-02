import { describe, expect, it, vi } from 'vitest'
import { createNotebookPersistence } from '../src/storage/notebook-persistence.js'
import { Store } from '@incantly/canvas/headless'

describe('createNotebookPersistence', () => {
  it('saves and loads snapshot', async () => {
    const mem = new Map<string, string>()
    const persistence = createNotebookPersistence({
      getItem: async (k) => mem.get(k) ?? null,
      setItem: async (k, v) => {
        mem.set(k, v)
      },
      removeItem: async (k) => {
        mem.delete(k)
      },
    })
    const store = new Store()
    const snap = store.getSnapshot()
    await persistence.save('nb-1', snap)
    const loaded = await persistence.load('nb-1')
    expect(loaded?.document.store).toBeDefined()
  })

  it('skips duplicate saves with same fingerprint', async () => {
    const mem = new Map<string, string>()
    let writes = 0
    const persistence = createNotebookPersistence({
      getItem: async (k) => mem.get(k) ?? null,
      setItem: async (k, v) => {
        writes++
        mem.set(k, v)
      },
      removeItem: async (k) => {
        mem.delete(k)
      },
    })
    const store = new Store()
    const snap = store.getSnapshot()
    await persistence.save('nb-1', snap)
    await persistence.save('nb-1', snap)
    expect(writes).toBe(1)
  })
})
