import { describe, expect, it } from 'vitest'
import {
  inkBaseWidthPaper,
  inkOutlineWidthPaper,
  paperToWidthSlider,
  sanitizeEraserMode,
  sanitizeEraserRadius,
  sanitizeInkWidth,
  widthSliderToPaper,
  DEFAULT_ERASER_RADIUS_PAPER,
  ERASER_RADIUS_MAX_PAPER,
  ERASER_RADIUS_MIN_PAPER,
  INK_WIDTH_HARD_MAX,
  INK_WIDTH_HARD_MIN,
  INK_WIDTH_MAX_PAPER,
  INK_WIDTH_MIN_PAPER,
} from '../src/utils/ink/ink-pen.js'
import { HIGHLIGHT_SCALE, INK_SIZES, SIZES } from '../src/palette.js'
import { createDrawShape } from '../src/utils/shapes/create.js'
import { validateDocumentBlocks } from '../src/page-document-blocks.js'

describe('inkBaseWidthPaper width override', () => {
  it('renders legacy widths when no override is stored', () => {
    expect(inkBaseWidthPaper('m', { kind: 'draw' })).toBe(SIZES.m * 0.75)
    expect(inkBaseWidthPaper('m', { kind: 'highlight' })).toBe(SIZES.m * HIGHLIGHT_SCALE)
    expect(inkBaseWidthPaper('l', { kind: 'draw', widthScale: 0.75 })).toBe(SIZES.l * 0.75)
  })

  it('replaces the SIZES lookup but keeps pen character', () => {
    expect(inkBaseWidthPaper('m', { kind: 'draw' }, 8)).toBe(8 * 0.75)
    expect(inkBaseWidthPaper('m', { kind: 'highlight' }, 8)).toBe(8 * HIGHLIGHT_SCALE)
    expect(inkBaseWidthPaper('s', { kind: 'draw', widthScale: 0.5 }, 8)).toBe(4)
  })

  it('clamps garbage overrides instead of exploding', () => {
    expect(inkBaseWidthPaper('m', { kind: 'draw' }, Number.NaN)).toBe(SIZES.m * 0.75)
    expect(inkBaseWidthPaper('m', { kind: 'draw' }, -5)).toBe(INK_WIDTH_HARD_MIN * 0.75)
    expect(inkBaseWidthPaper('m', { kind: 'draw' }, 1e9)).toBe(INK_WIDTH_HARD_MAX * 0.75)
  })
})

describe('width slider mapping', () => {
  it('spans the designed paper range at the endpoints', () => {
    expect(widthSliderToPaper(1)).toBeCloseTo(INK_WIDTH_MIN_PAPER, 5)
    expect(widthSliderToPaper(100)).toBeCloseTo(INK_WIDTH_MAX_PAPER, 5)
  })

  it('is monotonic with fine control at hairlines', () => {
    const a = widthSliderToPaper(10)
    const b = widthSliderToPaper(11)
    const c = widthSliderToPaper(90)
    const d = widthSliderToPaper(91)
    expect(b).toBeGreaterThan(a)
    expect(d).toBeGreaterThan(c)
    // exponential: same slider step moves less at the thin end
    expect(b - a).toBeLessThan(d - c)
  })

  it('round-trips through the inverse', () => {
    for (const v of [1, 25, 50, 75, 100]) {
      expect(paperToWidthSlider(widthSliderToPaper(v))).toBe(v)
    }
  })

  it('sanitizes raw widths', () => {
    expect(sanitizeInkWidth(4, 99)).toBe(4)
    expect(sanitizeInkWidth('nope', 4)).toBe(4)
    expect(sanitizeInkWidth(undefined, 4)).toBe(4)
  })
})

describe('inkOutlineWidthPaper (filled-ribbon renderers)', () => {
  it('is bit-identical to INK_SIZES without an override', () => {
    for (const size of ['s', 'm', 'l', 'xl'] as const) {
      expect(inkOutlineWidthPaper(size)).toBe(INK_SIZES[size])
    }
  })

  it('scales proportionally with an override', () => {
    // m legacy ratio is 5.2 / 4 = 1.3
    expect(inkOutlineWidthPaper('m', 8)).toBeCloseTo((8 * INK_SIZES.m) / SIZES.m, 9)
  })
})

describe('eraser chrome settings', () => {
  it('defaults unknown modes to whole-stroke erase', () => {
    expect(sanitizeEraserMode('pixel')).toBe('pixel')
    expect(sanitizeEraserMode('stroke')).toBe('stroke')
    expect(sanitizeEraserMode('laser')).toBe('stroke')
    expect(sanitizeEraserMode(undefined)).toBe('stroke')
  })

  it('clamps the eraser radius to its paper range', () => {
    expect(sanitizeEraserRadius(8, 99)).toBe(8)
    expect(sanitizeEraserRadius(0, 99)).toBe(ERASER_RADIUS_MIN_PAPER)
    expect(sanitizeEraserRadius(1e9, 99)).toBe(ERASER_RADIUS_MAX_PAPER)
    expect(sanitizeEraserRadius('wide', 99)).toBe(99)
    expect(DEFAULT_ERASER_RADIUS_PAPER).toBeGreaterThanOrEqual(ERASER_RADIUS_MIN_PAPER)
    expect(DEFAULT_ERASER_RADIUS_PAPER).toBeLessThanOrEqual(ERASER_RADIUS_MAX_PAPER)
  })
})

describe('stroke width persistence', () => {
  const stroke = (overrides: Record<string, unknown> = {}) => ({
    type: 'drawing',
    height: 120,
    strokes: [
      { pts: [0, 0, 0.5, 10, 0, 0.5], color: 'black', size: 'm', kind: 'draw', ...overrides },
    ],
  })

  it('normalize preserves a valid width', () => {
    const [block] = validateDocumentBlocks([stroke({ width: 8 })])
    expect(block?.type).toBe('drawing')
    if (block?.type === 'drawing') {
      expect(block.strokes[0]?.width).toBe(8)
    }
  })

  it('normalize clamps an out-of-range width and drops garbage', () => {
    const [big] = validateDocumentBlocks([stroke({ width: 1e9 })])
    const [junk] = validateDocumentBlocks([stroke({ width: 'huge' })])
    if (big?.type === 'drawing') expect(big.strokes[0]?.width).toBe(INK_WIDTH_HARD_MAX)
    if (junk?.type === 'drawing') expect(junk.strokes[0]?.width).toBeUndefined()
  })

  it('createDrawShape passes width to board shapes', () => {
    const shape = createDrawShape({
      id: 's1',
      parentId: 'p1',
      z: 1,
      kind: 'draw',
      pts: [0, 0, 0.5, 10, 0, 0.5],
      color: 'black',
      size: 'm',
      width: 8,
    })
    expect(shape).not.toBeNull()
    expect((shape?.props as { width?: number }).width).toBe(8)
    const legacy = createDrawShape({
      id: 's2',
      parentId: 'p1',
      z: 1,
      kind: 'draw',
      pts: [0, 0, 0.5, 10, 0, 0.5],
      color: 'black',
      size: 'm',
    })
    expect((legacy?.props as { width?: number }).width).toBeUndefined()
  })
})
