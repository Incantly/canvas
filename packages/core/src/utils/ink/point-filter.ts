export interface Point2 {
  x: number
  y: number
}

export interface Point3 extends Point2 {
  pressure: number
}

/** Returns true when the next point is far enough from the last to record. */
export function shouldAppendPoint(last: Point2, next: Point3, minDist: number): boolean {
  const dx = next.x - last.x
  const dy = next.y - last.y
  const minSq = minDist * minDist
  return dx * dx + dy * dy >= minSq
}

/** Default min distance for document ink (matches web editor ~1.25 / zoom at z=1). */
export const DEFAULT_INK_MIN_DIST = 1.25
