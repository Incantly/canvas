import type { GeoId, ShapeRecord } from '../../types/index.js'
import { GEO_IDS } from '../../palette.js'
import { localBounds } from './hit.js'

const SHAPE_TYPES = new Set([
  'draw',
  'highlight',
  'geo',
  'arrow',
  'line',
  'text',
  'note',
  'image',
])

function finite(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

/** Skip painting corrupt records; do not strip them from the snapshot. */
export function shapeRenderable(shape: ShapeRecord | null | undefined): boolean {
  if (!shape || shape.typeName !== 'shape') return false
  if (!SHAPE_TYPES.has(shape.type)) return false
  if (!finite(shape.x) || !finite(shape.y) || !finite(shape.z)) return false
  if (shape.rot && !finite(shape.rot)) return false
  const p = shape.props as unknown as Record<string, unknown>
  if (!p || typeof p !== 'object') return false
  switch (shape.type) {
    case 'line':
    case 'arrow':
      return finite(p.dx) && finite(p.dy)
    case 'geo': {
      const geo = p.geo
      if (typeof geo !== 'string' || !(GEO_IDS as readonly string[]).includes(geo)) return false
      return finite(p.w) && finite(p.h) && (p.w as number) > 0 && (p.h as number) > 0
    }
    case 'draw':
    case 'highlight':
      return Array.isArray(p.pts) && (p.pts as number[]).length >= 3
    case 'text':
    case 'note':
      return Array.isArray((p as { blocks?: unknown }).blocks)
    case 'image':
      return finite(p.w) && finite(p.h)
    default:
      return false
  }
}

export function parentPageExists(parentId: string | undefined, pageIds: ReadonlySet<string>): boolean {
  if (!parentId) return false
  return pageIds.has(parentId)
}

/** True when create payload is safe to `store.put`. */
export function canPutShape(
  shape: ShapeRecord,
  pageIds: ReadonlySet<string>,
): boolean {
  if (!shapeRenderable(shape)) return false
  if (!parentPageExists(shape.parentId, pageIds)) return false
  const b = localBounds(shape)
  return finite(b.w) && finite(b.h)
}

export function isGeoId(v: unknown): v is GeoId {
  return typeof v === 'string' && (GEO_IDS as readonly string[]).includes(v)
}
