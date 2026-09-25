import { describe, expect, it } from 'vitest'
import {
  eraseCirclesHitBounds,
  erasedPointRanges,
  hitEraseStroke,
  isErasureFragment,
  keptPointRuns,
  mergeEraseRanges,
  slicePackedRuns,
  splitStrokeByEraser,
  strokeEraseLength,
  strokePointsBounds,
} from '../src/utils/ink/erase.js'

// Straight 0..100 line, pressure 0.5, paper units.
function line(x0: number, x1: number, step = 5, y = 0): number[] {
  const pts: number[] = []
  for (let x = x0; x <= x1 + 1e-9; x += step) pts.push(x, y, 0.5)
  return pts
}

describe('strokePointsBounds', () => {
  it('bounds packed triples and rejects empties', () => {
    expect(strokePointsBounds(line(0, 100))).toEqual({ x0: 0, y0: 0, x1: 100, y1: 0 })
    expect(strokePointsBounds([])).toBeNull()
  })
})

describe('splitStrokeByEraser', () => {
  it('returns the same reference when untouched', () => {
    const pts = line(0, 100)
    expect(splitStrokeByEraser(pts, [{ x: 500, y: 0, r: 6 }], 0)).toEqual([pts])
    expect(splitStrokeByEraser(pts, [], 0)[0]).toBe(pts)
  })

  it('cuts the middle into two surviving pieces', () => {
    const pieces = splitStrokeByEraser(line(0, 100), [{ x: 50, y: 0, r: 6 }], 0)
    expect(pieces).toHaveLength(2)
    const last0 = pieces[0]![pieces[0]!.length - 3]!
    const first1 = pieces[1]![0]!
    expect(last0).toBeLessThan(44)
    expect(first1).toBeGreaterThan(56)
  })

  it('truncates when erasing off the end', () => {
    const pieces = splitStrokeByEraser(line(0, 100), [{ x: 100, y: 0, r: 6 }], 0)
    expect(pieces).toHaveLength(1)
    expect(pieces[0]![pieces[0]!.length - 3]!).toBeLessThan(94)
  })

  it('removes a fully covered stroke', () => {
    expect(splitStrokeByEraser(line(0, 20), [{ x: 10, y: 0, r: 30 }], 0)).toEqual([])
  })

  it('includes stroke half width in the footprint', () => {
    const pts = line(0, 100)
    // Circle 8px above the centerline: misses a hairline, catches a fat marker.
    expect(splitStrokeByEraser(pts, [{ x: 50, y: 8, r: 6 }], 0)).toHaveLength(1)
    expect(splitStrokeByEraser(pts, [{ x: 50, y: 8, r: 6 }], 4)).toHaveLength(2)
  })

  it('keeps pressure samples on surviving points', () => {
    const pts = [0, 0, 0.2, 20, 0, 0.3, 50, 0, 0.9, 80, 0, 0.1, 100, 0, 0.4]
    const pieces = splitStrokeByEraser(pts, [{ x: 50, y: 0, r: 6 }], 0)
    expect(pieces).toHaveLength(2)
    // Original surviving samples are preserved verbatim …
    expect(pieces[0]!.slice(0, 6)).toEqual([0, 0, 0.2, 20, 0, 0.3])
    expect(pieces[1]!.slice(-6)).toEqual([80, 0, 0.1, 100, 0, 0.4])
    // … and each cut edge lands on the footprint boundary with lerped pressure.
    const edge0x = pieces[0]![pieces[0]!.length - 3]!
    const edge0p = pieces[0]![pieces[0]!.length - 1]!
    const edge1x = pieces[1]![0]!
    const edge1p = pieces[1]![2]!
    expect(edge0x).toBeGreaterThan(43)
    expect(edge0x).toBeLessThan(44.5)
    expect(edge0p).toBeCloseTo(0.78, 1)
    expect(edge1x).toBeGreaterThan(55.5)
    expect(edge1x).toBeLessThan(57)
    expect(edge1p).toBeCloseTo(0.74, 1)
  })

  it('cuts a sparse two-point stroke on a middle tap', () => {
    // No sampled vertex inside the footprint — the tap still punches a hole
    // instead of doing nothing (the old "push the stroke back" feel).
    const pts = [0, 0, 0.5, 100, 0, 0.5]
    const pieces = splitStrokeByEraser(pts, [{ x: 50, y: 0, r: 6 }], 0)
    expect(pieces).toHaveLength(2)
    expect(pieces[0]![0]).toBe(0)
    expect(pieces[1]![pieces[1]!.length - 3]).toBe(100)
    expect(pieces[0]![pieces[0]!.length - 3]!).toBeLessThan(45)
    expect(pieces[0]![pieces[0]!.length - 3]!).toBeGreaterThan(43)
    expect(pieces[1]![0]!).toBeGreaterThan(55)
    expect(pieces[1]![0]!).toBeLessThan(57)
  })

  it('tap between samples keeps both ends where they were', () => {
    const pts = line(0, 100, 25) // 0, 25, 50, 75, 100
    const pieces = splitStrokeByEraser(pts, [{ x: 50, y: 0, r: 6 }], 0)
    expect(pieces).toHaveLength(2)
    expect(pieces[0]![0]).toBe(0)
    expect(pieces[1]![pieces[1]!.length - 3]).toBe(100)
    expect(pieces[0]![pieces[0]!.length - 3]!).toBeLessThan(45)
    expect(pieces[1]![0]!).toBeGreaterThan(55)
  })

  it('truncates a sparse stroke at the footprint edge', () => {
    const pts = [0, 0, 0.5, 100, 0, 0.5]
    const pieces = splitStrokeByEraser(pts, [{ x: 100, y: 0, r: 6 }], 0)
    expect(pieces).toHaveLength(1)
    expect(pieces[0]![0]).toBe(0)
    const end = pieces[0]![pieces[0]!.length - 3]!
    expect(end).toBeLessThan(95)
    expect(end).toBeGreaterThan(93)
  })
})

