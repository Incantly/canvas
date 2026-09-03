/**
 * DOM-free bounds + hit testing for shapes (RN + web).
 * Text/note boxes use estimated height — no canvas measureText.
 */
import type {
  Bounds,
  FillId,
  GeoId,
  ShapeProps,
  ShapeRecord,
  SizeId,
} from '../../types/index.js'
import {
  FONT_SIZES,
  HIGHLIGHT_SCALE,
  NOTE_FONT_SIZES,
  SIZES,
} from '../../palette.js'
import {
  boundsContain,
  boundsIntersect,
  distToPolyline,
  geoPolygon,
  pointInEllipse,
  pointInPolygon,
  ptsBounds,
  rotWith,
  segIntersectsBounds,
} from '../../geometry.js'
import { getShapeBlocks } from '../../rich-text/document.js'

export const NOTE_W = 200

type AnyProps = Record<string, unknown>
const asProps = (p: ShapeProps): AnyProps => p as unknown as AnyProps

function sizeOf(p: AnyProps): SizeId {
  const s = p.size
  return s === 's' || s === 'l' || s === 'xl' ? s : 'm'
}

function finite(n: unknown, fallback = 0): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback
}

function estimatedTextSize(p: AnyProps): { w: number; h: number } {
  const scale = finite(p.scale, 1) || 1
  const fontSize = (FONT_SIZES[sizeOf(p)] ?? FONT_SIZES.m) * scale
  const lh = fontSize * 1.35
  let lines = 1
  try {
    const blocks = getShapeBlocks(p)
    lines = Math.max(1, blocks.length)
  } catch {
    lines = 1
  }
  if (finite(p.w) > 0 && finite(p.h) > 0) {
    return { w: finite(p.w), h: finite(p.h) }
  }
  const w =
    p.autosize === false && finite(p.w) > 0 ? finite(p.w) : Math.max(120, fontSize * 8)
  return { w, h: lines * lh }
}

function estimatedNoteSize(p: AnyProps): { w: number; h: number } {
  const scale = finite(p.scale, 1) || 1
  const fontSize = NOTE_FONT_SIZES[sizeOf(p)] ?? NOTE_FONT_SIZES.m
  const lh = fontSize * 1.35
  let lines = 1
  try {
    const blocks = getShapeBlocks(p)
    lines = Math.max(1, blocks.length)
  } catch {
    lines = 1
  }
  const boxH = Math.max(80, lines * lh + 40)
  return { w: NOTE_W * scale, h: boxH * scale }
}

export function localBounds(shape: ShapeRecord): Bounds {
  const p = asProps(shape.props)
  switch (shape.type) {
    case 'draw':
    case 'highlight': {
      const b = ptsBounds((p.pts as number[]) ?? [], 3)
      const m = SIZES[sizeOf(p)] * (shape.type === 'highlight' ? HIGHLIGHT_SCALE / 2 : 0.75)
      return { x: b.x - m, y: b.y - m, w: b.w + m * 2, h: b.h + m * 2 }
    }
    case 'arrow':
    case 'line': {
      const bend = finite(p.bend)
      const dx = finite(p.dx)
      const dy = finite(p.dy)
      const x = Math.min(0, dx) - Math.abs(bend)
      const y = Math.min(0, dy) - Math.abs(bend)
      return {
        x,
        y,
        w: Math.abs(dx) + Math.abs(bend) * 2,
        h: Math.abs(dy) + Math.abs(bend) * 2,
      }
    }
    case 'text': {
      const s = estimatedTextSize(p)
      return { x: 0, y: 0, w: s.w, h: s.h }
    }
    case 'note': {
      const s = estimatedNoteSize(p)
      return { x: 0, y: 0, w: s.w, h: s.h }
    }
    case 'image':
      return { x: 0, y: 0, w: Math.max(1, finite(p.w, 1)), h: Math.max(1, finite(p.h, 1)) }
    case 'geo':
    default:
      return { x: 0, y: 0, w: Math.max(1, finite(p.w, 1)), h: Math.max(1, finite(p.h, 1)) }
  }
}

