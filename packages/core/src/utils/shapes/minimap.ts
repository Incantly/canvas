import type { Bounds } from '../../types/base.js'
import type { ShapeRecord } from '../../types/models.js'
import { boundsUnion } from '../../geometry.js'
import { pageBounds } from './hit.js'
import { shapeRenderable } from './validate.js'

export const MINIMAP_PAD = 48

export function cameraViewport(
  camera: { x: number; y: number; z: number },
  viewW: number,
  viewH: number,
): Bounds {
  const z = Math.max(0.01, camera.z)
  return {
    x: -camera.x,
    y: -camera.y,
    w: Math.max(1, viewW / z),
    h: Math.max(1, viewH / z),
  }
}

export function shapesContentBounds(shapes: readonly ShapeRecord[]): Bounds | null {
  let b: Bounds | null = null
  for (const s of shapes) {
    if (!shapeRenderable(s)) continue
    b = boundsUnion(b, pageBounds(s))
  }
  return b
}

export function minimapWorld(
  content: Bounds | null,
  viewport: Bounds,
  fallback: Bounds,
): Bounds {
  const base = content ?? fallback
  const u = boundsUnion(base, viewport)
  return {
    x: u.x - MINIMAP_PAD,
    y: u.y - MINIMAP_PAD,
    w: Math.max(1, u.w + MINIMAP_PAD * 2),
    h: Math.max(1, u.h + MINIMAP_PAD * 2),
  }
}

export interface MinimapLayout {
  scale: number
  ox: number
  oy: number
  width: number
  height: number
}

/** Fit `world` into a mini rectangle, letterboxed. */
export function fitMinimap(world: Bounds, miniW: number, miniH: number): MinimapLayout {
  const scale = Math.min(miniW / Math.max(1, world.w), miniH / Math.max(1, world.h))
  const w = world.w * scale
  const h = world.h * scale
  return {
    scale,
    ox: (miniW - w) / 2,
    oy: (miniH - h) / 2,
    width: miniW,
    height: miniH,
  }
}

export function worldToMini(
  x: number,
  y: number,
  world: Bounds,
  layout: MinimapLayout,
): { x: number; y: number } {
  return {
    x: layout.ox + (x - world.x) * layout.scale,
    y: layout.oy + (y - world.y) * layout.scale,
  }
}

export function miniToWorld(
  mx: number,
  my: number,
  world: Bounds,
  layout: MinimapLayout,
): { x: number; y: number } {
  const s = layout.scale || 1
  return {
    x: world.x + (mx - layout.ox) / s,
    y: world.y + (my - layout.oy) / s,
  }
}

/** Camera so (worldX, worldY) sits at the view center. */
export function cameraToCenter(
  worldX: number,
  worldY: number,
  viewW: number,
  viewH: number,
  z: number,
): { x: number; y: number; z: number } {
  const zoom = Math.max(0.01, z)
  return {
    z: zoom,
    x: viewW / (2 * zoom) - worldX,
    y: viewH / (2 * zoom) - worldY,
  }
}

export type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se'

export function resizeBox(
  start: { x: number; y: number; w: number; h: number },
  corner: ResizeCorner,
  current: { x: number; y: number },
  minW = 40,
  minH = 36,
): { x: number; y: number; w: number; h: number } {
  let { x, y, w, h } = start
  const r = x + w
  const b = y + h
  if (corner === 'se') {
    w = current.x - x
    h = current.y - y
  } else if (corner === 'sw') {
    w = r - current.x
    h = current.y - y
    x = current.x
  } else if (corner === 'ne') {
    w = current.x - x
    h = b - current.y
    y = current.y
  } else {
    w = r - current.x
    h = b - current.y
    x = current.x
    y = current.y
  }
  if (w < minW) {
    if (corner === 'nw' || corner === 'sw') x = r - minW
    w = minW
  }
  if (h < minH) {
    if (corner === 'nw' || corner === 'ne') y = b - minH
    h = minH
  }
  return { x, y, w: Math.max(minW, w), h: Math.max(minH, h) }
}

const HANDLE = 14

/** Visible paper rect from a notes ScrollView, in page coordinates. */
export function paperVisibleRect(
  scroll: { x: number; y: number },
  view: { w: number; h: number },
  sheet: { x: number; y: number },
  zoom: number,
  page: { w: number; h: number },
): Bounds {
  const z = Math.max(0.01, zoom)
  const vis = {
    x: (scroll.x - sheet.x) / z,
    y: (scroll.y - sheet.y) / z,
    w: view.w / z,
    h: view.h / z,
  }
  const x = Math.max(0, vis.x)
  const y = Math.max(0, vis.y)
  const r = Math.min(page.w, vis.x + vis.w)
  const btm = Math.min(page.h, vis.y + vis.h)
  return { x, y, w: Math.max(1, r - x), h: Math.max(1, btm - y) }
}

export function hitResizeCorner(
  b: Bounds,
  px: number,
  py: number,
  slop: number,
): ResizeCorner | null {
  const s = Math.max(HANDLE, slop)
  const corners: { id: ResizeCorner; x: number; y: number }[] = [
    { id: 'nw', x: b.x, y: b.y },
    { id: 'ne', x: b.x + b.w, y: b.y },
    { id: 'sw', x: b.x, y: b.y + b.h },
    { id: 'se', x: b.x + b.w, y: b.y + b.h },
  ]
  for (const c of corners) {
    if (Math.abs(px - c.x) <= s && Math.abs(py - c.y) <= s) return c.id
  }
  return null
}
