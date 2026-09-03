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
  validatePaperStyle,
  clampPageGap,
  pageGapForPreset,
  paperSizePreset,
  DEFAULT_PAGE_GAP,
  PAGE_GAP_STEP,
  type CreatePageOpts,
} from './pages.js'
import type { PaperSizeId, PaperStyleId } from './types/base.js'
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
      if (rec.id === NOTEBOOK_ID || isPageRecord(rec)) this._cachedNbBlocks = null
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
        if (id === NOTEBOOK_ID || id.startsWith('page:')) this._cachedNbBlocks = null
        const prev = this.records.get(id)
        if (prev && isPageRecord(prev)) this._cachedNbBlocks = null
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

  addPage(opts: CreatePageOpts = {}, source: DiffSource = 'user'): PageRecord {
    const page = createPage(this.pages().length, opts)
    this.put(page, source)
    this.relayoutPages(source)
    return this.page(page.id)!
  }

  /** Insert a page immediately after `afterId` (used when overflow must not skip existing pages). */
  insertPageAfter(
    afterId: string,
    opts: CreatePageOpts = {},
    source: DiffSource = 'user',
  ): PageRecord {
    const after = this.page(afterId)
    if (!after) throw new Error(`Unknown page: ${afterId}`)
    const index = after.index + 1
    const page = createPage(index, opts)
    this.transact(() => {
      this.put(page, source)
      for (const p of this.pages()) {
        if (p.id !== page.id && p.index >= index) {
          this.update(p.id, { index: p.index + 1 }, source)
        }
      }
    }, source)
    this.relayoutPages(source)
    return this.page(page.id)!
  }

  /** Update paper size/style on an existing page. */
  setPagePaper(
    pageId: string,
    opts: {
      width?: number
      height?: number
      paperStyle?: PaperStyleId
      paperSize?: PaperSizeId
    },
    source: DiffSource = 'user',
  ): boolean {
    const page = this.page(pageId)
    if (!page) return false
    const preset = opts.paperSize ? paperSizePreset(opts.paperSize) : null
    const next: PageRecord = {
      ...page,
      width: opts.width ?? preset?.width ?? page.width,
      height: opts.height ?? preset?.height ?? page.height,
    }
    if (opts.paperStyle !== undefined && validatePaperStyle(opts.paperStyle)) {
      next.paperStyle = opts.paperStyle
    }
    this.put(next, source)
    this.relayoutPages(source)
    return true
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

  /**
   * Compat: first page's document (discrete notes).
   * Prefer {@link pageDocumentBlocks} with an explicit page id.
   */
  notebookDocumentBlocks(): DocumentBlock[] {
    if (this._cachedNbBlocks) return this._cachedNbBlocks
    const pages = this.pages()
    const first = pages[0]
    if (!first) {
      this._cachedNbBlocks = validateDocumentBlocks(null)
      return this._cachedNbBlocks
    }
    // Legacy continuous stream still present (pre-migration load)
    const nb = this.notebook()
    if (nb.document?.blocks?.length && !first.document?.blocks?.length) {
      this._cachedNbBlocks = validateDocumentBlocks(nb.document.blocks)
      return this._cachedNbBlocks
    }
    this._cachedNbBlocks = getPageDocument(first)
    return this._cachedNbBlocks
  }

  /** Compat: writes to the first page. Prefer {@link setPageDocument}. */
  setNotebookDocument(blocks: DocumentBlock[], source: DiffSource = 'user'): void {
    const pages = this.pages()
    const first = pages[0]
    if (!first) return
    this.setPageDocument(first.id, blocks, source)
  }

  pageDocumentBlocks(pageId: string): DocumentBlock[] {
    const page = this.page(pageId)
    if (!page) return validateDocumentBlocks(null)
    return getPageDocument(page)
  }

  pageDocumentTextBlocks(pageId: string): TextBlock[] {
    return textBlocksFromDocument(this.pageDocumentBlocks(pageId))
  }

  setPageDocument(pageId: string, blocks: DocumentBlock[], source: DiffSource = 'user'): void {
    const page = this.page(pageId)
    if (!page) throw new Error(`Unknown page: ${pageId}`)
    this._cachedNbBlocks = null
    this.put(
      {
        ...page,
        document: { blocks: consolidateDocumentBlocks(validateDocumentBlocks(blocks)) },
      },
      source,
    )
  }

  /** Trailing drawing block for page-absolute ink overlay. */
  ensureEndDrawingBlock(pageId: string, source: DiffSource = 'user'): number {
    if (!this.page(pageId)) throw new Error('Unknown page')
    let blocks = consolidateDocumentBlocks(this.pageDocumentBlocks(pageId))
    const last = blocks[blocks.length - 1]
    if (!last || !isDrawingBlock(last)) {
      blocks = [...blocks, emptyDrawingBlock()]
    }
    this.setPageDocument(pageId, blocks, source)
    return blocks.length - 1
  }

  appendDocumentDrawingStroke(
    pageId: string,
    blockIndex: number,
    stroke: DrawingStroke,
    source: DiffSource = 'user',
  ): void {
    if (!this.page(pageId)) throw new Error('Unknown page')
    const blocks = this.pageDocumentBlocks(pageId)
    const block = blocks[blockIndex]
    if (!block || !isDrawingBlock(block)) {
      throw new Error(`Invalid drawing block index: ${blockIndex}`)
    }
    const next = blocks.slice()
    next[blockIndex] = appendStrokeToDrawingBlock(block, stroke)
    this.setPageDocument(pageId, next, source)
  }

  extendDocumentDrawingStroke(
    pageId: string,
    blockIndex: number,
    strokeIndex: number,
    localX: number,
    localY: number,
    pressure: number,
    source: DiffSource = 'user',
  ): void {
    if (!this.page(pageId)) return
    const blocks = this.pageDocumentBlocks(pageId)
    const block = blocks[blockIndex]
    if (!block || !isDrawingBlock(block)) return
    const next = blocks.slice()
    next[blockIndex] = extendDrawingStroke(block, strokeIndex, localX, localY, pressure)
    this.setPageDocument(pageId, next, source)
  }

  insertDocumentDrawingBlock(pageId: string, afterIndex: number, source: DiffSource = 'user'): number {
    if (!this.page(pageId)) throw new Error('Unknown page')
    const blocks = this.pageDocumentBlocks(pageId)
    const insertAt = afterIndex < 0 ? 0 : afterIndex + 1
    const existing = blocks[insertAt]
    if (existing && isDrawingBlock(existing)) return insertAt
    const next = blocks.slice()
    next.splice(insertAt, 0, emptyDrawingBlock())
    this.setPageDocument(pageId, next, source)
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
