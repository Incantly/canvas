import { useEffect, useCallback, useRef, useState } from 'react'
import {
  Store,
  createVersionManager,
  MemoryVersionStorage,
  type Diff,
  type DiffSource,
  type Snapshot,
  type VersionManager,
  type VersionStorage,
} from '@incantly/canvas/headless'

export interface UseCanvasStoreOptions {
  onChange?: (diff: Diff, source: DiffSource) => void
  notebookId?: string
  /** Persistent RN storage. Defaults to in-memory (session-only). */
  versionStorage?: VersionStorage
}

export function useCanvasStore(opts: UseCanvasStoreOptions = {}) {
  const storeRef = useRef<Store | null>(null)
  const versionRef = useRef<VersionManager | null>(null)
  const [, bump] = useState(0)

  if (!storeRef.current) {
    storeRef.current = new Store()
    storeRef.current.normalizePages('remote')
    versionRef.current = createVersionManager({
      storage: opts.versionStorage ?? new MemoryVersionStorage(),
      store: storeRef.current,
      notebookId: opts.notebookId,
    })
  }

  const store = storeRef.current
  const versionManager = versionRef.current!

  const notify = useCallback(() => bump((n) => n + 1), [])

  useEffect(() => {
    const unsub = store.listen((diff, source) => {
      opts.onChange?.(diff, source)
      notify()
    })
    return () => {
      unsub()
    }
  }, [store, opts.onChange, notify])

  useEffect(() => {
    return () => {
      versionManager.dispose()
    }
  }, [versionManager])

  const loadSnapshot = useCallback(
    (snap: Snapshot, source: DiffSource = 'remote') => {
      store.loadSnapshot(snap, source)
      notify()
    },
    [store, notify],
  )

  const getSnapshot = useCallback(() => store.getSnapshot(), [store])

  return {
    store,
    versionManager,
    loadSnapshot,
    getSnapshot,
    notify,
  }
}
