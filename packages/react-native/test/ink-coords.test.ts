import { describe, expect, it } from 'vitest'
import { screenToPaper, clampToPaper } from '../src/ink/coords.js'
import { inkStrokeWidthPaper } from '../src/ink/stroke-style.js'
import { HIGHLIGHT_SCALE, SIZES } from '@incantly/canvas/headless'

describe('screenToPaper', () => {
  it('divides overlay-local px by zoom', () => {
    expect(screenToPaper(150, 80, 0.5, 672, 888)).toEqual({ x: 300, y: 160 })
  })

  it('accepts points in the paper margin, not only the typing box', () => {
    expect(screenToPaper(20, 40, 1, 816, 1056)).toEqual({ x: 20, y: 40 })
  })

  it('rejects points outside the sheet', () => {
    expect(screenToPaper(10, 10, 1, 100, 100)).toEqual({ x: 10, y: 10 })
    expect(screenToPaper(-1, 10, 1, 100, 100)).toBeNull()
    expect(screenToPaper(10, 101, 1, 100, 100)).toBeNull()
  })

  it('rejects non-finite input', () => {
    expect(screenToPaper(Number.NaN, 0, 1, 100, 100)).toBeNull()
  })
})

describe('clampToPaper', () => {
  it('clamps to the sheet', () => {
    expect(clampToPaper(-4, 50, 100, 80)).toEqual({ x: 0, y: 50 })
    expect(clampToPaper(120, 90, 100, 80)).toEqual({ x: 100, y: 80 })
  })
})

describe('inkStrokeWidthPaper', () => {
  it('matches web pen and highlighter widths', () => {
    expect(inkStrokeWidthPaper('m', 'draw')).toBe(SIZES.m * 0.75)
    expect(inkStrokeWidthPaper('l', 'highlight')).toBe(SIZES.l * HIGHLIGHT_SCALE)
  })
})
