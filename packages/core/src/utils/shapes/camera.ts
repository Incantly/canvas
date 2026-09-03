import type { Camera } from '../../types/base.js'
import { clamp } from '../../geometry.js'

export const CAMERA_ZOOM_MIN = 0.25
export const CAMERA_ZOOM_MAX = 4

export const DEFAULT_CAMERA: Camera = { x: 48, y: 48, z: 1 }

export function clampCameraZoom(z: number): number {
  if (!Number.isFinite(z)) return 1
  return clamp(z, CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX)
}

export function sanitizeCamera(raw: unknown): Camera {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_CAMERA }
  const c = raw as Record<string, unknown>
  return {
    x: Number.isFinite(c.x) ? (c.x as number) : DEFAULT_CAMERA.x,
    y: Number.isFinite(c.y) ? (c.y as number) : DEFAULT_CAMERA.y,
    z: clampCameraZoom(c.z as number),
  }
}

/** Match web `Editor.screenToPage`. */
export function screenToPage(sx: number, sy: number, camera: Camera): { x: number; y: number } {
  const z = clampCameraZoom(camera.z)
  return { x: sx / z - camera.x, y: sy / z - camera.y }
}

/** Match web `Editor.pageToScreen`. */
export function pageToScreen(px: number, py: number, camera: Camera): { x: number; y: number } {
  const z = clampCameraZoom(camera.z)
  return { x: (px + camera.x) * z, y: (py + camera.y) * z }
}

/** Match web `Editor.pan` — deltas are in screen pixels. */
export function panCamera(camera: Camera, dxScreen: number, dyScreen: number): Camera {
  const z = clampCameraZoom(camera.z)
  return {
    x: camera.x + dxScreen / z,
    y: camera.y + dyScreen / z,
    z,
  }
}

/** Keep the world point under (sx, sy) stable while scaling z. */
export function zoomAt(camera: Camera, sx: number, sy: number, mult: number): Camera {
  const p = screenToPage(sx, sy, camera)
  const z = clampCameraZoom(camera.z * mult)
  return { z, x: sx / z - p.x, y: sy / z - p.y }
}

/** Two-finger pinch: keep the world point under the original midpoint, follow the new midpoint. */
export function pinchCamera(
  start: { camera: Camera; dist: number; center: { x: number; y: number } },
  now: { dist: number; center: { x: number; y: number } },
): Camera {
  const dist = Math.max(1, now.dist)
  const z = clampCameraZoom(start.camera.z * (dist / Math.max(1, start.dist)))
  const p0 = {
    x: start.center.x / start.camera.z - start.camera.x,
    y: start.center.y / start.camera.z - start.camera.y,
  }
  return { z, x: now.center.x / z - p0.x, y: now.center.y / z - p0.y }
}
