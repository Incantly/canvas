import { citationId } from './ids.js'
import type { InlineNode, TextMark, TextMarkType } from './types.js'

export const TEXT_MARK_ORDER: readonly TextMarkType[] = [
  'bold', 'italic', 'underline', 'strike', 'code', 'link', 'textColor',
  'highlight', 'citation', 'inlineMath',
]
export const ALLOWED_LINK_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:'] as const

const markOrder = new Map(TEXT_MARK_ORDER.map((type, index) => [type, index]))
const exclusiveMarks = new Set<TextMarkType>(['code', 'inlineMath'])

/** Code and inline math are atomic styles; all other distinct marks can coexist. */
export function canCombineTextMarks(left: TextMarkType, right: TextMarkType): boolean {
  if (left === right) return false
  return !exclusiveMarks.has(left) && !exclusiveMarks.has(right)
}

export function normalizeLinkHref(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const href = value.trim()
  if (!href) return null
  if (/^(?:#|\/|\.\/|\.\.\/)/.test(href)) return href
  try {
    const url = new URL(href)
    return (ALLOWED_LINK_PROTOCOLS as readonly string[]).includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

function normalizeMark(value: unknown): TextMark | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  switch (record.type) {
    case 'bold': case 'italic': case 'underline': case 'strike': case 'code':
      return { type: record.type }
    case 'link': {
      const href = normalizeLinkHref(record.href)
      if (!href) return null
      const title = typeof record.title === 'string' ? record.title.trim() : ''
      return { type: 'link', href, ...(title ? { title } : {}) }
    }
    case 'textColor': case 'highlight': {
      const color = typeof record.color === 'string' ? record.color.trim() : ''
      return color ? { type: record.type, color } : null
    }
    case 'citation': {
      const id = typeof record.citationId === 'string' ? record.citationId.trim() : ''
      return id ? { type: 'citation', citationId: citationId(id) } : null
    }
    case 'inlineMath': {
      const latex = typeof record.latex === 'string' ? record.latex.trim() : ''
      return latex ? { type: 'inlineMath', latex } : null
    }
    default:
      return null
  }
}

/** Drops malformed/unknown marks, deduplicates them, and produces canonical ordering. */
export function normalizeTextMarks(value: unknown): TextMark[] {
  if (!Array.isArray(value)) return []
  const normalized: TextMark[] = []
  const seen = new Set<TextMarkType>()
  for (const candidate of value) {
    const mark = normalizeMark(candidate)
    if (!mark || seen.has(mark.type)) continue
    if (exclusiveMarks.has(mark.type)) return [mark]
    if (normalized.some((existing) => !canCombineTextMarks(existing.type, mark.type))) continue
    normalized.push(mark)
    seen.add(mark.type)
  }
  return normalized.sort((a, b) => (markOrder.get(a.type) ?? 0) - (markOrder.get(b.type) ?? 0))
}

const marksEqual = (a: TextMark[] | undefined, b: TextMark[] | undefined): boolean =>
  JSON.stringify(a ?? []) === JSON.stringify(b ?? [])

/** Normalizes inline nodes and coalesces adjacent text carrying identical marks. */
export function normalizeInlineContent(value: unknown): InlineNode[] {
  if (!Array.isArray(value)) return []
  const output: InlineNode[] = []
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue
    const record = candidate as Record<string, unknown>
    if (record.type === 'hardBreak') {
      output.push({ type: 'hardBreak' })
      continue
    }
    if (record.type !== 'text' || typeof record.text !== 'string' || !record.text) continue
    const marks = normalizeTextMarks(record.marks)
    const next = { type: 'text' as const, text: record.text, ...(marks.length ? { marks } : {}) }
    const previous = output[output.length - 1]
    if (previous?.type === 'text' && marksEqual(previous.marks, next.marks)) previous.text += next.text
    else output.push(next)
  }
  return output
}

export const inlineContentToPlainText = (content: readonly InlineNode[]): string =>
  content.map((node) => node.type === 'hardBreak' ? '\n' : node.text).join('')
