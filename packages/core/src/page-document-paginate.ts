import type { PageRecord } from './types/models.js'
import type { DiffSource } from './types/operations.js'
import type { DocumentBlock, InlineSpan, TextBlock } from './rich-text/types.js'
import { isDrawingBlock, isImageBlock, isTextBlock } from './rich-text/types.js'
import { emptyParagraph } from './rich-text/document.js'
import { imageBlockHeight, validateDocumentBlocks } from './page-document-blocks.js'
import { PAGE_DOC_FONT_SIZE, pageContentRect } from './page-document-layout.js'
import type { CreatePageOpts } from './pages.js'
import { inferPaperSizeId } from './pages.js'

const BLOCK_GAP = 4
/** Slightly wide vs canvas so RN TextInput (≈0.55–0.6em) overflows before the sheet clips. */
const CHAR_WIDTH_FACTOR = 0.58
const LINE_HEIGHT_FACTOR = 1.45

const BLOCK_SCALE: Record<TextBlock['type'], number> = {
  paragraph: 1,
  heading1: 2,
  heading2: 1.5,
  heading3: 1.25,
  bulletList: 1,
  numberedList: 1,
  codeBlock: 0.92,
  quote: 1,
  divider: 1,
}

export interface SplitPageResult {
  fitting: DocumentBlock[]
  overflow: DocumentBlock[]
}

/** Store surface used by overflow reflow (avoids a circular editor import). */
export interface OverflowStore {
  page(id: string): PageRecord | null
  pages(): PageRecord[]
  pageDocumentBlocks(pageId: string): DocumentBlock[]
  setPageDocument(pageId: string, blocks: DocumentBlock[], source?: DiffSource): void
  addPage(opts?: CreatePageOpts, source?: DiffSource): PageRecord
  insertPageAfter?(afterId: string, opts?: CreatePageOpts, source?: DiffSource): PageRecord
}

export function textBlockPlainLength(block: TextBlock): number {
  let n = 0
  for (const span of block.content) n += span.text.length
  return n
}

export function sliceTextBlock(block: TextBlock, start: number, end: number): TextBlock {
  const total = textBlockPlainLength(block)
  const a = Math.max(0, Math.min(start, total))
  const b = Math.max(a, Math.min(end, total))
  return { ...block, content: sliceSpans(block.content, a, b) }
}

function sliceSpans(content: InlineSpan[], start: number, end: number): InlineSpan[] {
  const out: InlineSpan[] = []
  let i = 0
  for (const span of content) {
    const from = i
    const to = i + span.text.length
    i = to
    if (to <= start || from >= end) continue
    const sliceFrom = Math.max(0, start - from)
    const sliceTo = Math.min(span.text.length, end - from)
    if (sliceTo > sliceFrom) out.push({ ...span, text: span.text.slice(sliceFrom, sliceTo) })
  }
  return out.length ? out : [{ text: '' }]
}

function wrapLineCount(text: string, cols: number): number {
  if (!text) return 1
  const paragraphs = text.split('\n')
  let lines = 0
  for (const para of paragraphs) {
    if (!para) {
      lines += 1
      continue
    }
    const words = para.split(/(\s+)/)
    let col = 0
    let paraLines = 1
    for (const word of words) {
      const w = word.length
      if (col + w > cols && col > 0) {
        paraLines += 1
        col = w
      } else {
        col += w
      }
    }
    lines += Math.max(1, paraLines)
  }
  return Math.max(1, lines)
}

export function estimateTextBlockHeight(block: TextBlock, contentW: number): number {
  if (block.type === 'divider') return Math.max(16, PAGE_DOC_FONT_SIZE)
  const scale = BLOCK_SCALE[block.type] ?? 1
  const fontSize = PAGE_DOC_FONT_SIZE * scale
  const lineH = Math.max(PAGE_DOC_FONT_SIZE * LINE_HEIGHT_FACTOR, fontSize * LINE_HEIGHT_FACTOR)
  const cols = Math.max(8, Math.floor(contentW / Math.max(4, fontSize * CHAR_WIDTH_FACTOR)))
  const text = block.content.map((s) => s.text).join('')
  return wrapLineCount(text, cols) * lineH
}

export function estimateBlockHeight(block: DocumentBlock, contentW: number): number {
  if (isDrawingBlock(block)) return 0
  if (isImageBlock(block)) return imageBlockHeight(block, contentW)
  return estimateTextBlockHeight(block, contentW)
}

