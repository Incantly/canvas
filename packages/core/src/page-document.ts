import type { Bounds } from './types/base.js'
import type { PageRecord, ShapeRecord } from './types/models.js'
import type { TextBlock, DocumentBlock } from './rich-text/types.js'
import { getShapeBlocks } from './rich-text/document.js'
import { validateDocumentBlocks } from './page-document-blocks.js'

/** Horizontal inset from page edge (≈1" at 96dpi). */
export const PAGE_DOC_MARGIN_X = 72
/** Top inset — room below page chrome. */
export const PAGE_DOC_MARGIN_Y = 96
/** Default body size for page documents (Notes-like). */
export const PAGE_DOC_FONT_SIZE = 17

export interface PageDocument {
  blocks: DocumentBlock[]
}

export function pageContentRect(page: PageRecord): Bounds {
  return {
    x: PAGE_DOC_MARGIN_X,
    y: PAGE_DOC_MARGIN_Y,
    w: Math.max(120, page.width - PAGE_DOC_MARGIN_X * 2),
    h: Math.max(200, page.height - PAGE_DOC_MARGIN_Y - PAGE_DOC_MARGIN_X),
  }
}

export function getPageDocument(page: PageRecord): DocumentBlock[] {
  const doc = page.document
  if (!doc?.blocks) return validateDocumentBlocks(null)
  return validateDocumentBlocks(doc.blocks)
}

export function normalizePageRecord(page: PageRecord): PageRecord {
  const blocks = getPageDocument(page)
  return { ...page, document: { blocks } }
}

export function pointInPageContent(page: PageRecord, lx: number, ly: number): boolean {
  const r = pageContentRect(page)
  return lx >= r.x && ly >= r.y && lx <= r.x + r.w && ly <= r.y + r.h
}

export function notesPageContentRect(page: PageRecord, paperH: number): Bounds {
  return {
    x: PAGE_DOC_MARGIN_X,
    y: PAGE_DOC_MARGIN_Y,
    w: Math.max(120, page.width - PAGE_DOC_MARGIN_X * 2),
    h: Math.max(200, paperH - PAGE_DOC_MARGIN_Y - PAGE_DOC_MARGIN_X),
  }
}

export function pointInNotesContent(
  page: PageRecord,
  lx: number,
  ly: number,
  paperH: number,
): boolean {
  const r = notesPageContentRect(page, paperH)
  return lx >= r.x && lx <= r.x + r.w && ly >= r.y && ly <= r.y + r.h
}

/** Full page sheet — ink may use margins outside the text column. */
export function pointInNotesPaper(
  page: PageRecord,
  lx: number,
  ly: number,
  paperH: number,
): boolean {
  return lx >= 0 && ly >= 0 && lx <= page.width && ly <= paperH
}

/** Merge legacy text shapes on a page into the page document body. */
export function mergeTextShapesIntoPage(
  page: PageRecord,
  textShapes: ShapeRecord[],
): DocumentBlock[] {
  let blocks = getPageDocument(page)
  const sorted = [...textShapes].sort((a, b) => a.y - b.y || a.x - b.x)
  for (const s of sorted) {
    if (s.type !== 'text') continue
    const shapeBlocks = getShapeBlocks(s.props as unknown as Record<string, unknown>)
    if (shapeBlocks.length) blocks = [...blocks, ...shapeBlocks]
  }
  return validateDocumentBlocks(blocks)
}

export function blocksFromPlainLines(lines: string[]): TextBlock[] {
  return lines.map((line) => ({
    type: 'paragraph' as const,
    content: [{ text: line }],
  }))
}

export function appendPlainTextToDocument(blocks: DocumentBlock[], text: string): DocumentBlock[] {
  const lines = String(text).split('\n')
  return validateDocumentBlocks([...blocks, ...blocksFromPlainLines(lines)])
}
