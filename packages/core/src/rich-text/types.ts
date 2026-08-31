import type { ColorId, FontId, SizeId } from '../types/base.js'

export type BlockType =
  | 'paragraph'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'bulletList'
  | 'numberedList'
  | 'codeBlock'
  | 'quote'
  | 'divider'

export interface RichTextLink {
  href: string
  title?: string
}

export interface InlineSpan {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  code?: boolean
  link?: RichTextLink
  font?: FontId
  fontSize?: number
  color?: ColorId
}

/** One block per list item; consecutive list blocks form a list. */
export interface TextBlock {
  type: BlockType
  content: InlineSpan[]
  indent?: number
}

/** Ink strokes confined to a document-flow region (Apple Notes style). */
export interface DrawingStroke {
  pts: number[]
  color: ColorId
  size: SizeId
  kind: 'draw' | 'highlight'
}

export interface DrawingBlock {
  type: 'drawing'
  /** Minimum block height in page-local px (grows with stroke bounds). */
  height: number
  strokes: DrawingStroke[]
}

/** Inline image block in the notes document flow. */
export interface ImageBlock {
  type: 'image'
  src: string
  alt?: string
  width?: number
  height?: number
}

export type DocumentBlock = TextBlock | DrawingBlock | ImageBlock

export function isDrawingBlock(b: DocumentBlock): b is DrawingBlock {
  return b.type === 'drawing'
}

export function isImageBlock(b: DocumentBlock): b is ImageBlock {
  return b.type === 'image'
}

export function isTextBlock(b: DocumentBlock): b is TextBlock {
  return b.type !== 'drawing' && b.type !== 'image'
}

export interface RichTextDocument {
  blocks: TextBlock[]
}
