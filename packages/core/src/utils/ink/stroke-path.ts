import { shouldAppendPoint } from './point-filter.js'

/** Soft cap for packed stroke points (x, y, pressure triples). */
export const STROKE_POINT_SOFT_CAP = 50_000

/** Flatten packed [x, y, pressure, ...] into [x, y, ...]. */
export function flattenStrokeXy(pts: number[]): number[] {
  const out: number[] = []
  for (let i = 0; i + 1 < pts.length; i += 3) {
    const x = pts[i]
    const y = pts[i + 1]
    if (typeof x !== 'number' || typeof y !== 'number') continue
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    out.push(x, y)
  }
  return out
}

/**
 * Downsample packed stroke points when over the soft cap, keeping first + last.
 */
export function simplifyPackedStrokePts(pts: number[]): number[] {
  const n = Math.floor(pts.length / 3)
  if (n <= STROKE_POINT_SOFT_CAP) return pts
  const step = Math.ceil(n / STROKE_POINT_SOFT_CAP)
  const out: number[] = []
  for (let i = 0; i < n; i += step) {
    const j = i * 3
    out.push(pts[j]!, pts[j + 1]!, pts[j + 2] ?? 0.5)
  }
  const last = (n - 1) * 3
  const lastX = pts[last]
  if (out.length < 3 || out[out.length - 3] !== lastX || out[out.length - 2] !== pts[last + 1]) {
    out.push(pts[last]!, pts[last + 1]!, pts[last + 2] ?? 0.5)
  }
  return out
}

/**
 * Quadratic-smoothed SVG path from packed [x, y, pressure, ...] — matches web `traceSmooth`.
 */
export function svgPathFromPackedPts(pts: number[]): string {
  const flat = flattenStrokeXy(pts)
  const n = flat.length / 2
  if (n < 1) return ''
  let d = `M ${flat[0]!.toFixed(2)} ${flat[1]!.toFixed(2)}`
  if (n < 3) {
    for (let i = 1; i < n; i++) {
      d += ` L ${flat[i * 2]!.toFixed(2)} ${flat[i * 2 + 1]!.toFixed(2)}`
    }
    return d
  }
  for (let i = 1; i < n - 1; i++) {
    const x = flat[i * 2]!
    const y = flat[i * 2 + 1]!
    const nx = flat[(i + 1) * 2]!
    const ny = flat[(i + 1) * 2 + 1]!
    d += ` Q ${x.toFixed(2)} ${y.toFixed(2)} ${((x + nx) / 2).toFixed(2)} ${((y + ny) / 2).toFixed(2)}`
  }
  d += ` L ${flat[(n - 1) * 2]!.toFixed(2)} ${flat[(n - 1) * 2 + 1]!.toFixed(2)}`
  return d
}

/** Append a packed point if it is far enough from the last sample. */
export function appendPackedStrokePoint(
  pts: number[],
  x: number,
  y: number,
  pressure: number,
  minDist: number,
): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false
  const p = Number.isFinite(pressure) ? pressure : 0.5
  if (pts.length < 3) {
    pts.push(x, y, p)
    return true
  }
  const lastX = pts[pts.length - 3]!
  const lastY = pts[pts.length - 2]!
  if (!shouldAppendPoint({ x: lastX, y: lastY }, { x, y, pressure: p }, minDist)) {
    return false
  }
  pts.push(x, y, p)
  return true
}

/**
 * Filled variable-width ribbon from packed `[x, y, pressure, …]`.
 * `widthAt` maps each pressure sample to paper-space width.
 */
export function svgRibbonFromPackedPts(
  pts: number[],
  widthAt: (pressure: number) => number,
): string {
  const samples: { x: number; y: number; w: number }[] = []
  for (let i = 0; i + 2 < pts.length; i += 3) {
    const x = pts[i]!
    const y = pts[i + 1]!
    const pr = pts[i + 2] ?? 0.5
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    const w = widthAt(Number.isFinite(pr) ? pr : 0.5)
    samples.push({ x, y, w: Number.isFinite(w) && w > 0 ? w : 0.25 })
  }
  if (samples.length < 2) return ''
  const left: { x: number; y: number }[] = []
  const right: { x: number; y: number }[] = []
  for (let i = 0; i < samples.length; i++) {
    const prev = samples[i === 0 ? 0 : i - 1]!
    const next = samples[i === samples.length - 1 ? i : i + 1]!
    let dx = next.x - prev.x
    let dy = next.y - prev.y
    const len = Math.hypot(dx, dy)
    if (len < 1e-6) {
      dx = 1
      dy = 0
    } else {
      dx /= len
      dy /= len
    }
    const nx = -dy
    const ny = dx
    const hw = samples[i]!.w / 2
    left.push({ x: samples[i]!.x + nx * hw, y: samples[i]!.y + ny * hw })
    right.push({ x: samples[i]!.x - nx * hw, y: samples[i]!.y - ny * hw })
  }
  let d = `M ${left[0]!.x.toFixed(2)} ${left[0]!.y.toFixed(2)}`
  for (let i = 1; i < left.length; i++) {
    d += ` L ${left[i]!.x.toFixed(2)} ${left[i]!.y.toFixed(2)}`
  }
  for (let i = right.length - 1; i >= 0; i--) {
    d += ` L ${right[i]!.x.toFixed(2)} ${right[i]!.y.toFixed(2)}`
  }
  return `${d} Z`
}
