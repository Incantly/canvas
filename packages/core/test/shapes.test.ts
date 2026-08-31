// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { localBounds, pageBounds, hitShape, marqueeHits, scaleShape, textLayout } from '../src/shapes.js'
import { Store } from '../src/store.js'

const geo = (over: any = {}, props: any = {}): any => ({
  id: 'g1', typeName: 'shape', type: 'geo', x: 10, y: 10, rot: 0, z: 1,
  props: { geo: 'rectangle', w: 100, h: 50, color: 'black', size: 'm', dash: 'solid', fill: 'none', font: 'draw', ...props },
  ...over,
})

describe('bounds', () => {
  it('geo localBounds is its box; pageBounds adds position', () => {
    expect(localBounds(geo())).toEqual({ x: 0, y: 0, w: 100, h: 50 })
    expect(pageBounds(geo())).toEqual({ x: 10, y: 10, w: 100, h: 50 })
  })

  it('rotation grows the axis-aligned page bounds', () => {
    const r = pageBounds(geo({ rot: Math.PI / 4 }))
    expect(r.w).toBeGreaterThan(100)
    expect(r.h).toBeGreaterThan(50)
    expect(r.x + r.w / 2).toBeCloseTo(60)
    expect(r.y + r.h / 2).toBeCloseTo(35)
  })

  it('draw bounds cover the points plus stroke margin', () => {
    const d: any = {
      id: 'd1', typeName: 'shape', type: 'draw', x: 0, y: 0, rot: 0, z: 1,
      props: { pts: [0, 0, 0.5, 50, 20, 0.5], size: 'm', color: 'black', done: true },
    }
    const b = localBounds(d)
    expect(b.x).toBeLessThan(0)
    expect(b.w).toBeGreaterThan(50)
  })

  it('line bounds include negative deltas and arrow bend', () => {
    const line: any = { id: 'l', typeName: 'shape', type: 'line', x: 0, y: 0, rot: 0, z: 1, props: { dx: -40, dy: 30, size: 'm', color: 'black' } }
    expect(localBounds(line)).toEqual({ x: -40, y: 0, w: 40, h: 30 })
    const arrow: any = { ...line, type: 'arrow', props: { ...line.props, bend: 10 } }
    expect(localBounds(arrow).w).toBeGreaterThan(40)
    const bentLine: any = { ...line, props: { ...line.props, bend: 10 } }
    expect(localBounds(bentLine).w).toBeGreaterThan(40)
  })
})

describe('hit testing', () => {
  const store = new Store()

  it('unfilled geo hits only near the edge', () => {
    const s = geo()
    expect(hitShape(s, 10, 10, 4, store)).toBe(true)
    expect(hitShape(s, 60, 35, 4, store)).toBe(false)
  })

  it('filled geo hits anywhere inside', () => {
    const s = geo({}, { fill: 'solid' })
    expect(hitShape(s, 60, 35, 4, store)).toBe(true)
  })

  it('ellipse edge vs inside honors fill', () => {
    const s = geo({}, { geo: 'ellipse' })
    expect(hitShape(s, 60, 35, 4, store)).toBe(false)
    expect(hitShape(s, 10 + 50, 10, 4, store)).toBe(true)
  })

  it('line hits along its length within tolerance', () => {
    const line: any = { id: 'l', typeName: 'shape', type: 'line', x: 0, y: 0, rot: 0, z: 1, props: { dx: 100, dy: 0, size: 'm', color: 'black', dash: 'solid' } }
    expect(hitShape(line, 50, 3, 4, store)).toBe(true)
    expect(hitShape(line, 50, 30, 4, store)).toBe(false)
  })

  it('rotated geo hit-tests in rotated space', () => {
    const s = geo({ rot: Math.PI / 2 }, { w: 100, h: 10, fill: 'solid' })
    const cx = 10 + 50, cy = 10 + 5
    expect(hitShape(s, cx, cy + 40, 4, store)).toBe(true)
    expect(hitShape(s, cx + 40, cy, 4, store)).toBe(false)
  })
})

