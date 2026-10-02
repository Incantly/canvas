import { describe, expect, it } from 'vitest'
import {
  extendLivePath,
  extendLivePathMany,
  interpolateGapPoints,
} from '../src/headless.js'

describe('live-stroke helpers', () => {
  it('returns no interior points for sub-step gaps', () => {
    expect(interpolateGapPoints(0, 0, 2, 0, 4)).toEqual([])
    expect(interpolateGapPoints(0, 0, 0, 0, 4)).toEqual([])
  })

  it('fills fast-stroke gaps with evenly spaced points', () => {
    const pts = interpolateGapPoints(0, 0, 10, 0, 4)
    expect(pts).toHaveLength(2)
    expect(pts[0]!.x).toBeCloseTo(4)
    expect(pts[1]!.x).toBeCloseTo(8)
  })

  it('caps pathological jumps', () => {
    expect(interpolateGapPoints(0, 0, 100000, 0, 1).length).toBeLessThanOrEqual(64)
  })

  it('builds a preview path incrementally', () => {
    let d = extendLivePath('', 0, 0)
    d = extendLivePath(d, 10, 5)
    expect(d).toBe('M 0.00 0.00 L 10.00 5.00')
  })

  it('batch-appends identically to per-point extends', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: 20, y: -3.14159 },
    ]
    let seq = ''
    for (const p of pts) seq = extendLivePath(seq, p.x, p.y)
    expect(extendLivePathMany('', pts)).toBe(seq)
    expect(extendLivePathMany('M 0.00 0.00', pts.slice(1))).toBe(seq)
    expect(extendLivePathMany(seq, [])).toBe(seq)
    expect(extendLivePathMany('', [])).toBe('')
  })

})
