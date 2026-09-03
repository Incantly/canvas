import type { DocumentBlock, TextBlock } from './types.js'
import { isDrawingBlock, isImageBlock, isTextBlock } from './types.js'
import { validateDocumentBlocks } from '../page-document-blocks.js'
import { textBlockToMarkdown, markdownToTextBlock } from './markdown-serialize.js'
import { validateBlocks } from './document.js'

/**
 * Serialize page text blocks to one markdown document (paragraphs separated by blank lines).
 * Drawing / image blocks are omitted — re-merge with {@link mergeMarkdownIntoPageDocument}.
 */
export function pageTextBlocksToMarkdown(blocks: DocumentBlock[]): string {
  const textBlocks = blocks.filter(isTextBlock)
  if (!textBlocks.length) return ''
  return textBlocks.map(textBlockToMarkdown).join('\n\n')
}

/**
 * Parse a page markdown document into text blocks.
 * Blank-line separated chunks become separate blocks.
 */
export function markdownToPageTextBlocks(md: string): TextBlock[] {
  const normalized = String(md ?? '').replace(/\r\n/g, '\n')
  if (!normalized.trim()) {
    return validateBlocks([{ type: 'paragraph', content: [{ text: '' }] }])
  }
  const chunks = normalized.split(/\n{2,}/)
  const blocks: TextBlock[] = []
  for (const chunk of chunks) {
    const trimmed = chunk.trimEnd()
    if (!trimmed.trim()) continue
    blocks.push(markdownToTextBlock(trimmed))
  }
  return validateBlocks(blocks.length ? blocks : [{ type: 'paragraph', content: [{ text: '' }] }])
}

/**
 * Replace text blocks in a page document with markdown-parsed text,
 * preserving drawing / image blocks (appended after text — trailing ink pattern).
 */
export function mergeMarkdownIntoPageDocument(
  existing: DocumentBlock[],
  markdown: string,
): DocumentBlock[] {
  const textBlocks = markdownToPageTextBlocks(markdown)
  const nonText = existing.filter((b) => isDrawingBlock(b) || isImageBlock(b))
  return validateDocumentBlocks([...textBlocks, ...nonText])
}

export type PageInlineMark = 'bold' | 'italic' | 'underline' | 'strikethrough' | 'code'

/** Concatenate page text with a single newline between blocks (TextInput fallback). */
export function pageTextBlocksToPlainLines(blocks: DocumentBlock[]): string {
  return blocks.filter(isTextBlock).map((b) => b.content.map((s) => s.text).join('')).join('\n')
}

/**
 * Toggle an inline mark on [start, end) in the newline-joined plain text of the page.
 */
export function applyInlineMarkToPageRange(
  existing: DocumentBlock[],
  start: number,
  end: number,
  mark: PageInlineMark,
): DocumentBlock[] {
  const textBlocks = existing.filter(isTextBlock)
  const nonText = existing.filter((b) => isDrawingBlock(b) || isImageBlock(b))
  if (!textBlocks.length || end <= start) {
    return validateDocumentBlocks(existing)
  }
  let offset = 0
  const nextText: TextBlock[] = []
  for (let i = 0; i < textBlocks.length; i++) {
    const block = textBlocks[i]!
    const len = block.content.reduce((n, s) => n + s.text.length, 0)
    const blockStart = offset
    const blockEnd = offset + len
    offset = blockEnd + 1 // newline between blocks
    if (end <= blockStart || start >= blockEnd) {
      nextText.push(block)
      continue
    }
    const localStart = Math.max(0, start - blockStart)
    const localEnd = Math.min(len, end - blockStart)
    nextText.push(toggleMarkOnBlockRange(block, localStart, localEnd, mark))
  }
  return validateDocumentBlocks([...nextText, ...nonText])
}

function toggleMarkOnBlockRange(
  block: TextBlock,
  start: number,
  end: number,
  mark: PageInlineMark,
): TextBlock {
  if (end <= start) return block
  const spans = block.content
  const allOn = rangeHasMark(spans, start, end, mark)
  const nextOn = !allOn
  const out: typeof spans = []
  let i = 0
  for (const span of spans) {
    const from = i
    const to = i + span.text.length
    i = to
    if (to <= start || from >= end) {
      out.push({ ...span })
      continue
    }
    if (from < start) {
      out.push({ ...span, text: span.text.slice(0, start - from) })
    }
    const midFrom = Math.max(0, start - from)
    const midTo = Math.min(span.text.length, end - from)
    if (midTo > midFrom) {
      const mid = { ...span, text: span.text.slice(midFrom, midTo) }
      applyMark(mid, mark, nextOn)
      out.push(mid)
    }
    if (to > end) {
      out.push({ ...span, text: span.text.slice(end - from) })
    }
  }
  return { ...block, content: out.length ? out : [{ text: '' }] }
}

function rangeHasMark(
  spans: { text: string; bold?: boolean; italic?: boolean; underline?: boolean; strikethrough?: boolean; code?: boolean }[],
  start: number,
  end: number,
  mark: PageInlineMark,
): boolean {
  let i = 0
  let saw = false
  for (const span of spans) {
    const from = i
    const to = i + span.text.length
    i = to
    if (to <= start || from >= end || !span.text) continue
    saw = true
    if (!spanHasMark(span, mark)) return false
  }
  return saw
}

function spanHasMark(
  span: { bold?: boolean; italic?: boolean; underline?: boolean; strikethrough?: boolean; code?: boolean },
  mark: PageInlineMark,
): boolean {
  return !!span[mark]
}

function applyMark(
  span: { bold?: boolean; italic?: boolean; underline?: boolean; strikethrough?: boolean; code?: boolean },
  mark: PageInlineMark,
  on: boolean,
): void {
  if (on) span[mark] = true
  else delete span[mark]
}
