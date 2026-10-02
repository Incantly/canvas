import type { ColorId, SizeId } from './types/base.js'

/** Ink stroke used by canvas renderers. It is not document content. */
export interface CanvasInkStroke {
  pts: number[]
  color: ColorId
  size: SizeId
  kind: 'draw' | 'highlight'
  pen?: string
  width?: number
}

/** @deprecated Compatibility alias for React Native canvas integrations. */
export type DrawingStroke = CanvasInkStroke

/** Internal transient grouping used by the legacy native canvas overlay only. */
export interface CanvasInkGroup {
  type: 'drawing'
  height: number
  strokes: CanvasInkStroke[]
}

/** @deprecated Compatibility alias; not part of the standalone document model. */
export type DocumentBlock = CanvasInkGroup

export const isDrawingBlock = (value: CanvasInkGroup | null | undefined): value is CanvasInkGroup =>
  value?.type === 'drawing'
