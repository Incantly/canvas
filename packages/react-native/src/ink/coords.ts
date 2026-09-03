/** Map overlay-local screen px to page-absolute paper coords (same as web `_paperPointFromPage`). */
export function screenToPaper(
  locationX: number,
  locationY: number,
  zoom: number,
  paperW: number,
  paperH: number,
): { x: number; y: number } | null {
  if (!Number.isFinite(locationX) || !Number.isFinite(locationY)) return null
  const z = Math.max(0.01, zoom)
  const x = locationX / z
  const y = locationY / z
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  if (x < 0 || y < 0 || x > paperW || y > paperH) return null
  return { x, y }
}

export function clampToPaper(
  x: number,
  y: number,
  paperW: number,
  paperH: number,
): { x: number; y: number } {
  return {
    x: Math.min(paperW, Math.max(0, x)),
    y: Math.min(paperH, Math.max(0, y)),
  }
}
