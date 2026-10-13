/**
 * Pixel-eraser geometry shared by the web Editor and the native InkOverlay.
 *
 * Contract: platforms own input + rendering; this module owns the point math
 * so erasing behaves identically everywhere. All functions are pure and
 * allocation-light: per gesture event the caller stamps eraser circles, and
 * only strokes whose bounding box intersects a circle pay pointwise tests.
 *
 * Coordinates: packed `[x, y, pressure, …]` triples in paper (document) or
 * world (board) units; circles in the same space. Radii are paper/world
 * units — callers must NOT pre-divide by zoom.
 */

export interface EraseCircle {
  x: number
  y: number
  r: number
}

export interface StrokeBounds {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Surviving pieces shorter than this fraction of the eraser diameter are confetti — drop them. */
export const ERASE_FRAGMENT_DIAMETER_RATIO = 0.25

/** Bounding box of packed `[x, y, pressure, …]` triples. Null when empty/invalid. */
export function strokePointsBounds(pts: number[]): StrokeBounds | null {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let i = 0; i + 1 < pts.length; i += 3) {
    const x = pts[i]!
    const y = pts[i + 1]!
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    if (x < x0) x0 = x
    if (y < y0) y0 = y
    if (x > x1) x1 = x
    if (y > y1) y1 = y
  }
  if (!Number.isFinite(x0) || !Number.isFinite(y0)) return null
  return { x0, y0, x1, y1 }
}

function circleHitsBounds(c: EraseCircle, b: StrokeBounds, pad: number): boolean {
  return c.x + c.r + pad >= b.x0 && c.x - c.r - pad <= b.x1 && c.y + c.r + pad >= b.y0 && c.y - c.r - pad <= b.y1
}

/** True when any circle can touch the stroke (bbox broadphase, padded by stroke half width). */
export function eraseCirclesHitBounds(pts: number[], circles: readonly EraseCircle[], halfWidth: number): boolean {
  if (circles.length === 0) return false
  const b = strokePointsBounds(pts)
  if (!b) return false
  const pad = Number.isFinite(halfWidth) && halfWidth > 0 ? halfWidth : 0
  for (const c of circles) {
    if (!Number.isFinite(c.x) || !Number.isFinite(c.y) || !(c.r > 0)) continue
    if (circleHitsBounds(c, b, pad)) return true
  }
  return false
}

function pointErased(
  x: number,
  y: number,
  circles: readonly EraseCircle[],
  halfWidth: number,
): boolean {
  for (const c of circles) {
    if (!Number.isFinite(c.x) || !Number.isFinite(c.y) || !(c.r > 0)) continue
    const tol = c.r + halfWidth
    const dx = x - c.x
    const dy = y - c.y
    if (dx * dx + dy * dy <= tol * tol) return true
  }
  return false
}

/**
 * Cut erased runs out of packed triples. Returns surviving pieces (each a
 * packed-triple array with ≥ 2 points). A fully covered stroke yields `[]`;
 * an untouched stroke yields `[pts]` (same reference — no copy).
 *
 * Segment-precise: cuts are computed against the polyline segments (not just
 * sampled vertices), so a tap between two far-apart points still punches a
 * hole, and the surviving edge lands on the eraser-circle boundary instead of
 * jumping back to the nearest surviving sample. New boundary points inherit
 * lerped pressure.
 *
 * `halfWidth` is the stroke's rendered half width: a fat highlighter is
 * caught when the circle overlaps its edge, not only its centerline.
 */