export function pageBounds(shape: ShapeRecord): Bounds {
  const lb = localBounds(shape)
  if (!shape.rot) return { x: shape.x + lb.x, y: shape.y + lb.y, w: lb.w, h: lb.h }
  const cx = shape.x + lb.x + lb.w / 2
  const cy = shape.y + lb.y + lb.h / 2
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity
  for (const [px, py] of [
    [shape.x + lb.x, shape.y + lb.y],
    [shape.x + lb.x + lb.w, shape.y + lb.y],
    [shape.x + lb.x + lb.w, shape.y + lb.y + lb.h],
    [shape.x + lb.x, shape.y + lb.y + lb.h],
  ] as [number, number][]) {
    const r = rotWith(px, py, cx, cy, shape.rot)
    if (r.x < minX) minX = r.x
    if (r.x > maxX) maxX = r.x
    if (r.y < minY) minY = r.y
    if (r.y > maxY) maxY = r.y
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export function toLocal(shape: ShapeRecord, px: number, py: number): { x: number; y: number } {
  if (shape.rot) {
    const lb = localBounds(shape)
    const cx = shape.x + lb.x + lb.w / 2
    const cy = shape.y + lb.y + lb.h / 2
    const r = rotWith(px, py, cx, cy, -shape.rot)
    return { x: r.x - shape.x, y: r.y - shape.y }
  }
  return { x: px - shape.x, y: py - shape.y }
}

const nearEllipseEdge = (
  l: { x: number; y: number },
  w: number,
  h: number,
  tol: number,
): boolean => {
  const rx = w / 2
  const ry = h / 2
  if (rx <= 0 || ry <= 0) return false
  const outer = pointInEllipse(l.x, l.y, rx, ry, rx + tol, ry + tol)
  const inner = pointInEllipse(
    l.x,
    l.y,
    rx,
    ry,
    Math.max(0.5, rx - tol),
    Math.max(0.5, ry - tol),
  )
  return outer && !inner
}

export const sampleLinePts = (p: AnyProps, bend: number): number[] => {
  const dx = finite(p.dx)
  const dy = finite(p.dy)
  if (!bend) return [0, 0, dx, dy]
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const cx = dx / 2 + nx * bend * 2
  const cy = dy / 2 + ny * bend * 2
  const pts: number[] = []
  for (let i = 0; i <= 16; i++) {
    const t = i / 16
    const mt = 1 - t
    pts.push(mt * mt * 0 + 2 * mt * t * cx + t * t * dx, mt * mt * 0 + 2 * mt * t * cy + t * t * dy)
  }
  return pts
}

/** `store` is unused; kept so web `hitShape(shape, x, y, tol, store)` keeps compiling. */
export function hitShape(
  shape: ShapeRecord,
  px: number,
  py: number,
  tol: number,
  _store?: unknown,
): boolean {
  if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(tol)) return false
  const b = pageBounds(shape)
  const wide = tol + SIZES[sizeOf(asProps(shape.props))] * 2
  if (
    !boundsContain(
      { x: b.x - wide, y: b.y - wide, w: b.w + wide * 2, h: b.h + wide * 2 },
      px,
      py,
    )
  )
    return false
  const l = toLocal(shape, px, py)
  const p = asProps(shape.props)
  switch (shape.type) {
    case 'draw':
      return distToPolyline(l.x, l.y, (p.pts as number[]) ?? [], 3) <= tol + SIZES[sizeOf(p)] * 0.9
    case 'highlight':
      return (
        distToPolyline(l.x, l.y, (p.pts as number[]) ?? [], 3) <=
        tol + (SIZES[sizeOf(p)] * HIGHLIGHT_SCALE) / 2
      )
    case 'geo': {
      const w = Math.max(1, finite(p.w, 1))
      const h = Math.max(1, finite(p.h, 1))
      const edgeTol = tol + SIZES[sizeOf(p)]
      const geo = (p.geo as GeoId) || 'rectangle'
      if (geo === 'ellipse') {
        const inside = pointInEllipse(l.x, l.y, w / 2, h / 2, w / 2, h / 2)
        if ((p.fill as FillId) !== 'none' || p.label) return inside || nearEllipseEdge(l, w, h, edgeTol)
        return nearEllipseEdge(l, w, h, edgeTol)
      }
      const poly = geoPolygon(geo, w, h)
      if ((p.fill as FillId) !== 'none' || p.label) {
        if (pointInPolygon(l.x, l.y, poly)) return true
      }
      return distToPolyline(l.x, l.y, poly, 2, true) <= edgeTol
    }
    case 'arrow':
    case 'line': {
      const pts = sampleLinePts(p, finite(p.bend))
      return distToPolyline(l.x, l.y, pts, 2) <= tol + SIZES[sizeOf(p)]
    }
    case 'text':
    case 'note':
    case 'image': {
      const lb = localBounds(shape)
      return (
        l.x >= lb.x - tol &&
        l.x <= lb.x + lb.w + tol &&
        l.y >= lb.y - tol &&
        l.y <= lb.y + lb.h + tol
      )
    }
  }
}

export function marqueeHits(shape: ShapeRecord, rect: Bounds): boolean {
  const b = pageBounds(shape)
  if (!boundsIntersect(b, rect)) return false
  if (['text', 'note', 'image'].includes(shape.type)) return true
  if (shape.type === 'geo' && asProps(shape.props).fill !== 'none') return true
  if (shape.rot) return true
  const p = asProps(shape.props)
  const local: Bounds = { x: rect.x - shape.x, y: rect.y - shape.y, w: rect.w, h: rect.h }
  let pts: number[] | null = null
  let stride = 2
  if (shape.type === 'draw' || shape.type === 'highlight') {
    pts = (p.pts as number[]) ?? []
    stride = 3
  } else if (shape.type === 'arrow' || shape.type === 'line') pts = sampleLinePts(p, finite(p.bend))
  else if (shape.type === 'geo') {
    pts = geoPolygon((p.geo as GeoId) || 'rectangle', Math.max(1, finite(p.w, 1)), Math.max(1, finite(p.h, 1)))
    if (pointInPolygon(local.x + local.w / 2, local.y + local.h / 2, pts)) return true
  }
  if (!pts) return true
  const n = Math.floor(pts.length / stride)
  if (n === 1) return boundsContain(local, pts[0]!, pts[1]!)
  for (let i = 0; i < n - 1; i++) {
    if (
      segIntersectsBounds(
        pts[i * stride]!,
        pts[i * stride + 1]!,
        pts[(i + 1) * stride]!,
        pts[(i + 1) * stride + 1]!,
        local,
      )
    )
      return true
  }
  if (shape.type === 'geo' && n > 2) {
    if (segIntersectsBounds(pts[(n - 1) * stride]!, pts[(n - 1) * stride + 1]!, pts[0]!, pts[1]!, local))
      return true
  }
  return false
}

export function hitTopShape(
  shapes: readonly ShapeRecord[],
  px: number,
  py: number,
  tol: number,
): ShapeRecord | null {
  const sorted = shapes.slice().sort((a, b) => b.z - a.z)
  for (const s of sorted) {
    if (hitShape(s, px, py, tol)) return s
  }
  return null
}

export function isShapeCreateTool(tool: string): tool is 'line' | 'arrow' | 'geo' {
  return tool === 'line' || tool === 'arrow' || tool === 'geo'
}

export function isCursorTool(tool: string): boolean {
  return tool === 'select'
}

export function isTypeTool(tool: string): boolean {
  return tool === 'type'
}
