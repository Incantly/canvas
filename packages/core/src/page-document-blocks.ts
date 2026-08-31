import type { ColorId, SizeId } from './types/base.js'
import type { Theme } from './types/themes.js'
import type { PageRecord } from './types/models.js'
import { SIZES, HIGHLIGHT_SCALE, HIGHLIGHT_ALPHA } from './palette.js'
import { traceSmooth } from './geometry.js'
import type {
  DocumentBlock,
  DrawingBlock,
  DrawingStroke,
  TextBlock,
} from './rich-text/types.js'
import { isDrawingBlock, isTextBlock } from './rich-text/types.js'
import { emptyParagraph, validateBlocks } from './rich-text/document.js'
import { layoutRichText, drawRichTextLayout } from './rich-text/layout.js'
import { blocksToHtml, htmlToBlocks } from './rich-text/dom.js'
import { PAGE_DOC_FONT_SIZE, pageContentRect, notesPageContentRect } from './page-document.js'

export const DRAWING_BLOCK_MIN_HEIGHT = 120
export const DRAWING_BLOCK_GAP = 10
export const DRAWING_BLOCK_PAD = 12
/** Breathing room between the last text line and the ink-zone divider. */
export const DRAWING_BLOCK_TOP_GAP = 28

export interface LayoutBlockEntry {
  index: number
  block: DocumentBlock
  x: number
  y: number
  w: number
  h: number
}

export interface PageDocumentLayout {
  entries: LayoutBlockEntry[]
  contentW: number
  totalHeight: number
}

function normalizeStroke(raw: unknown): DrawingStroke | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Record<string, unknown>
  if (!Array.isArray(s.pts)) return null
  const pts = s.pts.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
  if (pts.length < 3) return null
  const kind = s.kind === 'highlight' ? 'highlight' : 'draw'
  const color = typeof s.color === 'string' ? (s.color as ColorId) : 'black'
  const size = typeof s.size === 'string' ? (s.size as SizeId) : 'm'
  return { pts, color, size, kind }
}

function normalizeDrawingBlock(raw: unknown): DrawingBlock | null {
  if (!raw || typeof raw !== 'object') return null
  const b = raw as Record<string, unknown>
  if (b.type !== 'drawing') return null
  const strokesRaw = Array.isArray(b.strokes) ? b.strokes : []
  const strokes = strokesRaw.map(normalizeStroke).filter((s): s is DrawingStroke => s !== null)
  let height = typeof b.height === 'number' && b.height > 0 ? b.height : DRAWING_BLOCK_MIN_HEIGHT
  height = Math.max(DRAWING_BLOCK_MIN_HEIGHT, height, strokeBoundsHeight(strokes))
  return { type: 'drawing', height, strokes }
}

export function strokeBoundsHeight(strokes: DrawingStroke[]): number {
  let maxY = 0
  for (const st of strokes) {
    for (let i = 1; i < st.pts.length; i += 3) {
      maxY = Math.max(maxY, st.pts[i])
    }
  }
  return maxY > 0 ? maxY + DRAWING_BLOCK_PAD * 2 : 0
}

export function drawingBlockHeight(block: DrawingBlock): number {
  return Math.max(
    DRAWING_BLOCK_MIN_HEIGHT,
    block.height,
    strokeBoundsHeight(block.strokes),
  )
}

export function emptyDrawingBlock(): DrawingBlock {
  return { type: 'drawing', height: DRAWING_BLOCK_MIN_HEIGHT, strokes: [] }
}

export function validateDocumentBlocks(raw: unknown): DocumentBlock[] {
  if (!Array.isArray(raw) || !raw.length) {
    return [emptyParagraph()]
  }
  const blocks: DocumentBlock[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    if (rec.type === 'drawing') {
      const db = normalizeDrawingBlock(rec)
      if (db) blocks.push(db)
      continue
    }
    const textOnly = validateBlocks([item])
    if (textOnly.length) blocks.push(textOnly[0]!)
  }
  return blocks.length ? blocks : [emptyParagraph()]
}

export function textBlocksFromDocument(blocks: DocumentBlock[]): TextBlock[] {
  return blocks.filter(isTextBlock)
}

let _layoutCache: {
  blocks: DocumentBlock[]
  contentW: number
  themeId: string
  result: PageDocumentLayout
} | null = null

