import type { Bounds, GeoId } from './types/index.js'

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

export const boundsUnion = (a: Bounds | null, b: Bounds | null): Bounds => {
  if (!a) return b!
  if (!b) return a
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  }
}

export const boundsExpand = (b: Bounds, m: number): Bounds => ({
  x: b.x - m,
  y: b.y - m,
  w: b.w + m * 2,
  h: b.h + m * 2,
})

export const boundsContain = (b: Bounds, x: number, y: number): boolean =>
  x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h

export const boundsIntersect = (a: Bounds, b: Bounds): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

export const ptsBounds = (pts: number[] | null, stride: number = 2): Bounds => {
  if (!pts || pts.length < 2) return { x: 0, y: 0, w: 0, h: 0 }
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity
  for (let i = 0; i < pts.length - 1; i += stride) {
    const x = pts[i],
      y = pts[i + 1]
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export const rotWith = (
  px: number,
  py: number,
  cx: number,
  cy: number,
  angle: number
): { x: number; y: number } => {
  if (!angle) return { x: px, y: py }
  const s = Math.sin(angle),
    c = Math.cos(angle)
  const dx = px - cx,
    dy = py - cy
  return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c }
}

export const distToSegSq = (
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number => {
  const dx = bx - ax,
    dy = by - ay
  const l2 = dx * dx + dy * dy
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0
  t = clamp(t, 0, 1)
  const x = ax + t * dx,
    y = ay + t * dy
  return (px - x) * (px - x) + (py - y) * (py - y)
}

export const distToPolyline = (
  px: number,
  py: number,
  pts: number[],
  stride: number = 2,
  closed: boolean = false
): number => {
  const n = Math.floor(pts.length / stride)
  if (n === 0) return Infinity
  if (n === 1) return Math.hypot(px - pts[0], py - pts[1])
  let best = Infinity
  for (let i = 0; i < n - 1 + (closed ? 1 : 0); i++) {
    const a = (i % n) * stride,
      b = ((i + 1) % n) * stride
    const d = distToSegSq(px, py, pts[a], pts[a + 1], pts[b], pts[b + 1])
    if (d < best) best = d
  }
  return Math.sqrt(best)
}

export const pointInPolygon = (
  px: number,
  py: number,
  pts: number[],
  stride: number = 2
): boolean => {
  let inside = false
  const n = Math.floor(pts.length / stride)
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[i * stride],
      yi = pts[i * stride + 1]
    const xj = pts[j * stride],
      yj = pts[j * stride + 1]
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export const pointInEllipse = (
  px: number,
  py: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number
): boolean => {
  if (rx <= 0 || ry <= 0) return false
  const dx = (px - cx) / rx,
    dy = (py - cy) / ry
  return dx * dx + dy * dy <= 1
}

export const segIntersectsBounds = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  r: Bounds
): boolean => {
  if (boundsContain(r, ax, ay) || boundsContain(r, bx, by)) return true
  const edges: [number, number, number, number][] = [
    [r.x, r.y, r.x + r.w, r.y],
    [r.x + r.w, r.y, r.x + r.w, r.y + r.h],
    [r.x + r.w, r.y + r.h, r.x, r.y + r.h],
    [r.x, r.y + r.h, r.x, r.y],
  ]
  for (const [cx, cy, dx, dy] of edges) {
    const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
    const d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax)
    const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx)
    const d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx)
    if (d1 * d2 < 0 && d3 * d4 < 0) return true
  }
  return false
}

