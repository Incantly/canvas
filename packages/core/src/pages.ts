import type {
  GridId,
  PageGapPreset,
  PageLayout,
  PaperSizeId,
  PaperStyleId,
} from './types/base.js'
import type { NotebookRecord, PageRecord, ShapeRecord } from './types/models.js'
import { emptyDocument } from './rich-text/document.js'
import { newId } from './utils/id.js'

export const NOTEBOOK_ID = 'notebook:main'
/** US Letter @ 96dpi */
export const DEFAULT_PAGE_WIDTH = 816
export const DEFAULT_PAGE_HEIGHT = 1056
export const DEFAULT_PAGE_GAP = 48
export const PAGE_GAP_STEP = 16
export const MAX_PAGE_GAP = 256
export const PAGE_GAP_PRESETS: Record<PageGapPreset, number> = {
  connected: 0,
  normal: DEFAULT_PAGE_GAP,
  wide: 96,
}

/** Paper size presets (CSS px @ 96dpi). */
export const PAPER_SIZE_PRESETS: Record<PaperSizeId, { width: number; height: number }> = {
  letter: { width: 816, height: 1056 },
  a4: { width: 794, height: 1123 },
}

export function paperSizePreset(id: PaperSizeId): { width: number; height: number } {
  return { ...PAPER_SIZE_PRESETS[id] }
}

export function validatePaperStyle(v: unknown): v is PaperStyleId {
  return v === 'plain' || v === 'ruled' || v === 'grid' || v === 'dots'
}

export function validatePaperSizeId(v: unknown): v is PaperSizeId {
  return v === 'letter' || v === 'a4'
}

/** Map document paper style to the existing page-grid kind used for rendering. */
export function paperStyleToGridId(style: PaperStyleId | undefined): GridId {
  if (style === 'ruled') return 'ruled'
  if (style === 'grid') return 'lines'
  if (style === 'dots') return 'dots'
  return 'none'
}

export function inferPaperSizeId(width: number, height: number): PaperSizeId | null {
  for (const id of Object.keys(PAPER_SIZE_PRESETS) as PaperSizeId[]) {
    const p = PAPER_SIZE_PRESETS[id]
    if (p.width === width && p.height === height) return id
  }
  return null
}

export type CreatePageOpts = {
  x?: number
  y?: number
  width?: number
  height?: number
  name?: string
  grid?: GridId
  paperStyle?: PaperStyleId
  paperSize?: PaperSizeId
}

export function createPage(index: number, opts: CreatePageOpts = {}): PageRecord {
  const size = opts.paperSize ? paperSizePreset(opts.paperSize) : null
  return {
    id: newId('page'),
    typeName: 'page',
    index,
    x: opts.x ?? 0,
    y: opts.y ?? 0,
    width: opts.width ?? size?.width ?? DEFAULT_PAGE_WIDTH,
    height: opts.height ?? size?.height ?? DEFAULT_PAGE_HEIGHT,
    name: opts.name ?? `Page ${index + 1}`,
    ...(opts.grid ? { grid: opts.grid } : {}),
    ...(opts.paperStyle && validatePaperStyle(opts.paperStyle)
      ? { paperStyle: opts.paperStyle }
      : {}),
    document: { blocks: emptyDocument() },
  }
}

export function createNotebook(pageLayout: PageLayout = 'vertical'): NotebookRecord {
  return { id: NOTEBOOK_ID, typeName: 'notebook', pageLayout, pageGap: DEFAULT_PAGE_GAP }
}

export function isPageRecord(r: { typeName?: string }): r is PageRecord {
  return r.typeName === 'page'
}

export function isNotebookRecord(r: { typeName?: string }): r is NotebookRecord {
  return r.typeName === 'notebook'
}

export function pageBoundsRect(page: PageRecord) {
  return { x: page.x, y: page.y, w: page.width, h: page.height }
}

export function layoutPagePositions(
  pages: PageRecord[],
  layout: PageLayout,
  gap = DEFAULT_PAGE_GAP,
): Array<{ id: string; x: number; y: number }> {
  const sorted = [...pages].sort((a, b) => a.index - b.index || (a.id < b.id ? -1 : 1))
  const updates: Array<{ id: string; x: number; y: number }> = []
  if (layout === 'vertical') {
    let y = 0
    for (const p of sorted) {
      updates.push({ id: p.id, x: 0, y })
      y += p.height + gap
    }
    return updates
  }
  let x = 0
  for (const p of sorted) {
    updates.push({ id: p.id, x, y: 0 })
    x += p.width + gap
  }
  return updates
}

export function assignOrphanShapes(
  shapes: ShapeRecord[],
  pageId: string,
): Array<{ id: string; parentId: string }> {
  const out: Array<{ id: string; parentId: string }> = []
  for (const s of shapes) {
    if (!s.parentId) out.push({ id: s.id, parentId: pageId })
  }
  return out
}

export function validatePageLayout(layout: unknown): layout is PageLayout {
  return layout === 'vertical' || layout === 'horizontal'
}

export function clampPageGap(gap: number): number {
  if (!Number.isFinite(gap)) return DEFAULT_PAGE_GAP
  return Math.max(0, Math.min(MAX_PAGE_GAP, Math.round(gap)))
}

export function validatePageGap(gap: unknown): gap is number {
  return typeof gap === 'number' && Number.isFinite(gap) && gap >= 0 && gap <= MAX_PAGE_GAP
}

export function validatePageGapPreset(preset: unknown): preset is PageGapPreset {
  return preset === 'connected' || preset === 'normal' || preset === 'wide'
}

export function pageGapForPreset(preset: PageGapPreset): number {
  return PAGE_GAP_PRESETS[preset]
}

export function pageGapPresetFor(gap: number): PageGapPreset | null {
  for (const key of Object.keys(PAGE_GAP_PRESETS) as PageGapPreset[]) {
    if (PAGE_GAP_PRESETS[key] === gap) return key
  }
  return null
}