function computeLayout(
  blocks: DocumentBlock[],
  contentW: number,
  theme: Theme,
): PageDocumentLayout {
  const entries: LayoutBlockEntry[] = []
  let y = 0
  let index = 0
  for (const block of blocks) {
    if (isTextBlock(block)) {
      const layout = layoutRichText({
        blocks: [block],
        maxW: contentW,
        defaultFont: 'sans',
        baseFontSize: PAGE_DOC_FONT_SIZE,
        defaultColor: 'black',
        theme,
        align: 'left',
      })
      const h = Math.max(layout.h, PAGE_DOC_FONT_SIZE * 1.45)
      entries.push({ index, block, x: 0, y, w: contentW, h })
      y += h + 4
    } else {
      y += DRAWING_BLOCK_TOP_GAP
      const h = drawingBlockHeight(block)
      entries.push({ index, block, x: 0, y, w: contentW, h })
      y += h + DRAWING_BLOCK_GAP
    }
    index++
  }
  return { entries, contentW, totalHeight: y }
}

export function layoutPageDocument(
  blocks: DocumentBlock[],
  contentW: number,
  theme: Theme,
): PageDocumentLayout {
  if (
    _layoutCache &&
    _layoutCache.blocks === blocks &&
    _layoutCache.contentW === contentW &&
    _layoutCache.themeId === theme.id
  ) {
    return _layoutCache.result
  }
  const result = computeLayout(blocks, contentW, theme)
  _layoutCache = { blocks, contentW, themeId: theme.id, result }
  return result
}

export function invalidateLayoutCache(): void {
  _layoutCache = null
}

export type DrawingTarget =
  | { action: 'draw'; blockIndex: number; localX: number; localY: number }
  | { action: 'hint-on-text'; textBlockIndex: number }
  | { action: 'ensure-end'; localX: number }
  | { action: 'reject' }

/** One ink region at the end of the body — Apple Notes style. */
export function consolidateDocumentBlocks(blocks: DocumentBlock[]): DocumentBlock[] {
  const validated = validateDocumentBlocks(blocks)
  const texts = validated.filter(isTextBlock)
  const drawings = validated.filter(isDrawingBlock)
  const base = texts.length ? texts : [emptyParagraph()]
  if (!drawings.length) return base
  const merged: DrawingBlock = {
    type: 'drawing',
    height: DRAWING_BLOCK_MIN_HEIGHT,
    strokes: [],
  }
  for (const d of drawings) {
    merged.strokes.push(...d.strokes)
    merged.height = Math.max(merged.height, d.height, strokeBoundsHeight(merged.strokes))
  }
  return [...base, merged]
}

export function findDrawingTarget(
  layout: PageDocumentLayout,
  blocks: DocumentBlock[],
  lx: number,
  ly: number,
): DrawingTarget {
  for (const e of layout.entries) {
    if (!isTextBlock(e.block)) continue
    if (ly >= e.y && ly < e.y + e.h && lx >= e.x && lx <= e.x + e.w) {
      return { action: 'hint-on-text', textBlockIndex: e.index }
    }
  }

  for (let i = 0; i < layout.entries.length - 1; i++) {
    const a = layout.entries[i]!
    const b = layout.entries[i + 1]!
    if (isTextBlock(a.block) && isTextBlock(b.block)) {
      if (ly >= a.y + a.h && ly < b.y) return { action: 'reject' }
    }
  }

  const lastBlock = blocks[blocks.length - 1]
  const lastEntry = layout.entries[layout.entries.length - 1]
  const lastTextEntry = [...layout.entries].reverse().find((e) => isTextBlock(e.block))

  if (lastBlock && isDrawingBlock(lastBlock) && lastEntry && isDrawingBlock(lastEntry.block)) {
    const tailEnd = lastEntry.y + lastEntry.h + 4096
    if (ly >= lastEntry.y && ly < tailEnd && lx >= lastEntry.x && lx <= lastEntry.x + lastEntry.w) {
      return {
        action: 'draw',
        blockIndex: lastEntry.index,
        localX: lx - lastEntry.x,
        localY: Math.max(DRAWING_BLOCK_PAD, ly - lastEntry.y),
      }
    }
  }

  if (lastTextEntry && ly >= lastTextEntry.y + lastTextEntry.h) {
    return { action: 'ensure-end', localX: lx }
  }

  return { action: 'reject' }
}

export function hitDocumentStroke(
  layout: PageDocumentLayout,
  blocks: DocumentBlock[],
  lx: number,
  ly: number,
  tolerance: number,
): { blockIndex: number; strokeIndex: number } | null {
  for (const entry of layout.entries) {
    if (!isDrawingBlock(entry.block)) continue
    const rx = lx - entry.x - DRAWING_BLOCK_PAD
    const ry = ly - entry.y - DRAWING_BLOCK_PAD
    for (let si = entry.block.strokes.length - 1; si >= 0; si--) {
      const stroke = entry.block.strokes[si]
      const pts = stroke.pts
      for (let i = 0; i < pts.length - 2; i += 3) {
        const dx = pts[i] - rx
        const dy = pts[i + 1] - ry
        if (dx * dx + dy * dy <= tolerance * tolerance) {
          return { blockIndex: entry.index, strokeIndex: si }
        }
      }
    }
  }
  return null
}

