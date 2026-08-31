import type { ColorId, FontId, SizeId } from '../types/base.js'
import type { InlineSpan, TextBlock, BlockType } from './types.js'

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
  if (s.font === 'draw' || s.font === 'sans' || s.font === 'serif' || s.font === 'mono')
    span.font = s.font
  if (typeof s.fontSize === 'number' && Number.isFinite(s.fontSize) && s.fontSize > 0)
    span.fontSize = s.fontSize
  if (typeof s.color === 'string') span.color = s.color as ColorId
  if (s.link && typeof s.link === 'object') {
    const href = (s.link as { href?: unknown }).href
    if (typeof href === 'string' && href.length > 0) {
      span.link = { href }
      const title = (s.link as { title?: unknown }).title
      if (typeof title === 'string') span.link.title = title
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
    color: (props.color as ColorId) || 'black',
    size: (props.size as SizeId) || 'm',
    font: (props.font as FontId) || 'sans',
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
