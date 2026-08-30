import type {
  BoardRecord,
  Diff,
  DiffSource,
  Snapshot,
  ShapeRecord,
  AssetRecord,
} from './types/index.js'
import { newId } from './utils/id.js'
import {
  emptyDiff,
  isDiffEmpty,
  invertDiff,
  composeDiff,
} from './utils/diff.js'

export { newId } from './utils/id.js'
export { isDiffEmpty, invertDiff, composeDiff } from './utils/diff.js'

interface StoreListener {
  fn: (diff: Diff, source: DiffSource) => void
  source: DiffSource | 'all'
}

interface TxFrame {
  diff: Diff
  source: DiffSource
}

export class Store {
  records: Map<string, BoardRecord>
  undos: Diff[]
  redos: Diff[]
  private listeners: Set<StoreListener>
  private historyListeners: Set<() => void>
  private _batch: Diff | null
  private _tx: TxFrame | null
  private _applyingHistory: boolean

  constructor() {
    this.records = new Map()
    this.listeners = new Set()
    this.historyListeners = new Set()
    this.undos = []
    this.redos = []
    this._batch = null
    this._tx = null
    this._applyingHistory = false
  }

  get(id: string): BoardRecord | undefined {
    return this.records.get(id)
  }
  has(id: string): boolean {
    return this.records.has(id)
  }
  ids(): string[] {
    return [...this.records.keys()]
  }
  all(): BoardRecord[] {
    return [...this.records.values()]
  }
  shapes(): ShapeRecord[] {
    return this.all().filter((r) => r.typeName !== 'asset') as ShapeRecord[]
  }
  asset(id: string): AssetRecord | null {
    const r = this.records.get(id)
    return r && r.typeName === 'asset' ? (r as AssetRecord) : null
  }
  get size(): number {
    return this.records.size
  }

  listen(
    fn: (diff: Diff, source: DiffSource) => void,
    { source = 'all' }: { source?: DiffSource | 'all' } = {}
  ): () => void {
    const l: StoreListener = { fn, source }
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }

  private _emit(diff: Diff, source: DiffSource): void {
    for (const l of [...this.listeners]) {
      if (l.source !== 'all' && l.source !== source) continue
      try {
        l.fn(diff, source)
      } catch (e) {
        console.warn('board listener failed', e)
      }
    }
  }

  listenHistory(fn: () => void): () => void {
    this.historyListeners.add(fn)
    return () => this.historyListeners.delete(fn)
  }

  private _notifyHistory(): void {
    for (const fn of [...this.historyListeners]) {
      try {
        fn()
      } catch (e) {
        console.warn('board history listener failed', e)
      }
    }
  }

  transact(fn: () => void, source: DiffSource = 'user'): void {
    if (this._tx) {
      fn()
      return
    }
    this._tx = { diff: emptyDiff(), source }
    try {
      fn()
    } finally {
      const { diff } = this._tx
      this._tx = null
      if (!isDiffEmpty(diff)) {
        if (source === 'user' && !this._applyingHistory) {
          if (this._batch) this._batch = composeDiff(this._batch, diff)
          else {
            this.undos.push(diff)
            if (this.undos.length > 256) this.undos.shift()
          }
          this.redos.length = 0
        }
        this._emit(diff, source)
        if (source === 'user') this._notifyHistory()
      }
    }
  }

  put(rec: BoardRecord, source: DiffSource = 'user'): void {
    this.transact(() => {
      const prev = this.records.get(rec.id)
      this.records.set(rec.id, rec)
      const d = this._tx!.diff
      if (prev) {
        if (d.added[rec.id]) d.added[rec.id] = rec
        else if (d.updated[rec.id])
          d.updated[rec.id] = [d.updated[rec.id][0], rec]
        else d.updated[rec.id] = [prev, rec]
      } else if (d.removed[rec.id]) {
        const before = d.removed[rec.id]
        delete d.removed[rec.id]
        d.updated[rec.id] = [before, rec]
      } else d.added[rec.id] = rec
    }, source)
  }

  update(
    id: string,
    patch: Partial<BoardRecord> & { props?: Record<string, any> },
    source: DiffSource = 'user'
  ): void {
    const prev = this.records.get(id)
    if (!prev) return
    const next: BoardRecord = {
      ...prev,
      ...patch,
      ...(patch.props ? { props: { ...(prev as any).props, ...patch.props } } : {}),
    } as BoardRecord
    this.put(next, source)
  }

  remove(idList: string[], source: DiffSource = 'user'): void {
    this.transact(() => {
      for (const id of idList) {
        const prev = this.records.get(id)
        if (!prev) continue
        this.records.delete(id)
        const d = this._tx!.diff
        if (d.added[id]) delete d.added[id]
        else if (d.updated[id]) {
          d.removed[id] = d.updated[id][0]
          delete d.updated[id]
        } else d.removed[id] = prev
      }
    }, source)
  }

  applyDiff(diff: Diff, source: DiffSource = 'remote'): void {
    this.transact(() => {
      for (const rec of Object.values(diff.added || {})) this.put(rec, source)
      for (const [, [, to]] of Object.entries(diff.updated || {})) this.put(to, source)
      this.remove(Object.keys(diff.removed || {}), source)
    }, source)
  }

  beginBatch(): void {
    if (!this._batch) this._batch = emptyDiff()
  }
  endBatch(): void {
    const b = this._batch
    this._batch = null
    if (b && !isDiffEmpty(b)) {
      this.undos.push(b)
      if (this.undos.length > 256) this.undos.shift()
      this.redos.length = 0
      this._notifyHistory()
    }
  }

  get canUndo(): boolean {
    return this.undos.length > 0
  }
  get canRedo(): boolean {
    return this.redos.length > 0
  }

  undo(): void {
    this.endBatch()
    const d = this.undos.pop()
    if (!d) return
    this.redos.push(d)
    this._applyingHistory = true
    try {
      this.applyDiff(invertDiff(d), 'user')
    } finally {
      this._applyingHistory = false
    }
    this._notifyHistory()
  }

  redo(): void {
    const d = this.redos.pop()
    if (!d) return
    this.undos.push(d)
    this._applyingHistory = true
    try {
      this.applyDiff(d, 'user')
    } finally {
      this._applyingHistory = false
    }
    this._notifyHistory()
  }

  getSnapshot(): Snapshot {
    return { document: { store: Object.fromEntries(this.records) } }
  }

  loadSnapshot(snap: Snapshot, source: DiffSource = 'remote'): void {
    const recs = snap?.document?.store || {}
    this.transact(() => {
      this.remove(this.ids(), source)
      for (const rec of Object.values(recs)) if (rec && (rec as any).id) this.put(rec as BoardRecord, source)
    }, source)
    this.undos.length = 0
    this.redos.length = 0
    this._batch = null
    this._notifyHistory()
  }

  clear(source: DiffSource = 'user'): void {
    this.remove(this.ids(), source)
  }

  maxZ(): number {
    let z = 0
    for (const r of this.records.values()) if ((r as any).z > z) z = (r as any).z
    return z
  }
  minZ(): number {
    let z = 0
    for (const r of this.records.values()) if ((r as any).z < z) z = (r as any).z
    return z
  }
}
