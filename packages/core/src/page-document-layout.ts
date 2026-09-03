import type { Bounds } from './types/base.js'
import type { PageRecord } from './types/models.js'

/** Horizontal inset from page edge (≈1" at 96dpi). */
export const PAGE_DOC_MARGIN_X = 72
/** Top inset — room below page chrome. */
export const PAGE_DOC_MARGIN_Y = 96
/** Default body size for page documents (Notes-like). */
export const PAGE_DOC_FONT_SIZE = 17

export function pageContentRect(page: PageRecord): Bounds {
  return {
    x: PAGE_DOC_MARGIN_X,
    y: PAGE_DOC_MARGIN_Y,
    w: Math.max(120, page.width - PAGE_DOC_MARGIN_X * 2),
    h: Math.max(200, page.height - PAGE_DOC_MARGIN_Y - PAGE_DOC_MARGIN_X),
  }
}

export function notesPageContentRect(page: PageRecord, paperH: number): Bounds {
  return {
    x: PAGE_DOC_MARGIN_X,
    y: PAGE_DOC_MARGIN_Y,
    w: Math.max(120, page.width - PAGE_DOC_MARGIN_X * 2),
    h: Math.max(200, paperH - PAGE_DOC_MARGIN_Y - PAGE_DOC_MARGIN_X),
  }
}
