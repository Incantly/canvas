export interface InkHit {
  blockIndex: number
  strokeIndex: number
}

/**
 * Pixel-erase commit: replace one committed stroke with its surviving
 * pieces (packed-triple arrays keeping the original color/size/pen/width).
 * Empty `pieces` removes the stroke entirely.
 */
export interface PixelEraseEdit {
  blockIndex: number
  strokeIndex: number
  pieces: number[][]
}

/** Board pixel-erase commit: surviving pieces of one draw/highlight shape. */
export interface PixelShapeEraseEdit {
  id: string
  pieces: number[][]
}
