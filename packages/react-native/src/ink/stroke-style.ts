import type { SizeId } from '@incantly/core/headless'
import { inkBaseWidthPaper, type InkPenStyle } from '@incantly/core/headless'

/** Paper-space stroke width — matches web document ink unless the host pen overrides `widthScale`. */
export function inkStrokeWidthPaper(
  size: SizeId,
  kind: 'draw' | 'highlight',
  style?: InkPenStyle,
  width?: number,
): number {
  return inkBaseWidthPaper(size, style ?? { kind }, width)
}
