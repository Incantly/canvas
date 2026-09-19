import type { ColorId, FontId, SizeId } from '../types/base.js'
import type { InlineSpan, TextBlock, BlockType } from './types.js'
import { COLOR_IDS, FONT_IDS, SIZE_IDS } from '../palette.js'

const COLOR_SET = new Set<string>(COLOR_IDS)
const FONT_SET = new Set<string>(FONT_IDS)
const SIZE_SET = new Set<string>(SIZE_IDS)

/** Inline font sizes are clamped to prevent layout blowup from hostile snapshots. */
export const MAX_INLINE_FONT_SIZE = 256
export const MIN_INLINE_FONT_SIZE = 1

/** Link schemes that may appear in rich-text snapshots. Everything else is dropped. */
export const ALLOWED_LINK_SCHEMES: readonly string[] = ['http:', 'https:', 'mailto:', 'tel:']

export function sanitizeColorId(v: unknown): ColorId | undefined {
  return typeof v === 'string' && COLOR_SET.has(v) ? (v as ColorId) : undefined
}

export function sanitizeFontId(v: unknown): FontId | undefined {
  return typeof v === 'string' && FONT_SET.has(v) ? (v as FontId) : undefined
}

export function sanitizeSizeId(v: unknown): SizeId | undefined {
  return typeof v === 'string' && SIZE_SET.has(v) ? (v as SizeId) : undefined
}

export function sanitizeFontSize(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined
  if (v < MIN_INLINE_FONT_SIZE || v > MAX_INLINE_FONT_SIZE) return undefined
  return v
}

function schemeOf(href: string): string | null {
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(href)
  return m ? m[1]!.toLowerCase() + ':' : null
}

