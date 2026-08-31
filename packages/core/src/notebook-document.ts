import type { Theme } from './types/themes.js'
import type { Bounds } from './types/base.js'
import type { PageRecord } from './types/models.js'
import type { DocumentBlock } from './rich-text/types.js'
import { isDrawingBlock } from './rich-text/types.js'
import {
  layoutPageDocument,
  validateDocumentBlocks,
  type LayoutBlockEntry,
  type PageDocumentLayout,
} from './page-document-blocks.js'
import {
  PAGE_DOC_MARGIN_X,
  PAGE_DOC_MARGIN_Y,
  PAGE_DOC_FONT_SIZE,
  pageContentRect,
} from './page-document.js'
import { DEFAULT_PAGE_HEIGHT } from './pages.js'

/** Minimum scrollable paper height (one screen of notes). */
export const NOTES_MIN_BODY_HEIGHT = DEFAULT_PAGE_HEIGHT

export interface VirtualPrintPage {
  index: number
  /** Page-local Y where this slice starts in the continuous layout. */
  sliceY: number
  /** Height of content shown on this print page. */
  sliceH: number
  entries: LayoutBlockEntry[]
}

export function notesContentWidth(page: PageRecord): number {
  return pageContentRect(page).w
}

export function notesPaperHeight(
  page: PageRecord,
  blocks: DocumentBlock[],
  theme: Theme,
): number {
  const contentW = notesContentWidth(page)
  const layout = layoutPageDocument(blocks, contentW, theme)
  const inner = Math.max(NOTES_MIN_BODY_HEIGHT - PAGE_DOC_MARGIN_Y * 2, layout.totalHeight + 48)
  return Math.max(
    NOTES_MIN_BODY_HEIGHT,
    PAGE_DOC_MARGIN_Y + inner + PAGE_DOC_MARGIN_X,
  )
}

export function notesPaperBounds(page: PageRecord, paperH: number): Bounds {
  return { x: page.x, y: page.y, w: page.width, h: paperH }
}

/** Flow layout into fixed-height print slices (A4 content area per slice). */
export function virtualPrintPages(
  blocks: DocumentBlock[],
  contentW: number,
  sliceContentH: number,
  theme: Theme,
): VirtualPrintPage[] {
  const layout = layoutPageDocument(blocks, contentW, theme)
  if (!layout.entries.length) {
    return [{ index: 0, sliceY: 0, sliceH: sliceContentH, entries: [] }]
  }
  const pages: VirtualPrintPage[] = []
  let pageIndex = 0
  let sliceY = 0
  let used = 0
  let bucket: LayoutBlockEntry[] = []

  const flush = (): void => {
    pages.push({ index: pageIndex, sliceY, sliceH: sliceContentH, entries: bucket })
    pageIndex++
    sliceY += sliceContentH
    used = 0
    bucket = []
  }

  for (const entry of layout.entries) {
    const blockH = entry.h + (isDrawingBlock(entry.block) ? 10 : 4)
    if (used > 0 && used + blockH > sliceContentH && !isDrawingBlock(entry.block)) {
      flush()
    }
    if (isDrawingBlock(entry.block) && used > 0 && used + blockH > sliceContentH) {
      flush()
    }
    bucket.push({ ...entry, y: entry.y - sliceY })
    used += blockH
    if (used >= sliceContentH * 0.95 && isDrawingBlock(entry.block)) flush()
  }
  if (bucket.length || !pages.length) flush()
  return pages
}

export function mergePageDocumentsIntoNotebook(pages: PageRecord[]): DocumentBlock[] {
  const merged: DocumentBlock[] = []
  for (const page of pages) {
    if (page.document?.blocks?.length) {
      merged.push(...validateDocumentBlocks(page.document.blocks))
    }
  }
  return validateDocumentBlocks(merged.length ? merged : undefined)
}