export const seededRand = (str: string): (() => number) => {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let a = h >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface WobbleOpts {
  step?: number
  amp?: number
  closed?: boolean
}

export const wobblePolyline = (
  pts: number[],
  seed: string,
  { step = 24, amp = 1.6, closed = true }: WobbleOpts = {}
): number[] => {
  const rand = seededRand(seed)
  const out: number[] = []
  const n = pts.length / 2
  const segs = closed ? n : n - 1
  let ph = rand() * Math.PI * 2
  const freq = 0.35 + rand() * 0.2
  for (let i = 0; i < segs; i++) {
    const ax = pts[(i % n) * 2],
      ay = pts[(i % n) * 2 + 1]
    const bx = pts[((i + 1) % n) * 2],
      by = pts[((i + 1) % n) * 2 + 1]
    const len = Math.hypot(bx - ax, by - ay)
    const count = Math.max(1, Math.round(len / step))
    const nx = -(by - ay) / (len || 1),
      ny = (bx - ax) / (len || 1)
    for (let k = 0; k < count; k++) {
      const t = k / count
      const w = (k === 0 ? 0.3 : 1) * Math.sin(ph) * amp
      ph += freq
      out.push(ax + (bx - ax) * t + nx * w, ay + (by - ay) * t + ny * w)
    }
  }
  if (!closed) out.push(pts[(n - 1) * 2], pts[(n - 1) * 2 + 1])
  return out
}

export const geoPolygon = (geo: GeoId, w: number, h: number): number[] => {
  switch (geo) {
    case 'triangle':
      return [w / 2, 0, w, h, 0, h]
    case 'diamond':
      return [w / 2, 0, w, h / 2, w / 2, h, 0, h / 2]
    case 'hexagon': {
      const ix = w * 0.25
      return [ix, 0, w - ix, 0, w, h / 2, w - ix, h, ix, h, 0, h / 2]
    }
    case 'star': {
      const cx = w / 2,
        cy = h / 2
      const pts: number[] = []
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 1 : 0.45
        const a = -Math.PI / 2 + (i * Math.PI) / 5
        pts.push(cx + Math.cos(a) * r * cx, cy + Math.sin(a) * r * cy)
      }
      return pts
    }
    case 'cloud':
      return cloudPolygon(w, h)
    case 'rectangle':
    default:
      return [0, 0, w, 0, w, h, 0, h]
  }
}

export const ellipsePolygon = (w: number, h: number, n: number = 32): number[] => {
  const pts: number[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    pts.push(w / 2 + (Math.cos(a) * w) / 2, h / 2 + (Math.sin(a) * h) / 2)
  }
  return pts
}

export const CLOUD_START: readonly [number, number] = [0.15, 0.62]
export const CLOUD_CURVES: readonly [number, number, number, number, number, number][] = [
  [0.02, 0.60, 0.02, 0.38, 0.16, 0.35],
  [0.16, 0.15, 0.36, 0.10, 0.46, 0.20],
  [0.54, 0.10, 0.74, 0.10, 0.82, 0.32],
  [0.98, 0.32, 0.98, 0.58, 0.84, 0.60],
  [0.82, 0.74, 0.66, 0.80, 0.55, 0.75],
  [0.44, 0.70, 0.28, 0.78, 0.24, 0.68],
  [0.22, 0.65, 0.18, 0.62, 0.15, 0.62],
]

export const cloudPolygon = (w: number, h: number, steps: number = 12): number[] => {
  let px = CLOUD_START[0] * w
  let py = CLOUD_START[1] * h
  const pts: number[] = [px, py]
  for (const [c1x, c1y, c2x, c2y, ex, ey] of CLOUD_CURVES) {
    const x1 = c1x * w,
      y1 = c1y * h
    const x2 = c2x * w,
      y2 = c2y * h
    const x3 = ex * w,
      y3 = ey * h
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const mt = 1 - t
      pts.push(
        mt * mt * mt * px + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3,
        mt * mt * mt * py + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3
      )
    }
    px = x3
    py = y3
  }
  pts.length -= 2
  return pts
}

export const traceSmooth = (
  ctx: CanvasRenderingContext2D,
  pts: number[],
  closed: boolean = false
): void => {
  const n = pts.length / 2
  if (n < 1) return
  ctx.moveTo(pts[0], pts[1])
  if (n < 3) {
    for (let i = 1; i < n; i++) ctx.lineTo(pts[i * 2], pts[i * 2 + 1])
    return
  }
  for (let i = 1; i < n - 1; i++) {
    const x = pts[i * 2],
      y = pts[i * 2 + 1]
    const nx = pts[(i + 1) * 2],
      ny = pts[(i + 1) * 2 + 1]
    ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2)
  }
  ctx.lineTo(pts[(n - 1) * 2], pts[(n - 1) * 2 + 1])
  if (closed) ctx.closePath()
}
