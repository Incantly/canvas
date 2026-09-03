import { describe, expect, it } from 'vitest'
import { Store } from '../../src/store.js'
import {
  hitShape,
  localBounds,
  pageBounds,
  hitTopShape,
  isShapeCreateTool,
  isCursorTool,
  isTypeTool,
} from '../../src/utils/shapes/hit.js'
import {
  createDrawShape,
  createGeoShape,
  createLineishShape,
  createTextShape,
  geoFromDrag,
  isTinyGeo,
  isTinyLineish,
  packedPtsToDrawLocal,
  clampTextPlain,
  TEXT_SHAPE_MAX_CHARS,
} from '../../src/utils/shapes/create.js'
import { canPutShape, shapeRenderable } from '../../src/utils/shapes/validate.js'
import {
  DEFAULT_CAMERA,
  pageToScreen,
  panCamera,
  pinchCamera,
  screenToPage,
  zoomAt,
  clampCameraZoom,
  CAMERA_ZOOM_MIN,
} from '../../src/utils/shapes/camera.js'
import { geoSvgPath, lineSvgPath, arrowHeadPath } from '../../src/utils/shapes/svg-path.js'
import { hitShape as hitFromHeadless, localBounds as lbHeadless } from '../../src/headless.js'

const geo = (over: Record<string, unknown> = {}, props: Record<string, unknown> = {}) =>
  ({
    id: 'g1',
    typeName: 'shape',
    type: 'geo',
    x: 10,
    y: 10,
    rot: 0,
    z: 1,
    parentId: 'page:1',
    props: {
      geo: 'rectangle',
      w: 100,
      h: 50,
      color: 'black',
      size: 'm',
      dash: 'solid',
      fill: 'none',
      font: 'draw',
      ...props,
    },
    ...over,
  }) as const

describe('bounds', () => {
  it('geo localBounds is its box; pageBounds adds position', () => {
    expect(localBounds(geo() as any)).toEqual({ x: 0, y: 0, w: 100, h: 50 })
    expect(pageBounds(geo() as any)).toEqual({ x: 10, y: 10, w: 100, h: 50 })
  })

  it('line bounds include negative deltas and arrow bend', () => {
    const line: any = {
      id: 'l',
      typeName: 'shape',
      type: 'line',
      x: 0,
      y: 0,
      rot: 0,
      z: 1,
      props: { dx: -40, dy: 30, size: 'm', color: 'black' },
    }
    expect(localBounds(line)).toEqual({ x: -40, y: 0, w: 40, h: 30 })
    const arrow: any = { ...line, type: 'arrow', props: { ...line.props, bend: 10 } }
    expect(localBounds(arrow).w).toBeGreaterThan(40)
  })
})

describe('hit testing', () => {
  const store = new Store()

  it('unfilled geo hits only near the edge', () => {
    const s = geo() as any
    expect(hitShape(s, 10, 10, 4, store)).toBe(true)
    expect(hitShape(s, 60, 35, 4, store)).toBe(false)
  })

  it('filled geo hits anywhere inside', () => {
    const s = geo({}, { fill: 'solid' }) as any
    expect(hitShape(s, 60, 35, 4, store)).toBe(true)
  })

  it('line hits along its length within tolerance', () => {
    const line: any = {
      id: 'l',
      typeName: 'shape',
      type: 'line',
      x: 0,
      y: 0,
      rot: 0,
      z: 1,
      props: { dx: 100, dy: 0, size: 'm', color: 'black', dash: 'solid' },
    }
    expect(hitShape(line, 50, 3, 4, store)).toBe(true)
    expect(hitShape(line, 50, 30, 4, store)).toBe(false)
  })

  it('picks the topmost overlapping shape', () => {
    const a = geo({ id: 'a', z: 1, x: 0, y: 0 }, { fill: 'solid', w: 80, h: 80 }) as any
    const b = geo({ id: 'b', z: 2, x: 0, y: 0 }, { fill: 'solid', w: 80, h: 80 }) as any
    expect(hitTopShape([a, b], 20, 20, 4)?.id).toBe('b')
  })

  it('rejects NaN coordinates', () => {
    expect(hitShape(geo() as any, Number.NaN, 10, 4)).toBe(false)
  })
})

