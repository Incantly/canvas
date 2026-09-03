import { describe, expect, it } from 'vitest'
import {
  HIGHLIGHT_ALPHA,
  HIGHLIGHT_SCALE,
  STROKE_POINT_SOFT_CAP,
  svgPathFromPackedPts,
  DEFAULT_INK_PENS,
} from '../src/headless.js'

describe('headless ink exports', () => {
  it('exposes highlight constants and packed-path helpers', () => {
    expect(HIGHLIGHT_ALPHA).toBeGreaterThan(0)
    expect(HIGHLIGHT_ALPHA).toBeLessThanOrEqual(1)
    expect(HIGHLIGHT_SCALE).toBeGreaterThan(1)
    expect(STROKE_POINT_SOFT_CAP).toBeGreaterThan(0)
    expect(svgPathFromPackedPts([0, 0, 0.5, 10, 4, 0.5])).toMatch(/^M /)
    expect(DEFAULT_INK_PENS.map((p) => p.id)).toEqual(['draw', 'highlight'])
  })
})