export function splitStrokeByEraser(
  pts: number[],
  circles: readonly EraseCircle[],
  halfWidth: number,
): number[][] {
  const n = Math.floor(pts.length / 3)
  if (n === 0 || circles.length === 0) return n === 0 ? [] : [pts]
  const hw = Number.isFinite(halfWidth) && halfWidth > 0 ? halfWidth : 0
  const valid: EraseCircle[] = []
  for (const c of circles) {
    if (!c || !Number.isFinite(c.x) || !Number.isFinite(c.y)) continue
    if (!(c.r > 0) || !Number.isFinite(c.r)) continue
    valid.push(c)
  }
  if (valid.length === 0) return [pts]
  if (!eraseCirclesHitBounds(pts, valid, hw)) return [pts]
  if (n === 1) {
    const x = pts[0]!
    const y = pts[1]!
    if (!Number.isFinite(x) || !Number.isFinite(y)) return []
    return pointErased(x, y, valid, hw) ? [] : [pts]
  }
  let minTol = Infinity
  for (const c of valid) {
    const tol = c.r + hw
    if (tol < minTol) minTol = tol
  }
  if (!Number.isFinite(minTol) || minTol <= 0) return [pts]
  // Sample spacing tracks the smallest footprint so a graze no wider than a
  // quarter footprint still registers, without densifying kept regions.
  const step = Math.min(4, Math.max(0.5, minTol / 4))

  const statusAt = (ax: number, ay: number, bx: number, by: number, t: number): boolean =>
    pointErased(ax + (bx - ax) * t, ay + (by - ay) * t, valid, hw)

  /** Refine a kept↔erased transition to the kept side of the boundary. */
  const refineBoundary = (
    ax: number,
    ay: number,
    bx: number,
    by: number,
    keptT: number,
    erasedT: number,
  ): number => {
    let a = keptT
    let b = erasedT
    for (let i = 0; i < 12; i++) {
      const m = (a + b) / 2
      if (!statusAt(ax, ay, bx, by, m)) a = m
      else b = m
    }
    return a
  }

  const pieces: number[][] = []
  let run: number[] | null = null
  let touched = false
  let hasBreak = false
  let startAccounted = false
  const closeRun = () => {
    if (run && run.length >= 6) pieces.push(run)
    run = null
  }

  for (let i = 0; i < n - 1; i++) {
    const x0 = pts[i * 3]!
    const y0 = pts[i * 3 + 1]!
    const q0 = pts[i * 3 + 2] ?? 0.5
    const x1 = pts[(i + 1) * 3]!
    const y1 = pts[(i + 1) * 3 + 1]!
    const q1 = pts[(i + 1) * 3 + 2] ?? 0.5
    const v0 = Number.isFinite(x0) && Number.isFinite(y0)
    const v1 = Number.isFinite(x1) && Number.isFinite(y1)
    if (!v0) {
      closeRun()
      hasBreak = true
      startAccounted = false
      continue
    }
    const p0 = Number.isFinite(q0) ? (q0 as number) : 0.5
    const p1 = Number.isFinite(q1) ? (q1 as number) : 0.5
    let e0 = pointErased(x0, y0, valid, hw)
    if (!startAccounted) {
      if (e0) touched = true
      else {
        if (!run) run = []
        run.push(x0, y0, p0)
      }
    } else if (e0 && run) {
      // Defensive: bookkeeping says kept, geometry says erased.
      closeRun()
      touched = true
    } else if (!e0 && !run) {
      run = []
    }
    if (!v1) {
      closeRun()
      hasBreak = true
      startAccounted = false
      continue
    }
    const e1 = pointErased(x1, y1, valid, hw)
    const segLen = Math.hypot(x1 - x0, y1 - y0)
    if (segLen < 1e-9) {
      if (e1) touched = true
      startAccounted = true
      continue
    }
    if (!segmentMayHit(x0, y0, x1, y1, valid, hw)) {
      // Both endpoints kept and the segment never enters a footprint.
      if (!run) run = []
      run.push(x1, y1, p1)
      startAccounted = true
      continue
    }
    const k = Math.min(64, Math.max(1, Math.ceil(segLen / step)))
    let prevT = 0
    let prevE = e0
    for (let j = 1; j <= k; j++) {
      const t = j / k
      const se =
        j === k
          ? e1
          : pointErased(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, valid, hw)
      if (se) touched = true
      if (se !== prevE) {
        const bt = prevE
          ? refineBoundary(x0, y0, x1, y1, t, prevT)
          : refineBoundary(x0, y0, x1, y1, prevT, t)
        const bx = x0 + (x1 - x0) * bt
        const by = y0 + (y1 - y0) * bt
        const bp = p0 + (p1 - p0) * bt
        if (prevE) {
          // erased → kept: open a new piece on the boundary
          if (!run) run = []
          run.push(bx, by, bp)
        } else {
          // kept → erased: close the piece on the boundary
          if (!run) run = []
          run.push(bx, by, bp)
          closeRun()
        }
        prevT = t
        prevE = se
      }
      if (j === k && !se) {
        if (!run) run = []
        run.push(x1, y1, p1)
      }
    }
    startAccounted = true
  }
  closeRun()
  if (!touched && !hasBreak) return [pts]
  return pieces
}

/** True when a segment's capsule (segment ± halfWidth) meets any eraser disc. */
function segmentMayHit(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  circles: readonly EraseCircle[],
  halfWidth: number,
): boolean {
  for (const c of circles) {
    if (!Number.isFinite(c.x) || !Number.isFinite(c.y) || !(c.r > 0)) continue
    const tol = c.r + halfWidth
    const dx0 = ax - c.x
    const dy0 = ay - c.y
    if (dx0 * dx0 + dy0 * dy0 <= tol * tol) return true
    const dx1 = bx - c.x
    const dy1 = by - c.y
    if (dx1 * dx1 + dy1 * dy1 <= tol * tol) return true
    const vx = bx - ax
    const vy = by - ay
    const wx = c.x - ax
    const wy = c.y - ay
    const c1 = wx * vx + wy * vy
    if (c1 <= 0) continue
    const c2 = vx * vx + vy * vy
    if (c2 <= c1) continue
    const t = c1 / c2
    const px = ax + vx * t - c.x
    const py = ay + vy * t - c.y
    if (px * px + py * py <= tol * tol) return true
  }
  return false
}

/** Polyline length of packed triples (ignores pressure). */
export function strokeEraseLength(pts: number[]): number {
  let len = 0
  let px = 0
  let py = 0
  let first = true
  for (let i = 0; i + 1 < pts.length; i += 3) {
    const x = pts[i]!
    const y = pts[i + 1]!
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      first = true
      continue
    }
    if (!first) len += Math.hypot(x - px, y - py)
    px = x
    py = y
    first = false
  }
  return len
}

