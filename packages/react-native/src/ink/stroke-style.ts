import type { SizeId } from '@incantly/canvas/headless'
import { inkBaseWidthPaper, type InkPenStyle } from '@incantly/canvas/headless'

/** Paper-space stroke width — matches web document ink unless the host pen overrides `widthScale`. */
export function inkStrokeWidthPaper(size: SizeId, kind: 'draw' | 'highlight', style?: InkPenStyle): number {
  return inkBaseWidthPaper(size, style ?? { kind })
}
