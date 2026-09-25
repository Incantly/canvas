import type { ColorId, FontId } from './types/base.js'

/** Lightweight structured text used only by positioned canvas text shapes. */
export type CanvasTextBlockType =
  | 'paragraph' | 'heading1' | 'heading2' | 'heading3' | 'bulletList'
  | 'numberedList' | 'codeBlock' | 'quote' | 'divider'

export interface CanvasTextLink { href: string; title?: string }
export interface CanvasTextSpan {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  code?: boolean
  link?: CanvasTextLink
  font?: FontId
  fontSize?: number
  color?: ColorId
}

export interface CanvasTextBlock {
  type: CanvasTextBlockType
  content: CanvasTextSpan[]
  indent?: number
}

/** @deprecated Compatibility alias for canvas text-shape integrations. */
export type TextBlock = CanvasTextBlock
/** @deprecated Compatibility alias for canvas text-shape integrations. */
export type InlineSpan = CanvasTextSpan
/** @deprecated Compatibility alias for canvas text-shape integrations. */
export type BlockType = CanvasTextBlockType

export const emptyCanvasText = (): CanvasTextBlock[] => [{ type: 'paragraph', content: [] }]

export function textToBlocks(text: string): CanvasTextBlock[] {
  const lines = String(text ?? '').split('\n')
  return lines.map((line) => ({
    type: 'paragraph',
    content: line ? [{ text: line }] : [],
  }))
}

export function blocksToPlainText(blocks: readonly CanvasTextBlock[]): string {
  return blocks.map((block) => block.content.map((span) => span.text).join('')).join('\n')
}

export function getShapeBlocks(props: Record<string, unknown>): CanvasTextBlock[] {
  if (Array.isArray(props.blocks)) return props.blocks as CanvasTextBlock[]
  if (typeof props.text === 'string') return textToBlocks(props.text)
  return emptyCanvasText()
}

export function migrateCanvasTextProps(props: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(props.blocks)) return props
  return { ...props, blocks: textToBlocks(typeof props.text === 'string' ? props.text : '') }
}