describe('isErasureFragment', () => {
  it('drops slivers, keeps real pieces', () => {
    expect(isErasureFragment([0, 0, 0.5], 12)).toBe(true)
    expect(isErasureFragment(line(0, 2), 12)).toBe(true) // 2px < 25% of 12
    expect(isErasureFragment(line(0, 50), 12)).toBe(false)
    expect(isErasureFragment(line(0, 50), 0)).toBe(false)
  })
})

describe('strokeEraseLength', () => {
  it('measures polyline length', () => {
    expect(strokeEraseLength(line(0, 100))).toBeCloseTo(100, 9)
    expect(strokeEraseLength([])).toBe(0)
  })
})

describe('eraseCirclesHitBounds', () => {
  it('broadphase rejects distant strokes', () => {
    const pts = line(0, 100)
    expect(eraseCirclesHitBounds(pts, [{ x: 500, y: 500, r: 6 }], 0)).toBe(false)
    expect(eraseCirclesHitBounds(pts, [{ x: 50, y: 0, r: 6 }], 0)).toBe(true)
    expect(eraseCirclesHitBounds(pts, [], 0)).toBe(false)
  })
})

describe('hitEraseStroke', () => {
  it('hits within radius + half width only', () => {
    const pts = line(0, 100)
    expect(hitEraseStroke(pts, 50, 0, 6, 0)).toBe(true)
    expect(hitEraseStroke(pts, 50, 20, 6, 0)).toBe(false)
    expect(hitEraseStroke(pts, 50, 9, 6, 4)).toBe(true) // 9 <= 6 + 4
    expect(hitEraseStroke(pts, 50, 11, 6, 4)).toBe(false)
    expect(hitEraseStroke([], 0, 0, 6, 0)).toBe(false)
    expect(hitEraseStroke(pts, 50, 0, 0, 0)).toBe(false)
  })
})

describe('incremental pixel ranges', () => {
  it('erasedPointRanges reports index runs for one stamp batch', () => {
    const pts = line(0, 100) // 21 points, 5 units apart
    const ranges = erasedPointRanges(pts, [{ x: 50, y: 0, r: 6 }], 0)
    expect(ranges).toEqual([[9, 11]])
    expect(erasedPointRanges(pts, [{ x: 500, y: 0, r: 6 }], 0)).toEqual([])
    expect(erasedPointRanges(pts, [], 0)).toEqual([])
  })

  it('mergeEraseRanges unions overlapping and adjacent runs', () => {
    expect(mergeEraseRanges([[2, 5]], [[4, 8]])).toEqual([[2, 8]])
    expect(mergeEraseRanges([[2, 5]], [[6, 8]])).toEqual([[2, 8]]) // adjacent merges
    expect(mergeEraseRanges([[2, 5]], [[8, 9]])).toEqual([[2, 5], [8, 9]])
    expect(mergeEraseRanges([], [[1, 2]])).toEqual([[1, 2]])
  })

  it('keptPointRuns complements cuts and drops lone points', () => {
    expect(keptPointRuns(21, [[9, 11]])).toEqual([[0, 8], [12, 20]])
    expect(keptPointRuns(21, [])).toEqual([[0, 20]])
    expect(keptPointRuns(21, [[0, 20]])).toEqual([])
    // single surviving point at index 20 is unrenderable
    expect(keptPointRuns(21, [[0, 19]])).toEqual([])
  })

  it('slicePackedRuns preserves pressure per run', () => {
    const pts = [0, 0, 0.2, 5, 0, 0.3, 50, 0, 0.9, 95, 0, 0.1, 100, 0, 0.4]
    const pieces = slicePackedRuns(pts, keptPointRuns(5, [[2, 2]]))
    expect(pieces).toEqual([
      [0, 0, 0.2, 5, 0, 0.3],
      [95, 0, 0.1, 100, 0, 0.4],
    ])
  })

  it('sequential per-event splits match one-shot split', () => {
    const pts = line(0, 100)
    const hw = 0
    const circleA = { x: 30, y: 0, r: 6 }
    const circleB = { x: 70, y: 0, r: 6 }
    // What InkOverlay does per gesture event: split surviving pieces with the
    // new stamp batch only.
    const afterA = splitStrokeByEraser(pts, [circleA], hw)
    const sequential = afterA.flatMap((piece) => splitStrokeByEraser(piece, [circleB], hw))
    const oneShot = splitStrokeByEraser(pts, [circleA, circleB], hw)
    expect(sequential).toEqual(oneShot)
  })
})