export function estimateDocumentHeight(blocks: DocumentBlock[], contentW: number): number {
  let y = 0
  for (const block of blocks) {
    const h = estimateBlockHeight(block, contentW)
    if (h <= 0) continue
    y += h + BLOCK_GAP
  }
  return y
}

export function isVisuallyEmptyPage(blocks: DocumentBlock[]): boolean {
  return blocks.every((b) => {
    if (isDrawingBlock(b)) return true
    if (isImageBlock(b)) return false
    if (isTextBlock(b)) return !b.content.some((s) => s.text.replace(/\u200b/g, '').trim())
    return true
  })
}

export function isOverflowEmpty(blocks: DocumentBlock[]): boolean {
  return blocks.every((b) => {
    if (isDrawingBlock(b)) return true
    if (isImageBlock(b)) return false
    if (isTextBlock(b)) return !b.content.some((s) => s.text.replace(/\u200b/g, '').trim())
    return true
  })
}

function ensureWritable(blocks: DocumentBlock[]): DocumentBlock[] {
  const validated = validateDocumentBlocks(blocks)
  if (validated.some(isTextBlock)) return validated
  const drawing = validated.filter(isDrawingBlock)
  const images = validated.filter(isImageBlock)
  return validateDocumentBlocks([emptyParagraph(), ...images, ...drawing])
}

function splitTextBlockAtHeight(
  block: TextBlock,
  contentW: number,
  maxH: number,
): { head: TextBlock | null; tail: TextBlock | null } {
  const fullH = estimateTextBlockHeight(block, contentW)
  if (fullH <= maxH) return { head: block, tail: null }
  const total = textBlockPlainLength(block)
  if (total <= 1) return { head: null, tail: block }

  let lo = 0
  let hi = total
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    const trial = sliceTextBlock(block, 0, mid)
    if (estimateTextBlockHeight(trial, contentW) <= maxH) lo = mid
    else hi = mid - 1
  }
  if (lo <= 0) return { head: null, tail: block }

  const plain = block.content.map((s) => s.text).join('')
  let cut = lo
  const space = plain.lastIndexOf(' ', lo)
  if (space >= Math.floor(lo * 0.4)) cut = space + 1
  if (cut <= 0) cut = lo

  return {
    head: sliceTextBlock(block, 0, cut),
    tail: { type: 'paragraph', content: sliceSpans(block.content, cut, total) },
  }
}

/**
 * Keep blocks that fit in the content box; remainder becomes overflow.
 * Drawings stay on the current page (page-absolute ink).
 * A single tall paragraph is split mid-text at a word boundary when possible.
 */
export function splitBlocksToFitContent(
  blocks: DocumentBlock[],
  contentW: number,
  contentH: number,
): SplitPageResult {
  const fitting: DocumentBlock[] = []
  const overflow: DocumentBlock[] = []
  const minLine = PAGE_DOC_FONT_SIZE * LINE_HEIGHT_FACTOR
  const maxH = Math.max(minLine, contentH)
  let used = 0

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!
    if (isDrawingBlock(block)) {
      fitting.push(block)
      continue
    }
    const h = estimateBlockHeight(block, contentW) + BLOCK_GAP
    const remaining = maxH - used
    if (used + h <= maxH + 0.5) {
      fitting.push(block)
      used += h
      continue
    }
    if (isTextBlock(block) && remaining >= minLine) {
      const split = splitTextBlockAtHeight(block, contentW, remaining)
      if (split.head && textBlockPlainLength(split.head) > 0) {
        fitting.push(split.head)
        if (split.tail) overflow.push(split.tail)
        overflow.push(...blocks.slice(i + 1).filter((b) => !isDrawingBlock(b)))
        for (const rest of blocks.slice(i + 1)) {
          if (isDrawingBlock(rest)) fitting.push(rest)
        }
        return { fitting: ensureWritable(fitting), overflow }
      }
    }
    overflow.push(block)
    overflow.push(...blocks.slice(i + 1).filter((b) => !isDrawingBlock(b)))
    for (const rest of blocks.slice(i + 1)) {
      if (isDrawingBlock(rest)) fitting.push(rest)
    }
    break
  }

  return { fitting: ensureWritable(fitting), overflow }
}

