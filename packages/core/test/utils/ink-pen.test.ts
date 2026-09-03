import { describe, expect, it } from 'vitest'
import {
  DEFAULT_INK_PENS,
  inkBaseWidthPaper,
  inkWidthAtPressure,
  isInkCapturingTool,
  resolveInkPen,
  sanitizeInkPenId,
  sanitizeInkPens,
} from '../../src/utils/ink/ink-pen.js'
import { SIZES } from '../../src/palette.js'

describe('sanitizeInkPenId', () => {
  it('accepts host ids and rejects chrome / junk', () => {
    expect(sanitizeInkPenId('pencil')).toBe('pencil')
    expect(sanitizeInkPenId('draw')).toBe('draw')
    expect(sanitizeInkPenId('eraser')).toBeUndefined()
    expect(sanitizeInkPenId('select')).toBeUndefined()
    expect(sanitizeInkPenId('type')).toBeUndefined()
    expect(sanitizeInkPenId('bad id')).toBeUndefined()
    expect(sanitizeInkPenId('../x')).toBeUndefined()
  })
})

describe('sanitizeInkPens', () => {
  it('falls back to defaults for empty input', () => {
    expect(sanitizeInkPens(null).map((p) => p.id)).toEqual(['draw', 'highlight'])
    expect(sanitizeInkPens([]).map((p) => p.id)).toEqual(['draw', 'highlight'])
  })

  it('keeps a custom pressure pen and drops reserved ids', () => {
    const pens = sanitizeInkPens([
      { id: 'eraser', name: 'Nope', style: { kind: 'draw' } },
      { id: 'pencil', name: 'Pencil', style: { kind: 'draw', pressureWidth: true, widthScale: 0.5 } },
      { id: 'pencil', name: 'Dup', style: { kind: 'draw' } },
    ])
    expect(pens).toHaveLength(1)
    expect(pens[0]!.id).toBe('pencil')
    expect(pens[0]!.style.pressureWidth).toBe(true)
    expect(pens[0]!.style.widthScale).toBe(0.5)
  })
})

describe('resolveInkPen', () => {
  it('matches id then kind then default', () => {
    const pens = sanitizeInkPens([
      { id: 'pencil', name: 'Pencil', style: { kind: 'draw' } },
      { id: 'marker', name: 'Marker', style: { kind: 'highlight' } },
    ])
    expect(resolveInkPen(pens, 'pencil').id).toBe('pencil')
    expect(resolveInkPen(pens, 'missing', 'highlight').id).toBe('marker')
    expect(resolveInkPen(DEFAULT_INK_PENS, undefined, 'draw').id).toBe('draw')
  })
})

describe('ink width', () => {
  it('scales with size and pressure', () => {
    const style = { kind: 'draw' as const, widthScale: 1, pressureWidth: true, pressureMin: 0.5, pressureMax: 1.5 }
    const base = inkBaseWidthPaper('m', style)
    expect(base).toBe(SIZES.m)
    expect(inkWidthAtPressure(base, 0, style)).toBe(base * 0.5)
    expect(inkWidthAtPressure(base, 1, style)).toBe(base * 1.5)
    expect(inkWidthAtPressure(base, 0.5, { kind: 'draw' })).toBe(base)
  })
})

describe('isInkCapturingTool', () => {
  it('captures eraser and registered pens only', () => {
    expect(isInkCapturingTool('eraser', DEFAULT_INK_PENS)).toBe(true)
    expect(isInkCapturingTool('draw', DEFAULT_INK_PENS)).toBe(true)
    expect(isInkCapturingTool('select', DEFAULT_INK_PENS)).toBe(false)
  })
})
