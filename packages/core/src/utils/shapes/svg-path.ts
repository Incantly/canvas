import type { DashId, GeoId, SizeId } from '../../types/base.js'
import { geoPolygon, ellipsePolygon } from '../../geometry.js'
import { SIZES } from '../../palette.js'
import { sampleLinePts } from './hit.js'

function xyPath(pts: number[], closed: boolean): string {
  if (pts.length < 2) return ''
  let d = `M ${pts[0]} ${pts[1]}`
  for (let i = 2; i + 1 < pts.length; i += 2) {
    d += ` L ${pts[i]} ${pts[i + 1]}`
  }
  if (closed) d += ' Z'
  return d
}

export function geoSvgPath(geo: GeoId, w: number, h: number): string {
  const ww = Math.max(1, w)
  const hh = Math.max(1, h)
  if (geo === 'ellipse') return xyPath(ellipsePolygon(ww, hh, 48), true)
  return xyPath(geoPolygon(geo, ww, hh), true)
}

export function lineSvgPath(dx: number, dy: number, bend = 0): string {
  if (!bend) return `M 0 0 L ${dx} ${dy}`
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const cx = dx / 2 + nx * bend * 2
  const cy = dy / 2 + ny * bend * 2
  return `M 0 0 Q ${cx} ${cy} ${dx} ${dy}`
}

export function arrowHeadPath(dx: number, dy: number, bend: number, size: SizeId): string {
  const w = SIZES[size] ?? SIZES.m
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const cx = dx / 2 + nx * bend * 2
  const cy = dy / 2 + ny * bend * 2
  const tx = dx - cx
  const ty = dy - cy
  const ta = bend ? Math.atan2(ty, tx) : Math.atan2(dy, dx)
  const hl = Math.min(Math.max(w * 3.2, 12), len * 0.4)
  const x1 = dx - Math.cos(ta - 0.5) * hl
  const y1 = dy - Math.sin(ta - 0.5) * hl
  const x2 = dx - Math.cos(ta + 0.5) * hl
  const y2 = dy - Math.sin(ta + 0.5) * hl
  return `M ${x1} ${y1} L ${dx} ${dy} L ${x2} ${y2}`
}

export function strokeDashArray(dash: DashId | undefined, size: SizeId): string | undefined {
  const w = SIZES[size] ?? SIZES.m
  if (dash === 'dashed') return `${w * 3},${w * 2}`
  if (dash === 'dotted') return `${w},${w * 1.5}`
  return undefined
}

export { sampleLinePts }
