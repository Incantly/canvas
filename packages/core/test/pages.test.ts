import { describe, expect, it } from 'vitest'
import {
  createPage,
  DEFAULT_PAGE_GAP,
  DEFAULT_PAGE_HEIGHT,
  DEFAULT_PAGE_WIDTH,
  layoutPagePositions,
  validatePageLayout,
  validatePageGap,
  pageGapForPreset,
} from '../src/pages.js'
import { Store } from '../src/store.js'

describe('layoutPagePositions', () => {
  it('stacks pages vertically below the first', () => {
    const p0 = createPage(0)
    const p1 = createPage(1)
    const updates = layoutPagePositions([p0, p1], 'vertical', DEFAULT_PAGE_GAP)
    expect(updates[0]).toEqual({ id: p0.id, x: 0, y: 0 })
    expect(updates[1]).toEqual({ id: p1.id, x: 0, y: DEFAULT_PAGE_HEIGHT + DEFAULT_PAGE_GAP })
  })

  it('places additional pages to the right in horizontal layout', () => {
    const p0 = createPage(0)
    const p1 = createPage(1)
    const p2 = createPage(2)
    const updates = layoutPagePositions([p0, p1, p2], 'horizontal', DEFAULT_PAGE_GAP)
    expect(updates[0]).toEqual({ id: p0.id, x: 0, y: 0 })
    expect(updates[1]).toEqual({ id: p1.id, x: DEFAULT_PAGE_WIDTH + DEFAULT_PAGE_GAP, y: 0 })
    expect(updates[2]).toEqual({
      id: p2.id,
      x: (DEFAULT_PAGE_WIDTH + DEFAULT_PAGE_GAP) * 2,
      y: 0,
    })
  })

  it('keeps page 1 at the origin when toggling layout', () => {
    const p0 = createPage(0)
    const p1 = createPage(1)
    const vertical = layoutPagePositions([p0, p1], 'vertical', DEFAULT_PAGE_GAP)
    const horizontal = layoutPagePositions([p0, p1], 'horizontal', DEFAULT_PAGE_GAP)
    expect(vertical.find((u) => u.id === p0.id)).toEqual({ id: p0.id, x: 0, y: 0 })
    expect(horizontal.find((u) => u.id === p0.id)).toEqual({ id: p0.id, x: 0, y: 0 })
    expect(vertical.find((u) => u.id === p1.id)!.y).toBeGreaterThan(0)
    expect(horizontal.find((u) => u.id === p1.id)!.x).toBeGreaterThan(0)
  })
})

describe('validatePageLayout', () => {
  it('accepts vertical and horizontal only', () => {
    expect(validatePageLayout('vertical')).toBe(true)
    expect(validatePageLayout('horizontal')).toBe(true)
    expect(validatePageLayout('grid')).toBe(false)
  })
})

describe('page gap', () => {
  it('connected preset uses zero gap between pages', () => {
    const p0 = createPage(0)
    const p1 = createPage(1)
    const updates = layoutPagePositions([p0, p1], 'vertical', pageGapForPreset('connected'))
    expect(updates[1].y).toBe(DEFAULT_PAGE_HEIGHT)
  })

  it('validatePageGap rejects negative values', () => {
    expect(validatePageGap(-1)).toBe(false)
    expect(validatePageGap(0)).toBe(true)
    expect(validatePageGap(48)).toBe(true)
  })
})

describe('store page layout', () => {
  it('relayouts pages when layout changes', () => {
    const s = new Store()
    s.normalizePages('remote')
    s.addPage()
    s.setPageLayout('horizontal')
    const pages = s.pages()
    expect(pages[0].x).toBe(0)
    expect(pages[1].x).toBeGreaterThan(0)
    s.setPageLayout('vertical')
    expect(s.pages()[1].y).toBeGreaterThan(0)
    expect(s.pages()[1].x).toBe(0)
  })

  it('rejects invalid layout', () => {
    const s = new Store()
    s.normalizePages('remote')
    expect(() => s.setPageLayout('diagonal' as any)).toThrow(/Invalid page layout/)
  })

  it('setPageGapPreset connected removes space between pages', () => {
    const s = new Store()
    s.normalizePages('remote')
    s.addPage()
    s.setPageGapPreset('connected')
    expect(s.pageGap()).toBe(0)
    expect(s.pages()[1].y).toBe(DEFAULT_PAGE_HEIGHT)
    s.adjustPageGap(16)
    expect(s.pageGap()).toBe(16)
    expect(s.pages()[1].y).toBe(DEFAULT_PAGE_HEIGHT + 16)
  })
})