describe('create helpers', () => {
  it('builds line/geo/text records', () => {
    const line = createLineishShape({
      id: 'l1',
      type: 'arrow',
      parentId: 'page:1',
      z: 1,
      x: 0,
      y: 0,
      dx: 40,
      dy: 10,
      color: 'blue',
      size: 'm',
    })
    expect(line.type).toBe('arrow')
    const box = geoFromDrag({ x: 10, y: 10 }, { x: 0, y: 0 })
    expect(box).toEqual({ x: 0, y: 0, w: 10, h: 10 })
    const g = createGeoShape({
      id: 'g',
      parentId: 'page:1',
      z: 2,
      ...box,
      geo: 'ellipse',
      color: 'black',
      size: 's',
    })
    expect(g.type).toBe('geo')
    expect((g.props as any).geo).toBe('ellipse')
    const t = createTextShape({
      id: 't',
      parentId: 'page:1',
      z: 3,
      x: 8,
      y: 8,
      color: 'black',
      size: 'm',
      text: 'hello',
    })
    expect(t.type).toBe('text')
  })

  it('drops tiny line/geo at the given zoom', () => {
    expect(isTinyLineish(0.5, 0, 1)).toBe(true)
    expect(isTinyLineish(40, 0, 1)).toBe(false)
    expect(isTinyGeo(1, 1, 1)).toBe(true)
    expect(isTinyGeo(40, 10, 1)).toBe(false)
  })

  it('converts packed ink pts to draw-shape local pts', () => {
    const packed = packedPtsToDrawLocal([10, 20, 0.5, 14, 24, 0.5])
    expect(packed).toEqual({ x: 10, y: 20, pts: [0, 0, 0.5, 4, 4, 0.5] })
    const draw = createDrawShape({
      id: 'd',
      parentId: 'page:1',
      z: 1,
      kind: 'draw',
      pts: [10, 20, 0.5, 14, 24, 0.5],
      color: 'black',
      size: 'm',
    })
    expect(draw?.x).toBe(10)
    expect((draw?.props as any).pts[0]).toBe(0)
  })

  it('caps huge text pastes', () => {
    const huge = 'a'.repeat(TEXT_SHAPE_MAX_CHARS + 50)
    expect(clampTextPlain(huge).length).toBe(TEXT_SHAPE_MAX_CHARS)
  })

  it('rejects NaN geo for put', () => {
    const bad: any = {
      id: 'x',
      typeName: 'shape',
      type: 'geo',
      x: Number.NaN,
      y: 0,
      rot: 0,
      z: 1,
      parentId: 'page:1',
      props: { geo: 'rectangle', w: 10, h: 10, color: 'black', size: 'm', dash: 'solid', fill: 'none' },
    }
    expect(shapeRenderable(bad)).toBe(false)
    expect(canPutShape(createGeoShape({
      id: 'ok',
      parentId: 'page:1',
      z: 1,
      x: 0,
      y: 0,
      w: 20,
      h: 20,
      geo: 'rectangle',
      color: 'black',
      size: 'm',
    }), new Set(['page:1']))).toBe(true)
    expect(canPutShape(createGeoShape({
      id: 'ok',
      parentId: 'missing',
      z: 1,
      x: 0,
      y: 0,
      w: 20,
      h: 20,
      geo: 'rectangle',
      color: 'black',
      size: 'm',
    }), new Set(['page:1']))).toBe(false)
  })
})

describe('camera', () => {
  it('round-trips screen and page', () => {
    const cam = { x: 10, y: 20, z: 2 }
    const page = screenToPage(40, 80, cam)
    const back = pageToScreen(page.x, page.y, cam)
    expect(back.x).toBeCloseTo(40)
    expect(back.y).toBeCloseTo(80)
  })

  it('pan and pinch keep a world point under the fingers', () => {
    const moved = panCamera(DEFAULT_CAMERA, 20, 0)
    expect(moved.x).toBeGreaterThan(DEFAULT_CAMERA.x)
    const start = { camera: { x: 0, y: 0, z: 1 }, dist: 100, center: { x: 50, y: 50 } }
    const next = pinchCamera(start, { dist: 200, center: { x: 50, y: 50 } })
    expect(next.z).toBe(2)
    const z = zoomAt({ x: 0, y: 0, z: 1 }, 100, 100, 2)
    expect(z.z).toBe(2)
    expect(clampCameraZoom(0)).toBe(CAMERA_ZOOM_MIN)
  })
})

describe('svg paths', () => {
  it('emits closed geo and line/arrow commands', () => {
    expect(geoSvgPath('rectangle', 10, 8)).toMatch(/^M /)
    expect(geoSvgPath('rectangle', 10, 8)).toMatch(/Z$/)
    expect(lineSvgPath(10, 0, 0)).toBe('M 0 0 L 10 0')
    expect(arrowHeadPath(10, 0, 0, 'm')).toMatch(/^M /)
  })
})

describe('headless re-export', () => {
  it('exposes hit helpers without canvas', () => {
    expect(typeof hitFromHeadless).toBe('function')
    expect(lbHeadless(geo() as any).w).toBe(100)
    expect(isShapeCreateTool('geo')).toBe(true)
    expect(isShapeCreateTool('draw')).toBe(false)
    expect(isCursorTool('select')).toBe(true)
    expect(isTypeTool('type')).toBe(true)
    expect(isTypeTool('select')).toBe(false)
  })
})
