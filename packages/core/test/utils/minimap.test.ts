import { describe, expect, it } from 'vitest'
import {
  CAMERA_ZOOM_MAX,
  CAMERA_ZOOM_MIN,
  cameraToCenter,
  cameraViewport,
  clampCameraZoom,
  createTextShape,
  fitMinimap,
  hitResizeCorner,
  localBounds,
  miniToWorld,
  minimapWorld,
  paperVisibleRect,
  resizeBox,
  worldToMini,
} from '../../src/headless.js'

describe('minimap', () => {
  it('maps the camera viewport in world space', () => {
    const vp = cameraViewport({ x: 10, y: 20, z: 2 }, 200, 100)
    expect(vp).toEqual({ x: -10, y: -20, w: 100, h: 50 })
  })

  it('fits world into the mini rect and round-trips a point', () => {
    const world = { x: 0, y: 0, w: 400, h: 200 }
    const layout = fitMinimap(world, 120, 90)
    expect(layout.scale).toBeCloseTo(120 / 400)
    const mini = worldToMini(200, 100, world, layout)
    const back = miniToWorld(mini.x, mini.y, world, layout)
    expect(back.x).toBeCloseTo(200)
    expect(back.y).toBeCloseTo(100)
  })

  it('pads content and viewport into one world', () => {
    const world = minimapWorld({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 40, h: 30 }, {
      x: 0,
      y: 0,
      w: 100,
      h: 100,
    })
    expect(world.w).toBeGreaterThan(40)
    expect(world.h).toBeGreaterThan(30)
  })

  it('maps a notes scroll offset onto the paper', () => {
    const vis = paperVisibleRect(
      { x: 0, y: 100 },
      { w: 200, h: 400 },
      { x: 0, y: 16 },
      1,
      { w: 816, h: 1056 },
    )
    expect(vis.y).toBe(84)
    expect(vis.h).toBe(400)
  })

  it('centers the camera on a world point', () => {
    const cam = cameraToCenter(50, 80, 200, 100, 2)
    expect(cam.z).toBe(2)
    expect(cam.x).toBe(200 / 4 - 50)
    expect(cam.y).toBe(100 / 4 - 80)
  })
})

describe('resizeBox', () => {
  it('grows from the SE corner and clamps min size', () => {
    const se = resizeBox({ x: 10, y: 10, w: 40, h: 40 }, 'se', { x: 80, y: 70 }, 40, 36)
    expect(se).toEqual({ x: 10, y: 10, w: 70, h: 60 })
    const tiny = resizeBox({ x: 10, y: 10, w: 40, h: 40 }, 'nw', { x: 45, y: 45 }, 40, 36)
    expect(tiny.w).toBe(40)
    expect(tiny.h).toBe(36)
  })

  it('hits corner handles', () => {
    const b = { x: 0, y: 0, w: 100, h: 50 }
    expect(hitResizeCorner(b, 0, 0, 8)).toBe('nw')
    expect(hitResizeCorner(b, 100, 50, 8)).toBe('se')
    expect(hitResizeCorner(b, 50, 25, 8)).toBeNull()
  })
})

describe('text box bounds', () => {
  it('honors explicit w/h and default fill none', () => {
    const t = createTextShape({
      id: 't',
      parentId: 'page:1',
      z: 1,
      x: 8,
      y: 8,
      color: 'black',
      size: 'm',
      w: 240,
      h: 120,
    })
    expect((t.props as { fill?: string; autosize?: boolean }).fill).toBe('none')
    expect((t.props as { autosize?: boolean }).autosize).toBe(false)
    expect(localBounds(t)).toEqual({ x: 0, y: 0, w: 240, h: 120 })
  })
})

describe('zoom clamp', () => {
  it('clamps to 0.25–4', () => {
    expect(clampCameraZoom(0)).toBe(CAMERA_ZOOM_MIN)
    expect(clampCameraZoom(99)).toBe(CAMERA_ZOOM_MAX)
    expect(CAMERA_ZOOM_MIN).toBe(0.25)
    expect(CAMERA_ZOOM_MAX).toBe(4)
  })
})