export function removeDocumentStroke(
  blocks: DocumentBlock[],
  blockIndex: number,
  strokeIndex: number,
): DocumentBlock[] {
  const block = blocks[blockIndex]
  if (!block || !isDrawingBlock(block)) return blocks
  const strokes = block.strokes.filter((_, i) => i !== strokeIndex)
  const next = blocks.slice()
  next[blockIndex] = {
    ...block,
    strokes,
    height: Math.max(DRAWING_BLOCK_MIN_HEIGHT, strokeBoundsHeight(strokes)),
  }
  return next
}

export function insertDrawingBlockAfter(
  blocks: DocumentBlock[],
  afterIndex: number,
): { blocks: DocumentBlock[]; blockIndex: number } {
  const next = blocks.slice()
  const insertAt = afterIndex < 0 ? 0 : afterIndex + 1
  next.splice(insertAt, 0, emptyDrawingBlock())
  return { blocks: next, blockIndex: insertAt }
}

export function appendStrokeToDrawingBlock(
  block: DrawingBlock,
  stroke: DrawingStroke,
): DrawingBlock {
  const strokes = [...block.strokes, stroke]
  return {
    ...block,
    strokes,
    height: Math.max(block.height, strokeBoundsHeight(strokes) || DRAWING_BLOCK_MIN_HEIGHT),
  }
}

export function extendDrawingStroke(
  block: DrawingBlock,
  strokeIndex: number,
  localX: number,
  localY: number,
  pressure: number,
): DrawingBlock {
  const strokes = block.strokes.map((s, i) => {
    if (i !== strokeIndex) return s
    return { ...s, pts: [...s.pts, localX, localY, pressure] }
  })
  return {
    ...block,
    strokes,
    height: Math.max(block.height, strokeBoundsHeight(strokes)),
  }
}

function drawStrokeInBlock(
  ctx: CanvasRenderingContext2D,
  stroke: DrawingStroke,
  theme: Theme,
  ghost: boolean,
): void {
  const col = theme.colors[stroke.color] ?? theme.colors.black
  const flat: number[] = []
  for (let i = 0; i < stroke.pts.length; i += 3) flat.push(stroke.pts[i]!, stroke.pts[i + 1]!)
  if (flat.length < 2) return
  ctx.save()
  if (stroke.kind === 'highlight') {
    ctx.globalAlpha = (ghost ? 0.3 : 1) * HIGHLIGHT_ALPHA
    ctx.globalCompositeOperation = theme.id === 'dark' ? 'lighten' : 'multiply'
    ctx.strokeStyle = col.stroke
    ctx.lineWidth = SIZES[stroke.size as SizeId] * HIGHLIGHT_SCALE
  } else {
    ctx.globalAlpha = ghost ? 0.35 : 1
    ctx.strokeStyle = col.stroke
    ctx.lineWidth = SIZES[stroke.size as SizeId] * 0.75
  }
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  traceSmooth(ctx, flat)
  ctx.stroke()
  ctx.restore()
}