/** Split a block list into sequential page-sized chunks (no drawings in extra pages). */
export function paginateBlocks(
  blocks: DocumentBlock[],
  contentW: number,
  contentH: number,
): DocumentBlock[][] {
  const pages: DocumentBlock[][] = []
  let rest: DocumentBlock[] = blocks.filter((b) => !isDrawingBlock(b))
  let guard = 0
  while (rest.length && guard < 64) {
    guard += 1
    const { fitting, overflow } = splitBlocksToFitContent(rest, contentW, contentH)
    const textFit = fitting.filter((b) => !isDrawingBlock(b))
    if (!textFit.length && isOverflowEmpty(overflow)) break
    if (!textFit.length && overflow.length) {
      // Nothing fit — force first block onto its own page to avoid a loop.
      pages.push(ensureWritable([overflow[0]!]))
      rest = overflow.slice(1)
      continue
    }
    pages.push(ensureWritable(textFit))
    if (isOverflowEmpty(overflow)) break
    rest = overflow
  }
  return pages
}

export interface PageOverflowPlan {
  current: DocumentBlock[]
  /** Existing next page was empty — write overflow here. */
  next?: DocumentBlock[]
  /** New pages to insert immediately after the current page. */
  extraPages: DocumentBlock[][]
  changed: boolean
}

export function planPageOverflow(
  current: DocumentBlock[],
  contentW: number,
  contentH: number,
  nextPage: DocumentBlock[] | null,
): PageOverflowPlan {
  const { fitting, overflow } = splitBlocksToFitContent(current, contentW, contentH)
  if (isOverflowEmpty(overflow)) {
    const same = documentBlocksEqual(fitting, current)
    return { current: fitting, extraPages: [], changed: !same }
  }
  // One continuation sheet per overflow. A later write can split that page
  // if it is still over-full — avoids creating a stack of pages at once.
  if (nextPage && isVisuallyEmptyPage(nextPage)) {
    const drawings = nextPage.filter(isDrawingBlock)
    return {
      current: fitting,
      next: validateDocumentBlocks([...overflow, ...drawings]),
      extraPages: [],
      changed: true,
    }
  }
  return { current: fitting, extraPages: [overflow], changed: true }
}

function documentBlocksEqual(a: DocumentBlock[], b: DocumentBlock[]): boolean {
  if (a.length !== b.length) return false
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

export interface ApplyOverflowResult {
  changed: boolean
  createdPageIds: string[]
  /** First page that received leftover text (existing next page or a newly inserted one). */
  overflowPageId?: string
}

export interface ApplyOverflowOptions {
  /**
   * Extra bottom inset in page coordinates (e.g. format bar).
   * Shrinks the usable content height before splitting.
   */
  contentInsetBottom?: number
  /** Override content height (page coords). Takes precedence over the page rect. */
  maxContentHeight?: number
}

/**
 * Trim `pageId` to its paper content box and continue leftover text on the
 * next empty page, or insert new page(s) after it.
 */
export function applyPageDocumentOverflow(
  store: OverflowStore,
  pageId: string,
  source: DiffSource = 'user',
  opts: ApplyOverflowOptions = {},
): ApplyOverflowResult {
  const page = store.page(pageId)
  if (!page) return { changed: false, createdPageIds: [] }
  const pages = store.pages()
  const idx = pages.findIndex((p) => p.id === pageId)
  if (idx < 0) return { changed: false, createdPageIds: [] }

  const rect = pageContentRect(page)
  const inset = Math.max(0, opts.contentInsetBottom ?? 0)
  const contentH = Math.max(
    80,
    opts.maxContentHeight ?? rect.h - inset,
  )
  const nextRec = pages[idx + 1] ?? null
  const plan = planPageOverflow(
    store.pageDocumentBlocks(pageId),
    rect.w,
    contentH,
    nextRec ? store.pageDocumentBlocks(nextRec.id) : null,
  )
  if (!plan.changed) return { changed: false, createdPageIds: [] }

  store.setPageDocument(pageId, plan.current, source)
  const createdPageIds: string[] = []
  let afterId = pageId
  let overflowPageId: string | undefined

  if (plan.next && nextRec) {
    store.setPageDocument(nextRec.id, plan.next, source)
    afterId = nextRec.id
    overflowPageId = nextRec.id
  }

  const paperSize = inferPaperSizeId(page.width, page.height) ?? undefined
  for (const blocks of plan.extraPages) {
    const created = store.insertPageAfter
      ? store.insertPageAfter(afterId, { paperSize, paperStyle: page.paperStyle }, source)
      : store.addPage({ paperSize, paperStyle: page.paperStyle }, source)
    store.setPageDocument(created.id, blocks, source)
    createdPageIds.push(created.id)
    if (!overflowPageId) overflowPageId = created.id
    afterId = created.id
  }

  return { changed: true, createdPageIds, overflowPageId }
}