describe('marquee', () => {
  it('solid-bodied shapes select on bounds overlap; strokes need a graze', () => {
    const note: any = { id: 'n', typeName: 'shape', type: 'note', x: 0, y: 0, rot: 0, z: 1, props: { blocks: [{ type: 'paragraph', content: [{ text: 'hi' }] }], size: 'm', color: 'yellow', font: 'draw' } }
    expect(marqueeHits(note, { x: -5, y: -5, w: 20, h: 20 })).toBe(true)

    const line: any = { id: 'l', typeName: 'shape', type: 'line', x: 0, y: 0, rot: 0, z: 1, props: { dx: 100, dy: 100, size: 'm', color: 'black' } }
    expect(marqueeHits(line, { x: 60, y: 5, w: 30, h: 20 })).toBe(false)
    expect(marqueeHits(line, { x: 40, y: 30, w: 20, h: 20 })).toBe(true)
  })
})

describe('scaleShape', () => {
  it('scales geo and image boxes', () => {
    expect(scaleShape(geo(), 2, 0.5).props).toMatchObject({ w: 200, h: 25 })
    const img: any = { id: 'i', typeName: 'shape', type: 'image', x: 0, y: 0, rot: 0, z: 1, props: { w: 40, h: 30, assetId: 'a' } }
    expect(scaleShape(img, 0.5, 0.5).props).toMatchObject({ w: 20, h: 15 })
  })

  it('scales draw points in place', () => {
    const d: any = { id: 'd', typeName: 'shape', type: 'draw', x: 0, y: 0, rot: 0, z: 1, props: { pts: [10, 10, 0.5], size: 'm' } }
    expect(scaleShape(d, 2, 3).props.pts).toEqual([20, 30, 0.5])
  })

  it('text and note scale via the scale prop, floored', () => {
    const t: any = { id: 't', typeName: 'shape', type: 'text', x: 0, y: 0, rot: 0, z: 1, props: { blocks: [{ type: 'paragraph', content: [{ text: 'x' }] }], size: 'm', scale: 1 } }
    expect(scaleShape(t, 2, 2).props.scale).toBeCloseTo(2)
    expect(scaleShape(t, 0.01, 0.01).props.scale).toBe(0.2)
  })

  it('line deltas scale; arrow bend scales geometrically', () => {
    const a: any = { id: 'a', typeName: 'shape', type: 'arrow', x: 0, y: 0, rot: 0, z: 1, props: { dx: 10, dy: 10, bend: 4 } }
    const s = scaleShape(a, 2, 2)
    expect(s.props.dx).toBe(20)
    expect((s.props as any).bend).toBeCloseTo(8)
  })
})

describe('text layout', () => {
  it('wraps long text when autosize is off and width fixed', () => {
    const t: any = { id: 't', typeName: 'shape', type: 'text', x: 0, y: 0, rot: 0, z: 1, props: { blocks: [{ type: 'paragraph', content: [{ text: 'aaaa bbbb cccc dddd' }] }], size: 'm', autosize: false, w: 120, font: 'draw' } }
    const l: any = textLayout(t)
    expect(l.runs.length).toBeGreaterThan(0)
    expect(l.w).toBe(120)
  })

  it('caches per props object (identity)', () => {
    const t: any = { id: 't', typeName: 'shape', type: 'text', x: 0, y: 0, rot: 0, z: 1, props: { blocks: [{ type: 'paragraph', content: [{ text: 'hello' }] }], size: 'm' } }
    expect(textLayout(t)).toBe(textLayout(t))
  })

  it('empty and multi-line text still lay out', () => {
    const mk = (blocks: any[]): any =>
      textLayout({
        id: 't',
        typeName: 'shape',
        type: 'text',
        x: 0,
        y: 0,
        rot: 0,
        z: 1,
        props: { blocks, size: 'm' },
      } as any)
    expect(mk([{ type: 'paragraph', content: [{ text: '' }] }]).h).toBeGreaterThan(0)
    expect(mk([{ type: 'paragraph', content: [{ text: 'a' }] }, { type: 'paragraph', content: [{ text: 'b' }] }, { type: 'paragraph', content: [{ text: 'c' }] }]).h).toBeGreaterThan(
      mk([{ type: 'paragraph', content: [{ text: 'a' }] }]).h
    )
  })
})
