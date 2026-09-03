import { describe, expect, it } from 'vitest'
import {
  STROKE_POINT_SOFT_CAP,
  appendPackedStrokePoint,
  flattenStrokeXy,
  simplifyPackedStrokePts,
  svgPathFromPackedPts,
  svgRibbonFromPackedPts,
} from '../../src/utils/ink/stroke-path.js'

describe('appendPackedStrokePoint', () => {
  it('records the first point', () => {
    const pts: number[] = []
    expect(appendPackedStrokePoint(pts, 1, 2, 0.4, 1.25)).toBe(true)
    expect(pts).toEqual([1, 2, 0.4])
  })

  it('drops points closer than minDist', () => {
    const pts: number[] = [0, 0, 0.5]
    expect(appendPackedStrokePoint(pts, 0.2, 0, 0.5, 1.25)).toBe(false)
    expect(pts).toHaveLength(3)
    expect(appendPackedStrokePoint(pts, 4, 0, 0.5, 1.25)).toBe(true)
    expect(pts).toEqual([0, 0, 0.5, 4, 0, 0.5])
  })

  it('rejects non-finite coordinates', () => {
    const pts: number[] = []
    expect(appendPackedStrokePoint(pts, Number.NaN, 0, 0.5, 1)).toBe(false)
    expect(pts).toHaveLength(0)
  })
})

describe('simplifyPackedStrokePts', () => {
  it('keeps short strokes intact', () => {
    const pts = [0, 0, 0.5, 2, 1, 0.5]
    expect(simplifyPackedStrokePts(pts)).toEqual(pts)
  })

  it('downsamples over the soft cap and keeps the last point', () => {
    const pts: number[] = []
    const n = STROKE_POINT_SOFT_CAP + 500
    for (let i = 0; i < n; i++) pts.push(i, i * 0.1, 0.5)
    const simplified = simplifyPackedStrokePts(pts)
    expect(Math.floor(simplified.length / 3)).toBeLessThanOrEqual(STROKE_POINT_SOFT_CAP + 1)
    expect(simplified[simplified.length - 3]).toBe(n - 1)
  })
})

describe('svgPathFromPackedPts', () => {
  it('returns empty for no points', () => {
    expect(svgPathFromPackedPts([])).toBe('')
  })

  it('emits a move + line for two points', () => {
    const d = svgPathFromPackedPts([0, 0, 0.5, 10, 4, 0.5])
    expect(d.startsWith('M ')).toBe(true)
    expect(d.includes(' L ')).toBe(true)
  })

  it('emits quadratic segments for longer strokes', () => {
    const d = svgPathFromPackedPts([0, 0, 0.5, 4, 2, 0.5, 8, 0, 0.5, 12, 3, 0.5])
    expect(d.includes(' Q ')).toBe(true)
  })
})

describe('svgRibbonFromPackedPts', () => {
  it('emits a closed ribbon for two or more points', () => {
    expect(svgRibbonFromPackedPts([], () => 4)).toBe('')
    const d = svgRibbonFromPackedPts([0, 0, 0.2, 10, 0, 0.8], (p) => 2 + p * 4)
    expect(d.startsWith('M ')).toBe(true)
    expect(d.endsWith(' Z')).toBe(true)
  })
})

describe('flattenStrokeXy', () => {
  it('drops pressure samples', () => {
    expect(flattenStrokeXy([1, 2, 0.5, 3, 4, 0.9])).toEqual([1, 2, 3, 4])
  })
})
