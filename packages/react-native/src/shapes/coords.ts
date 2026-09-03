import type { Camera } from '@incantly/canvas/headless'
import { screenToPage } from '@incantly/canvas/headless'
import { clampToPaper, screenToPaper } from '../ink/coords.js'

export type ShapeSpace = 'paper' | 'world'

export function eventToShapePoint(
  locationX: number,
  locationY: number,
  space: ShapeSpace,
  zoom: number,
  paperW: number,
  paperH: number,
  camera: Camera | undefined,
  clamp: boolean,
): { x: number; y: number } | null {
  if (!Number.isFinite(locationX) || !Number.isFinite(locationY)) return null
  if (space === 'world') {
    const cam = camera ?? { x: 0, y: 0, z: Math.max(0.01, zoom) }
    const p = screenToPage(locationX, locationY, cam)
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null
    return p
  }
  const hit = screenToPaper(locationX, locationY, zoom, paperW, paperH)
  if (hit) return hit
  if (!clamp) return null
  const z = Math.max(0.01, zoom)
  return clampToPaper(locationX / z, locationY / z, paperW, paperH)
}
