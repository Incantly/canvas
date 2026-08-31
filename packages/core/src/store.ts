import type {
  BoardRecord,
  Diff,
  DiffSource,
  Snapshot,
  ShapeRecord,
  AssetRecord,
  PageRecord,
  NotebookRecord,
} from './types/index.js'
import type { PageGapPreset } from './types/base.js'
import { CURRENT_SCHEMA } from './types/schema.js'
import { newId } from './utils/id.js'
import {
  emptyDiff,
  isDiffEmpty,
  invertDiff,
  composeDiff,
} from './utils/diff.js'
import {
  assignOrphanShapes,
  createNotebook,
  createPage,
  isNotebookRecord,
  isPageRecord,
  layoutPagePositions,
  NOTEBOOK_ID,
  validatePageLayout,
  validatePageGap,
  validatePageGapPreset,
  clampPageGap,
  pageGapForPreset,
  DEFAULT_PAGE_GAP,
  PAGE_GAP_STEP,
} from './pages.js'
import { migrateTextProps, validateBlocks } from './rich-text/document.js'
import type { TextBlock, DocumentBlock } from './rich-text/types.js'
import { isDrawingBlock } from './rich-text/types.js'
import type { DrawingStroke } from './rich-text/types.js'
import {
  getPageDocument,
  mergeTextShapesIntoPage,
  normalizePageRecord,
} from './page-document.js'
import {
  validateDocumentBlocks,
  textBlocksFromDocument,
  appendStrokeToDrawingBlock,
  extendDrawingStroke,
  emptyDrawingBlock,
  consolidateDocumentBlocks,
} from './page-document-blocks.js'
import { mergePageDocumentsIntoNotebook } from './notebook-document.js'
import { migrateSnapshot } from './migrations/index.js'

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
  private _cachedNbBlocks: DocumentBlock[] | null = null

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
    return this.all().filter((r) => r.typeName === 'shape') as ShapeRecord[]
  }
  pages(): PageRecord[] {
    return this.all()
      .filter((r) => isPageRecord(r))
      .sort((a, b) => a.index - b.index || (a.id < b.id ? -1 : 1))
  }
  page(id: string): PageRecord | null {
    const r = this.records.get(id)
    return r && isPageRecord(r) ? r : null
  }
  notebook(): NotebookRecord {
    const r = this.records.get(NOTEBOOK_ID)
    if (r && isNotebookRecord(r)) return r
    return createNotebook('vertical')
  }
  pageLayout(): import('./types/base.js').PageLayout {
    return this.notebook().pageLayout
  }
  setPageLayout(layout: import('./types/base.js').PageLayout, source: DiffSource = 'user'): void {
    if (!validatePageLayout(layout)) throw new Error(`Invalid page layout: ${layout}`)
    const nb = this.notebook()
    this.put({ ...nb, pageLayout: layout }, source)
    this.relayoutPages(source)
  }
  pageGap(): number {
    return this.notebook().pageGap ?? DEFAULT_PAGE_GAP
  }
  setPageGap(gap: number, source: DiffSource = 'user'): void {
    if (!validatePageGap(gap)) throw new Error(`Invalid page gap: ${gap}`)
    const next = clampPageGap(gap)
    const nb = this.notebook()
    if ((nb.pageGap ?? DEFAULT_PAGE_GAP) === next) return
    this.put({ ...nb, pageGap: next }, source)
    this.relayoutPages(source)
  }
  setPageGapPreset(preset: PageGapPreset, source: DiffSource = 'user'): void {
    if (!validatePageGapPreset(preset)) throw new Error(`Invalid page gap preset: ${preset}`)
    this.setPageGap(pageGapForPreset(preset), source)
  }
  adjustPageGap(delta: number, source: DiffSource = 'user'): void {
    if (!Number.isFinite(delta)) throw new Error(`Invalid page gap delta: ${delta}`)
    this.setPageGap(this.pageGap() + delta, source)
  }
  relayoutPages(source: DiffSource = 'user'): void {
    const pages = this.pages()
    if (!pages.length) return
    const gap = this.pageGap()
    const updates = layoutPagePositions(pages, this.pageLayout(), gap)
    this.transact(() => {
      for (const u of updates) {
        const p = this.page(u.id)
        if (p && (p.x !== u.x || p.y !== u.y)) this.update(u.id, { x: u.x, y: u.y }, source)
      }
    }, source)
  }
  shapesOnPage(pageId: string): ShapeRecord[] {
    return this.shapes().filter((s) => s.parentId === pageId)
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
      if (rec.id === NOTEBOOK_ID) this._cachedNbBlocks = null
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
        if (id === NOTEBOOK_ID) this._cachedNbBlocks = null
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
    return { schema: CURRENT_SCHEMA, document: { store: Object.fromEntries(this.records) } }
  }

  /** Ensure at least one page exists and orphan shapes have parentId. */
  normalizePages(source: DiffSource = 'remote'): string {
    if (!this.records.has(NOTEBOOK_ID)) {
      this.put(createNotebook('vertical'), source)
    }
    let pages = this.pages()
    if (!pages.length) {
      const page = createPage(0)
      this.put(page, source)
      pages = [page]
    } else {
      for (const p of pages) {
        if (typeof p.x !== 'number' || typeof p.y !== 'number') {
          this.update(p.id, { x: p.x ?? 0, y: p.y ?? 0 }, source)
        }
      }
    }
    this.relayoutPages(source)
    const pageId = this.pages()[0].id
    for (const { id, parentId } of assignOrphanShapes(this.shapes(), pageId)) {
      this.update(id, { parentId }, source)
    }
    return pageId
  }

  addPage(
    opts: { width?: number; height?: number; name?: string } = {},
    source: DiffSource = 'user'
  ): PageRecord {
    const page = createPage(this.pages().length, opts)
    this.put(page, source)
    this.relayoutPages(source)
    return this.page(page.id)!
  }

  removePage(id: string, source: DiffSource = 'user'): boolean {
    const pages = this.pages()
    if (pages.length <= 1) return false
    const page = this.page(id)
    if (!page) return false
    const shapeIds = this.shapesOnPage(id).map((s) => s.id)
    this.transact(() => {
      if (shapeIds.length) this.remove(shapeIds, source)
      this.remove([id], source)
      let i = 0
      for (const p of this.pages()) {
        if (p.index !== i) this.update(p.id, { index: i }, source)
        i++
      }
    }, source)
    this.relayoutPages(source)
    return true
  }

  loadSnapshot(snap: Snapshot, source: DiffSource = 'remote'): void {
    this._cachedNbBlocks = null
    const migrated = migrateSnapshot(snap)
    const recs = migrated.document?.store || {}
    this.transact(() => {
      this.remove(this.ids(), source)
      for (const rec of Object.values(recs)) if (rec && (rec as any).id) this.put(rec as BoardRecord, source)
    }, source)
    this.undos.length = 0
    this.redos.length = 0
    this._batch = null
    this.normalizePages(source)
    this._notifyHistory()
  }

  /** @deprecated Use {@link migrateSnapshot} instead. Kept for backward compatibility. */
  migrateRichText(source: DiffSource = 'remote'): void {
    for (const s of this.shapes()) {
      if (s.type !== 'text' && s.type !== 'note') continue
      const props = s.props as unknown as Record<string, unknown>
      if (props.text !== undefined || props.blocks !== undefined) {
        const migrated = migrateTextProps(props)
        this.put({ ...s, props: migrated } as ShapeRecord, source)
      }
    }
  }

  /** @deprecated Use {@link migrateSnapshot} instead. Kept for backward compatibility. */
  migratePageDocuments(source: DiffSource = 'remote'): void {
    const nb = this.notebook()
    if (nb.document?.blocks?.length) {
      for (const page of this.pages()) {
        const textShapes = this.shapesOnPage(page.id).filter((s) => s.type === 'text')
        if (textShapes.length) {
          const merged = mergeTextShapesIntoPage(page, textShapes)
          this.setNotebookDocument(
            [...this.notebookDocumentBlocks(), ...merged],
            source,
          )
          this.remove(textShapes.map((s) => s.id), source)
        }
        if (page.document) {
          const { document: _doc, ...rest } = page
          this.put(rest as PageRecord, source)
        }
      }
      return
    }
    for (const page of this.pages()) {
      const textShapes = this.shapesOnPage(page.id).filter((s) => s.type === 'text')
      if (textShapes.length) {
        const blocks = mergeTextShapesIntoPage(page, textShapes)
        this.put({ ...page, document: { blocks } }, source)
        this.remove(textShapes.map((s) => s.id), source)
      } else if (!page.document?.blocks) {
        this.put(normalizePageRecord(page), source)
      } else {
        const blocks = getPageDocument(page)
        this.put({ ...page, document: { blocks } }, source)
      }
    }
  }

  /** @deprecated Use {@link migrateSnapshot} instead. Kept for backward compatibility. */
  migrateNotebookDocument(source: DiffSource = 'remote'): void {
    const nb = this.notebook()
    if (nb.document?.blocks?.length) {
      const blocks = validateDocumentBlocks(nb.document.blocks)
      if (nb.document.blocks !== blocks) {
        this.put({ ...nb, document: { blocks } }, source)
      }
      return
    }
    const pages = this.pages()
    const blocks = consolidateDocumentBlocks(mergePageDocumentsIntoNotebook(pages))
    this.put({ ...nb, document: { blocks } }, source)
    for (const page of pages) {
      if (page.document) {
        const { document: _doc, ...rest } = page
        this.put(rest as PageRecord, source)
      }
    }
  }

  notebookDocumentBlocks(): DocumentBlock[] {
    if (this._cachedNbBlocks) return this._cachedNbBlocks
    const nb = this.notebook()
    let blocks: DocumentBlock[]
    if (nb.document?.blocks) {
      blocks = validateDocumentBlocks(nb.document.blocks)
    } else {
      const pages = this.pages()
      blocks = pages[0] ? getPageDocument(pages[0]) : validateDocumentBlocks(null)
    }
    this._cachedNbBlocks = blocks
    return blocks
  }

  setNotebookDocument(blocks: DocumentBlock[], source: DiffSource = 'user'): void {
    this._cachedNbBlocks = null
    const nb = this.notebook()
    this.put(
      { ...nb, document: { blocks: consolidateDocumentBlocks(blocks) } },
      source,
    )
  }

  pageDocumentBlocks(_pageId: string): DocumentBlock[] {
    return this.notebookDocumentBlocks()
  }

  pageDocumentTextBlocks(_pageId: string): TextBlock[] {
    return textBlocksFromDocument(this.notebookDocumentBlocks())
  }

  setPageDocument(_pageId: string, blocks: DocumentBlock[], source: DiffSource = 'user'): void {
    this.setNotebookDocument(blocks, source)
  }

  /** Single trailing drawing block for Apple Notes ink (end of body only). */
  ensureEndDrawingBlock(_pageId: string, source: DiffSource = 'user'): number {
    let blocks = consolidateDocumentBlocks(this.notebookDocumentBlocks())
    const last = blocks[blocks.length - 1]
    if (!last || !isDrawingBlock(last)) {
      blocks = [...blocks, emptyDrawingBlock()]
    }
    this.setNotebookDocument(blocks, source)
    return blocks.length - 1
  }

  appendDocumentDrawingStroke(
    pageId: string,
    blockIndex: number,
    stroke: DrawingStroke,
    source: DiffSource = 'user',
  ): void {
    if (!this.page(pageId)) throw new Error('Unknown page')
    const blocks = this.notebookDocumentBlocks()
    const block = blocks[blockIndex]
    if (!block || !isDrawingBlock(block)) {
      throw new Error(`Invalid drawing block index: ${blockIndex}`)
    }
    const next = blocks.slice()
    next[blockIndex] = appendStrokeToDrawingBlock(block, stroke)
    this.setNotebookDocument(next, source)
  }

  extendDocumentDrawingStroke(
    _pageId: string,
    blockIndex: number,
    strokeIndex: number,
    localX: number,
    localY: number,
    pressure: number,
    source: DiffSource = 'user',
  ): void {
    const blocks = this.notebookDocumentBlocks()
    const block = blocks[blockIndex]
    if (!block || !isDrawingBlock(block)) return
    const next = blocks.slice()
    next[blockIndex] = extendDrawingStroke(block, strokeIndex, localX, localY, pressure)
    this.setNotebookDocument(next, source)
  }

  insertDocumentDrawingBlock(_pageId: string, afterIndex: number, source: DiffSource = 'user'): number {
    const blocks = this.notebookDocumentBlocks()
    const insertAt = afterIndex < 0 ? 0 : afterIndex + 1
    const existing = blocks[insertAt]
    if (existing && isDrawingBlock(existing)) return insertAt
    const next = blocks.slice()
    next.splice(insertAt, 0, emptyDrawingBlock())
    this.setNotebookDocument(next, source)
    return insertAt
  }

  clear(source: DiffSource = 'user'): void {
    this.remove(this.ids(), source)
  }

  clearPage(pageId: string, source: DiffSource = 'user'): void {
    const ids = this.shapesOnPage(pageId).map((s) => s.id)
    if (ids.length) this.remove(ids, source)
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