export function sanitizeLinkHref(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const href = v.trim()
  if (!href || href.length > 4096) return null
  // Disallow control characters and embedded whitespace that browsers may normalize.
  if (/[\u0000-\u0020\u007f]/.test(href) && !/^mailto:/i.test(href) && !/^tel:/i.test(href)) {
    // mailto:/tel: may legitimately contain no spaces; any control char rejects.
    // For http(s) also reject. Relative URLs with spaces are rejected too.
    return null
  }
  const scheme = schemeOf(href)
  if (scheme) {
    return (ALLOWED_LINK_SCHEMES as readonly string[]).includes(scheme) ? href : null
  }
  // Relative URL, fragment, or absolute path without a scheme — safe as long as
  // it does not start a scriptable scheme with leading whitespace/control chars.
  if (/^(\/|#|\?|[A-Za-z0-9._~%+-])/.test(href)) return href
  return null
}

export function sanitizeLinkTitle(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.slice(0, 500)
  if (!t) return undefined
  return t
}

/** Image sources may additionally be inline data images or blob URLs. */
export function sanitizeImageSrc(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const src = v.trim()
  if (!src || src.length > 20_000_000) return null
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(src)) return null
  if (/^data:image\//i.test(src)) return src
  if (/^blob:/i.test(src)) return src
  const scheme = schemeOf(src)
  if (scheme) {
    return scheme === 'http:' || scheme === 'https:' ? src : null
  }
  if (/^(\/|#|\?|[A-Za-z0-9._~%+-])/.test(src)) return src
  return null
}

export function sanitizeImageAlt(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const alt = v.slice(0, 500)
  return alt ? alt : undefined
}

export function sanitizeImageDimension(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined
  if (v <= 0 || v > 10000) return undefined
  return v
}

const BLOCK_TYPES: readonly BlockType[] = [
  'paragraph',
  'heading1',
  'heading2',
  'heading3',
  'bulletList',
  'numberedList',
  'codeBlock',
  'quote',
  'divider',
]

export function isBlockType(v: unknown): v is BlockType {
  return typeof v === 'string' && (BLOCK_TYPES as readonly string[]).includes(v)
}

export function emptyParagraph(): TextBlock {
  return { type: 'paragraph', content: [{ text: '' }] }
}

export function emptyDocument(): TextBlock[] {
  return [emptyParagraph()]
}

export function textToBlocks(text: string): TextBlock[] {
  const lines = String(text ?? '').split('\n')
  if (!lines.length) return emptyDocument()
  return lines.map((line) => ({
    type: 'paragraph' as const,
    content: [{ text: line }],
  }))
}

export function blocksToPlainText(blocks: TextBlock[]): string {
  return blocks
    .map((b) => b.content.map((s) => s.text).join(''))
    .join('\n')
    .replace(/\u200b/g, '')
}

export function isEmptyDocument(blocks: TextBlock[] | undefined): boolean {
  if (!blocks?.length) return true
  return blocks.every((b) =>
    b.content.every((s) => !String(s.text ?? '').replace(/\u200b/g, '').trim())
  )
}

function normalizeSpan(raw: unknown): InlineSpan | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Record<string, unknown>
  if (typeof s.text !== 'string') return null
  const span: InlineSpan = { text: s.text }
  if (s.bold === true) span.bold = true
  if (s.italic === true) span.italic = true
  if (s.underline === true) span.underline = true
  if (s.strikethrough === true) span.strikethrough = true
  if (s.code === true) span.code = true
  const font = sanitizeFontId(s.font)
  if (font) span.font = font
  const fontSize = sanitizeFontSize(s.fontSize)
  if (fontSize !== undefined) span.fontSize = fontSize
  const color = sanitizeColorId(s.color)
  if (color) span.color = color
  if (s.link && typeof s.link === 'object') {
    const href = sanitizeLinkHref((s.link as { href?: unknown }).href)
    if (href) {
      span.link = { href }
      const title = sanitizeLinkTitle((s.link as { title?: unknown }).title)
      if (title !== undefined) span.link.title = title
    }
  }
  return span
}

export function mergeAdjacentSpans(content: InlineSpan[]): InlineSpan[] {
  const out: InlineSpan[] = []
  for (const span of content) {
    if (!span.text) continue
    const prev = out[out.length - 1]
    if (prev && spansEqualStyle(prev, span)) {
      prev.text += span.text
    } else {
      out.push({ ...span })
    }
  }
  return out.length ? out : [{ text: '' }]
}

function spansEqualStyle(a: InlineSpan, b: InlineSpan): boolean {
  return (
    !!a.bold === !!b.bold &&
    !!a.italic === !!b.italic &&
    !!a.underline === !!b.underline &&
    !!a.strikethrough === !!b.strikethrough &&
    !!a.code === !!b.code &&
    a.font === b.font &&
    a.fontSize === b.fontSize &&
    a.color === b.color &&
    JSON.stringify(a.link) === JSON.stringify(b.link)
  )
}

export function validateBlocks(raw: unknown): TextBlock[] {
  if (!Array.isArray(raw) || !raw.length) return emptyDocument()
  const blocks: TextBlock[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const b = item as Record<string, unknown>
    if (!isBlockType(b.type)) continue
    const contentRaw = Array.isArray(b.content) ? b.content : []
    const content = mergeAdjacentSpans(
      contentRaw.map(normalizeSpan).filter((s): s is InlineSpan => s !== null)
    )
    const block: TextBlock = {
      type: b.type,
      content: content.length ? content : [{ text: '' }],
    }
    if (typeof b.indent === 'number' && b.indent >= 0) block.indent = Math.floor(b.indent)
    blocks.push(block)
  }
  return blocks.length ? blocks : emptyDocument()
}

export interface RichTextShapeFields {
  blocks: TextBlock[]
  color: ColorId
  size: SizeId
  font: FontId
  autosize?: boolean
  scale?: number
  w?: number
  align?: 'left' | 'center' | 'right'
}

export function migrateTextProps(props: Record<string, unknown>): RichTextShapeFields {
  const blocks =
    props.blocks !== undefined
      ? validateBlocks(props.blocks)
      : textToBlocks(typeof props.text === 'string' ? props.text : '')
  const next: RichTextShapeFields = {
    blocks,
    color: sanitizeColorId(props.color) ?? 'black',
    size: sanitizeSizeId(props.size) ?? 'm',
    font: sanitizeFontId(props.font) ?? 'sans',
  }
  if (props.autosize === false) next.autosize = false
  if (typeof props.scale === 'number') next.scale = props.scale
  if (typeof props.w === 'number') next.w = props.w
  const align = props.align
  if (align === 'left' || align === 'center' || align === 'right') next.align = align
  else if (align === 'middle') next.align = 'center'
  else if (align === 'end') next.align = 'right'
  else if (align === 'start') next.align = 'left'
  return next
}

export function normalizeTextProps(props: Record<string, unknown>): RichTextShapeFields {
  if (props.blocks !== undefined) {
    return migrateTextProps(props)
  }
  if (typeof props.text === 'string') {
    return migrateTextProps(props)
  }
  return migrateTextProps({ ...props, text: '' })
}

export function getShapeBlocks(props: Record<string, unknown>): TextBlock[] {
  return normalizeTextProps(props).blocks
}
