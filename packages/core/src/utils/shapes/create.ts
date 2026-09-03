import type {
  ColorId,
  DashId,
  FillId,
  FontId,
  GeoId,
  ShapeRecord,
  SizeId,
} from '../../types/index.js'
import { emptyDocument, textToBlocks } from '../../rich-text/document.js'
import { GEO_IDS } from '../../palette.js'

export const TEXT_SHAPE_MAX_CHARS = 256 * 1024
export const DEFAULT_TEXT_BOX_W = 200
export const DEFAULT_TEXT_BOX_H = 96

export function clampTextPlain(text: string): string {
  const s = String(text ?? '')
  if (s.length <= TEXT_SHAPE_MAX_CHARS) return s
  return s.slice(0, TEXT_SHAPE_MAX_CHARS)
}

export function isTinyLineish(dx: number, dy: number, zoom: number): boolean {
  const z = Math.max(0.01, zoom)
  return Math.hypot(dx, dy) < 2 / z
}

export function isTinyGeo(w: number, h: number, zoom: number): boolean {
  const z = Math.max(0.01, zoom)
  return Math.max(Math.abs(w), Math.abs(h)) < 2 / z
}

export function geoFromDrag(
  origin: { x: number; y: number },
  current: { x: number; y: number },
): { x: number; y: number; w: number; h: number } {
  const w = current.x - origin.x
  const h = current.y - origin.y
  return {
    x: Math.min(origin.x, origin.x + w),
    y: Math.min(origin.y, origin.y + h),
    w: Math.max(1, Math.abs(w)),
    h: Math.max(1, Math.abs(h)),
  }
}

export function packedPtsToDrawLocal(pts: number[]): {
  x: number
  y: number
  pts: number[]
} | null {
  if (!Array.isArray(pts) || pts.length < 3) return null
  const n = Math.floor(pts.length / 3) * 3
  if (n < 3) return null
  const x = pts[0]
  const y = pts[1]
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  const local: number[] = []
  for (let i = 0; i < n; i += 3) {
    const px = pts[i]
    const py = pts[i + 1]
    const pr = pts[i + 2]
    if (!Number.isFinite(px) || !Number.isFinite(py)) return null
    local.push(px - x, py - y, Number.isFinite(pr) ? pr : 0.5)
  }
  return { x, y, pts: local }
}

export function sanitizeGeoId(raw: unknown): GeoId {
  if (typeof raw === 'string' && (GEO_IDS as readonly string[]).includes(raw)) return raw as GeoId
  return 'rectangle'
}

export function createLineishShape(opts: {
  id: string
  type: 'line' | 'arrow'
  parentId: string
  z: number
  x: number
  y: number
  dx: number
  dy: number
  color: ColorId
  size: SizeId
  dash?: DashId
  bend?: number
}): ShapeRecord {
  return {
    id: opts.id,
    typeName: 'shape',
    type: opts.type,
    parentId: opts.parentId,
    x: opts.x,
    y: opts.y,
    rot: 0,
    z: opts.z,
    props: {
      dx: opts.dx,
      dy: opts.dy,
      bend: opts.bend ?? 0,
      color: opts.color,
      size: opts.size,
      dash: opts.dash && opts.dash !== 'draw' ? opts.dash : 'solid',
    },
  }
}

export function createGeoShape(opts: {
  id: string
  parentId: string
  z: number
  x: number
  y: number
  w: number
  h: number
  geo: GeoId
  color: ColorId
  size: SizeId
  dash?: DashId
  fill?: FillId
  font?: FontId
}): ShapeRecord {
  return {
    id: opts.id,
    typeName: 'shape',
    type: 'geo',
    parentId: opts.parentId,
    x: opts.x,
    y: opts.y,
    rot: 0,
    z: opts.z,
    props: {
      geo: sanitizeGeoId(opts.geo),
      w: Math.max(1, opts.w),
      h: Math.max(1, opts.h),
      color: opts.color,
      size: opts.size,
      dash: opts.dash ?? 'solid',
      fill: opts.fill ?? 'none',
      font: opts.font ?? 'draw',
    },
  }
}

export function createTextShape(opts: {
  id: string
  parentId: string
  z: number
  x: number
  y: number
  color: ColorId
  size: SizeId
  font?: FontId
  text?: string
  w?: number
  h?: number
  fill?: FillId
}): ShapeRecord {
  const plain = clampTextPlain(opts.text ?? '')
  return {
    id: opts.id,
    typeName: 'shape',
    type: 'text',
    parentId: opts.parentId,
    x: opts.x,
    y: opts.y,
    rot: 0,
    z: opts.z,
    props: {
      blocks: plain ? textToBlocks(plain) : emptyDocument(),
      color: opts.color,
      size: opts.size,
      font: opts.font ?? 'sans',
      autosize: false,
      scale: 1,
      w: opts.w ?? DEFAULT_TEXT_BOX_W,
      h: opts.h ?? DEFAULT_TEXT_BOX_H,
      fill: opts.fill ?? 'none',
    },
  }
}

export function createDrawShape(opts: {
  id: string
  parentId: string
  z: number
  kind: 'draw' | 'highlight'
  pts: number[]
  color: ColorId
  size: SizeId
  dash?: DashId
}): ShapeRecord | null {
  const packed = packedPtsToDrawLocal(opts.pts)
  if (!packed) return null
  return {
    id: opts.id,
    typeName: 'shape',
    type: opts.kind,
    parentId: opts.parentId,
    x: packed.x,
    y: packed.y,
    rot: 0,
    z: opts.z,
    props: {
      pts: packed.pts,
      color: opts.color,
      size: opts.size,
      done: true,
      ...(opts.kind === 'draw' && opts.dash ? { dash: opts.dash } : {}),
    },
  }
}