function drawInkZoneDividerLine(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  theme: Theme,
): void {
  ctx.save()
  ctx.strokeStyle = theme.id === 'dark' ? 'rgba(255,255,255,0.18)' : 'rgba(60, 50, 30, 0.22)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + w, y)
  ctx.stroke()
  ctx.fillStyle = theme.id === 'dark' ? 'rgba(255,255,255,0.35)' : 'rgba(60, 50, 30, 0.35)'
  ctx.beginPath()
  ctx.moveTo(x + 4, y + 5)
  ctx.lineTo(x + 10, y + 9)
  ctx.lineTo(x + 4, y + 13)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/** Transient “write ink here” marker below the last text block. */
export function drawInkZoneHintDivider(
  ctx: CanvasRenderingContext2D,
  layout: PageDocumentLayout,
  theme: Theme,
  contentW: number,
): void {
  let lastText: LayoutBlockEntry | undefined
  for (let i = layout.entries.length - 1; i >= 0; i--) {
    const entry = layout.entries[i]!
    if (isTextBlock(entry.block)) {
      lastText = entry
      break
    }
  }
  if (!lastText) return
  const y = lastText.y + lastText.h + DRAWING_BLOCK_TOP_GAP
  drawInkZoneDividerLine(ctx, 0, y, contentW, theme)
}

export function drawDrawingBlockRegion(
  ctx: CanvasRenderingContext2D,
  block: DrawingBlock,
  x: number,
  y: number,
  w: number,
  h: number,
  theme: Theme,
  opts?: { ghost?: boolean; showDivider?: boolean },
): void {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  for (const stroke of block.strokes) {
    ctx.save()
    ctx.translate(x + DRAWING_BLOCK_PAD, y + DRAWING_BLOCK_PAD)
    drawStrokeInBlock(ctx, stroke, theme, !!opts?.ghost)
    ctx.restore()
  }
  ctx.restore()

  if (opts?.showDivider !== false) {
    drawInkZoneDividerLine(ctx, x, y, w, theme)
  }
}

export function drawPageDocumentBlocks(
  ctx: CanvasRenderingContext2D,
  page: PageRecord,
  blocks: DocumentBlock[],
  theme: Theme,
  opts?: {
    textOnly?: boolean
    drawingOnly?: boolean
    skipDrawingIndices?: Set<number>
    paperHeight?: number
    /** Transient divider when ink is redirected off text (Apple Notes hint). */
    showDrawingDivider?: boolean
  },
): PageDocumentLayout {
  const rect =
    opts?.paperHeight != null
      ? notesPageContentRect(page, opts.paperHeight)
      : pageContentRect(page)
  const layout = layoutPageDocument(blocks, rect.w, theme)
  ctx.save()
  ctx.translate(rect.x, rect.y)
  for (const entry of layout.entries) {
    if (isTextBlock(entry.block)) {
      if (opts?.drawingOnly) continue
      if (opts?.textOnly === false) continue
      const tl = layoutRichText({
        blocks: [entry.block],
        maxW: rect.w,
        defaultFont: 'sans',
        baseFontSize: PAGE_DOC_FONT_SIZE,
        defaultColor: 'black',
        theme,
        align: 'left',
      })
      ctx.save()
      ctx.translate(0, entry.y)
      drawRichTextLayout(ctx, tl)
      ctx.restore()
    } else if (!opts?.textOnly && !opts?.skipDrawingIndices?.has(entry.index)) {
      drawDrawingBlockRegion(
        ctx,
        entry.block,
        entry.x,
        entry.y,
        entry.w,
        entry.h,
        theme,
        { showDivider: false },
      )
    }
  }
  if (opts?.showDrawingDivider) {
    drawInkZoneHintDivider(ctx, layout, theme, rect.w)
  }
  ctx.restore()
  return layout
}

export function documentBlockToDomHtml(block: DocumentBlock, index: number): string {
  if (isDrawingBlock(block)) {
    return `<div class="ic-drawing-slot" data-doc-index="${index}" contenteditable="false" aria-label="Drawing area"></div>`
  }
  const html = blocksToHtml([block])
  return html.replace(/^<\w+\s/, (open) => `${open}data-doc-index="${index}" `)
}

export function documentBlocksToDomHtml(blocks: DocumentBlock[]): string {
  return blocks.map((block, index) => documentBlockToDomHtml(block, index)).join('')
}

export function parseSingleBlockFromDom(
  child: HTMLElement,
  existing: DocumentBlock[],
): DocumentBlock | null {
  if (child.classList.contains('ic-drawing-slot')) {
    const idx = Number(child.dataset.docIndex)
    const prev = existing[idx]
    return prev && isDrawingBlock(prev) ? prev : emptyDrawingBlock()
  }
  if (child.dataset.block) {
    const tmp = document.createElement('div')
    tmp.appendChild(child.cloneNode(true))
    const parsed = htmlToBlocks(tmp)
    return parsed[0] ?? null
  }
  return null
}

export function parseDocumentBlocksFromDom(
  root: HTMLElement,
  existing: DocumentBlock[],
): DocumentBlock[] {
  const out: DocumentBlock[] = []
  for (const child of Array.from(root.children)) {
    if (child instanceof HTMLElement && child.classList.contains('ic-drawing-slot')) {
      const idx = Number(child.dataset.docIndex)
      const prev = existing[idx]
      out.push(prev && isDrawingBlock(prev) ? prev : emptyDrawingBlock())
      continue
    }
    if (child instanceof HTMLElement && child.dataset.block) {
      const tmp = document.createElement('div')
      tmp.appendChild(child.cloneNode(true))
      const parsed = htmlToBlocks(tmp)
      if (parsed[0]) out.push(parsed[0])
    }
  }
  return out.length ? validateDocumentBlocks(out) : [emptyParagraph()]
}