/**
 * True when a surviving piece is too small to see or tap — drop it rather
 * than leaving confetti dots. `eraserDiameter` is the footprint diameter in
 * the stroke's own units. Deliberately keeps single-tap dots: those are cut
 * from the piece list by `splitStrokeByEraser` only when actually covered.
 */
export function isErasureFragment(piece: number[], eraserDiameter: number): boolean {
  if (Math.floor(piece.length / 3) < 2) return true
  const d = Number.isFinite(eraserDiameter) && eraserDiameter > 0 ? eraserDiameter : 0
  if (d <= 0) return false
  return strokeEraseLength(piece) < d * ERASE_FRAGMENT_DIAMETER_RATIO
}

/**
 * Stroke-mode hit test with stroke-width inclusion: true when point (x, y)
 * lands within `radius + halfWidth` of any packed point. Broadphase bbox
 * first, so untouched strokes cost almost nothing.
 */
export function hitEraseStroke(
  pts: number[],
  x: number,
  y: number,
  radius: number,
  halfWidth: number,
): boolean {
  if (!(radius > 0) || !Number.isFinite(x) || !Number.isFinite(y)) return false
  const hw = Number.isFinite(halfWidth) && halfWidth > 0 ? halfWidth : 0
  const tol = radius + hw
  const b = strokePointsBounds(pts)
  if (!b) return false
  if (x + tol < b.x0 || x - tol > b.x1 || y + tol < b.y0 || y - tol > b.y1) return false
  for (let i = 0; i + 1 < pts.length; i += 3) {
    const dx = pts[i]! - x
    const dy = pts[i + 1]! - y
    if (dx * dx + dy * dy <= tol * tol) return true
  }
  return false
}

/**
 * Erased point-index runs (inclusive `[from, to]` pairs over packed-triple
 * indices) for one stamp batch. Sorted, non-overlapping. Empty when untouched.
 * Platforms accumulate these across gesture events with {@link mergeEraseRanges}.
 */
export function erasedPointRanges(
  pts: number[],
  circles: readonly EraseCircle[],
  halfWidth: number,
): Array<[number, number]> {
  const n = Math.floor(pts.length / 3)
  const out: Array<[number, number]> = []
  if (n === 0 || circles.length === 0) return out
  if (!eraseCirclesHitBounds(pts, circles, halfWidth)) return out
  const hw = Number.isFinite(halfWidth) && halfWidth > 0 ? halfWidth : 0
  let start = -1
  const flush = (end: number) => {
    if (start >= 0) {
      out.push([start, end])
      start = -1
    }
  }
  for (let i = 0; i < n; i++) {
    const x = pts[i * 3]!
    const y = pts[i * 3 + 1]!
    const erased = Number.isFinite(x) && Number.isFinite(y) && pointErased(x, y, circles, hw)
    if (erased) {
      if (start < 0) start = i
    } else {
      flush(i - 1)
    }
  }
  flush(n - 1)
  return out
}

/** Union two sorted range lists into one sorted, non-overlapping list. */
export function mergeEraseRanges(
  a: ReadonlyArray<readonly [number, number]>,
  b: ReadonlyArray<readonly [number, number]>,
): Array<[number, number]> {
  const all = [...a, ...b].sort((p, q) => p[0] - q[0] || p[1] - q[1])
  const out: Array<[number, number]> = []
  for (const [s, e] of all) {
    const last = out[out.length - 1]
    if (last && s <= last[1] + 1) {
      if (e > last[1]) last[1] = e
    } else {
      out.push([s, e])
    }
  }
  return out
}

/**
 * Complement of erased ranges: kept point-index runs over `n` packed points.
 * Single-point runs are dropped here — they cannot render and would vanish
 * at commit anyway (see `isErasureFragment`).
 */
export function keptPointRuns(
  n: number,
  cuts: ReadonlyArray<readonly [number, number]>,
): Array<[number, number]> {
  const runs: Array<[number, number]> = []
  let cursor = 0
  for (const [s, e] of cuts) {
    if (s > cursor && s - cursor >= 2) runs.push([cursor, s - 1])
    else if (s > cursor && s - cursor === 1) {
      // single surviving point — unrenderable, treat as erased
    }
    cursor = Math.max(cursor, e + 1)
    if (cursor >= n) break
  }
  if (n - cursor >= 2) runs.push([cursor, n - 1])
  return runs
}

/** Slice packed triples for each kept run (pressure preserved). */
export function slicePackedRuns(pts: number[], runs: ReadonlyArray<readonly [number, number]>): number[][] {
  const out: number[][] = []
  for (const [s, e] of runs) {
    const piece: number[] = []
    for (let i = s; i <= e; i++) {
      piece.push(pts[i * 3]!, pts[i * 3 + 1]!, pts[i * 3 + 2] ?? 0.5)
    }
    if (piece.length >= 6) out.push(piece)
  }
  return out
}
