import type { BlockType, InlineSpan, TextBlock } from './types.js'
import { mergeAdjacentSpans } from './document.js'

/** Apply line-start markdown when user presses Space at block start. */
export function applyLineMarkdown(lineText: string): { type: BlockType; text: string } | null {
  const t = lineText
  if (t === '#') return { type: 'heading1', text: '' }
  if (t === '##') return { type: 'heading2', text: '' }
  if (t === '###') return { type: 'heading3', text: '' }
  if (t === '-' || t === '*') return { type: 'bulletList', text: '' }
  const num = t.match(/^(\d+)\.$/)
  if (num) return { type: 'numberedList', text: '' }
  if (t === '```') return { type: 'codeBlock', text: '' }
  return null
}

/** Apply inline markdown patterns in a span's text (on space). */
export function applyInlineMarkdown(text: string): InlineSpan[] | null {
  let changed = false
  let out = text

  const patterns: { re: RegExp; apply: (m: RegExpMatchArray) => InlineSpan }[] = [
    {
      re: /\*\*([^*]+)\*\*(?=\s|$)/,
      apply: (m) => ({ text: m[1], bold: true }),
    },
    {
      re: /\*([^*]+)\*(?=\s|$)/,
      apply: (m) => ({ text: m[1], italic: true }),
    },
    {
      re: /_([^_]+)_(?=\s|$)/,
      apply: (m) => ({ text: m[1], italic: true }),
    },
    {
      re: /`([^`]+)`(?=\s|$)/,
      apply: (m) => ({ text: m[1], code: true }),
    },
  ]

  const spans: InlineSpan[] = []
  let remaining = out
  while (remaining.length) {
    let matched = false
    for (const { re, apply } of patterns) {
      const m = remaining.match(re)
      if (m && m.index !== undefined) {
        changed = true
        if (m.index > 0) spans.push({ text: remaining.slice(0, m.index) })
        spans.push(apply(m))
        remaining = remaining.slice(m.index + m[0].length)
        matched = true
        break
      }
    }
    if (!matched) {
      spans.push({ text: remaining })
      break
    }
  }
  return changed ? mergeAdjacentSpans(spans) : null
}

export function applyMarkdownToBlock(block: TextBlock): TextBlock {
  const content: InlineSpan[] = []
  for (const span of block.content) {
    const next = applyInlineMarkdown(span.text)
    if (next) content.push(...next)
    else content.push(span)
  }
  return { ...block, content: mergeAdjacentSpans(content) }
}
