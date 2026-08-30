import type {
  ShapeRecord,
  ShapeProps,
  Bounds,
  Theme,
  Store,
  FontId,
  SizeId,
  DashId,
  FillId,
  GeoId,
  ColorId,
  AssetRecord,
} from './types/index.js'
import {
  SIZES,
  INK_SIZES,
  FONT_SIZES,
  NOTE_FONT_SIZES,
  FONTS,
  HIGHLIGHT_ALPHA,
  HIGHLIGHT_SCALE,
} from './palette.js'
import {
  ptsBounds,
  rotWith,
  distToPolyline,
  pointInPolygon,
  pointInEllipse,
  geoPolygon,
  ellipsePolygon,
  cloudPolygon,
  CLOUD_START,
  CLOUD_CURVES,
  wobblePolyline,
  traceSmooth,
  segIntersectsBounds,
  boundsIntersect,
  boundsContain,
} from './geometry.js'
import { strokeOutline } from './freehand.js'

export const NOTE_W = 200
const NOTE_PAD = 20
const LABEL_PAD = 12

const SEMI: Record<'light' | 'dark', string> = {
  light: 'rgba(249, 247, 241, 0.85)',
  dark: 'rgba(32, 30, 25, 0.85)',
}

type AnyProps = Record<string, any>
const asProps = (p: ShapeProps): AnyProps => p as AnyProps

export function localBounds(shape: ShapeRecord): Bounds {
  const p = asProps(shape.props)
  switch (shape.type) {
    case 'draw':
    case 'highlight': {
      const b = ptsBounds(p.pts, 3)
      const m = SIZES[p.size as SizeId] * (shape.type === 'highlight' ? HIGHLIGHT_SCALE / 2 : 0.75)
      return { x: b.x - m, y: b.y - m, w: b.w + m * 2, h: b.h + m * 2 }
    }
    case 'arrow':
    case 'line': {
      const bend = p.bend || 0
      const x = Math.min(0, p.dx) - Math.abs(bend)
      const y = Math.min(0, p.dy) - Math.abs(bend)
      return {
        x,
        y,
        w: Math.abs(p.dx) + Math.abs(bend) * 2,
        h: Math.abs(p.dy) + Math.abs(bend) * 2,
      }
    }
    case 'text': {
      const l = textLayout(shape)
      return { x: 0, y: 0, w: l.w, h: l.h }
    }
    case 'note': {
      const l = noteLayout(shape)
      return { x: 0, y: 0, w: NOTE_W * (p.scale || 1), h: l.boxH * (p.scale || 1) }
    }
    case 'image':
      return { x: 0, y: 0, w: p.w, h: p.h }
    case 'geo':
    default:
      return { x: 0, y: 0, w: p.w || 1, h: p.h || 1 }
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

type LayoutValue = TextLayout | NoteLayout | GeoLabelLayout
const outlineCache = new WeakMap<AnyProps, Path2D>()
const geoPathCache = new WeakMap<AnyProps, Path2D>()
const layoutCache = new WeakMap<AnyProps, LayoutValue>()

let measureCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null
const measurer = (): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null => {
  if (!measureCtx)
    measureCtx = (
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(1, 1)
        : document.createElement('canvas')
    ).getContext('2d')
  return measureCtx
}

const baselineCache = new Map<string, number>()
export function lineBaseline(font: string, fontSize: number, lh: number): number {
  const key = `${fontSize}|${lh}|${font}`
  let b = baselineCache.get(key)
  if (b === undefined) {
    const ctx = measurer()!
    ctx.font = `500 ${fontSize}px ${font}`
    const m = ctx.measureText('Mg')
    const a = m.fontBoundingBoxAscent ?? fontSize * 0.8
    const d = m.fontBoundingBoxDescent ?? fontSize * 0.2
    b = (lh - (a + d)) / 2 + a
    baselineCache.set(key, b)
  }
  return b
}

interface WrapLine {
  text: string
  w: number
}

function wrapLines(text: string, font: string, fontSize: number, maxW: number): WrapLine[] {
  const ctx = measurer()!
  ctx.font = `500 ${fontSize}px ${font}`
  const out: WrapLine[] = []
  for (const para of String(text ?? '').split('\n')) {
    if (para === '') {
      out.push({ text: '', w: 0 })
      continue
    }
    let line = ''
    for (const word of para.split(/(\s+)/)) {
      const test = line + word
      if (line && maxW && ctx.measureText(test).width > maxW) {
        out.push({ text: line, w: ctx.measureText(line).width })
        line = word.trimStart()
      } else line = test
    }
    out.push({ text: line, w: ctx.measureText(line).width })
  }
  return out
}

interface TextLayout {
  lines: WrapLine[]
  fontSize: number
  font: string
  lh: number
  w: number
  h: number
}

export function textLayout(shape: ShapeRecord): TextLayout {
  const p = asProps(shape.props)
  const hit = layoutCache.get(p)
  if (hit) return hit as TextLayout
  const fontSize = FONT_SIZES[p.size as SizeId] * (p.scale || 1)
  const font = FONTS[(p.font || 'draw') as FontId]
  const lh = fontSize * 1.32
  const maxW = p.autosize === false && p.w ? p.w : 0
  const lines = wrapLines(p.text, font, fontSize, maxW)
  const w = maxW || Math.max(8, ...lines.map((l) => l.w)) + 2
  const l: TextLayout = {
    lines,
    fontSize,
    font,
    lh,
    w,
    h: Math.max(lh, lines.length * lh),
  }
  layoutCache.set(p, l)
  return l
}

interface NoteLayout {
  lines: WrapLine[]
  fontSize: number
  font: string
  lh: number
  textH: number
  boxH: number
}

export function noteLayout(shape: ShapeRecord): NoteLayout {
  const p = asProps(shape.props)
  const hit = layoutCache.get(p)
  if (hit) return hit as NoteLayout
  const fontSize = NOTE_FONT_SIZES[p.size as SizeId]
  const font = FONTS[(p.font || 'draw') as FontId]
  const lh = fontSize * 1.35
  const lines = wrapLines(p.text, font, fontSize, NOTE_W - NOTE_PAD * 2)
  const textH = lines.length * lh
  const l: NoteLayout = {
    lines,
    fontSize,
    font,
    lh,
    textH,
    boxH: Math.max(NOTE_W, textH + NOTE_PAD * 2),
  }
  layoutCache.set(p, l)
  return l
}

interface GeoLabelLayout {
  lines: WrapLine[]
  fontSize: number
  font: string
  lh: number
  textH: number
}

function geoLabelLayout(shape: ShapeRecord): GeoLabelLayout | null {
  const p = asProps(shape.props)
  if (!p.label) return null
  const key = p
  const cached = layoutCache.get(key)
  if (cached) return cached as GeoLabelLayout
  const fontSize = FONT_SIZES[(p.labelSize || 's') as SizeId]
  const font = FONTS[(p.font || 'draw') as FontId]
  const lh = fontSize * 1.3
  const lines = wrapLines(p.label, font, fontSize, Math.max(24, p.w - LABEL_PAD * 2))
  const layout: GeoLabelLayout = { lines, fontSize, font, lh, textH: lines.length * lh }
  layoutCache.set(key, layout)
  return layout
}

interface ImgEntry {
  img: HTMLImageElement
  ready: boolean
}

const imgCache = new Map<string, ImgEntry>()
export function assetImage(
  store: Store,
  assetId: string,
  onReady?: () => void
): HTMLImageElement | null {
  let e = imgCache.get(assetId)
  if (e) return e.ready ? e.img : null
  const asset = store.asset(assetId)
  if (!asset) return null
  const img = new Image()
  e = { img, ready: false }
  imgCache.set(assetId, e)
  img.onload = () => {
    e!.ready = true
    onReady && onReady()
  }
  img.src = (asset as AssetRecord).src
  return null
}

const dashFor = (dash: DashId, w: number): number[] | null =>
  dash === 'dashed' ? [w * 3.2, w * 2.6] : dash === 'dotted' ? [0.01, w * 2.5] : null

function strokeStyled(ctx: CanvasRenderingContext2D, dash: DashId, w: number): void {
  ctx.lineWidth = w
  ctx.lineJoin = 'round'
  ctx.lineCap = dash === 'dotted' ? 'round' : 'round'
  const d = dashFor(dash, w)
  ctx.setLineDash(d || [])
}

function geoPath(shape: ShapeRecord): Path2D {
  const p = asProps(shape.props)
  let path = geoPathCache.get(p)
  if (path) return path
  path = new Path2D()
  if (p.geo === 'ellipse') {
    if (p.dash === 'draw') {
      const pts = wobblePolyline(ellipsePolygon(p.w, p.h, 40), shape.id, {
        step: 18,
        amp: Math.min(2, p.w / 40 + 0.6),
      })
      traceSmooth(path as any, pts, true)
      path.closePath()
    } else {
      path.ellipse(
        p.w / 2,
        p.h / 2,
        Math.max(0.5, p.w / 2),
        Math.max(0.5, p.h / 2),
        0,
        0,
        Math.PI * 2
      )
    }
  } else if (p.geo === 'cloud') {
    if (p.dash === 'draw') {
      const pts = wobblePolyline(cloudPolygon(p.w, p.h), shape.id, {
        step: 18,
        amp: Math.min(2, (p.w + p.h) / 160 + 0.6),
      })
      traceSmooth(path as any, pts, true)
      path.closePath()
    } else {
      path.moveTo(CLOUD_START[0] * p.w, CLOUD_START[1] * p.h)
      for (const [c1x, c1y, c2x, c2y, ex, ey] of CLOUD_CURVES) {
        path.bezierCurveTo(c1x * p.w, c1y * p.h, c2x * p.w, c2y * p.h, ex * p.w, ey * p.h)
      }
      path.closePath()
    }
  } else {
    const poly = geoPolygon(p.geo, p.w, p.h)
    if (p.dash === 'draw') {
      const pts = wobblePolyline(poly, shape.id, {
        step: 22,
        amp: Math.min(2.2, (p.w + p.h) / 160 + 0.6),
      })
      const n = pts.length / 2
      path.moveTo(pts[0], pts[1])
      for (let i = 1; i < n; i++) path.lineTo(pts[i * 2], pts[i * 2 + 1])
      path.closePath()
    } else {
      const n = poly.length / 2
      path.moveTo(poly[0], poly[1])
      for (let i = 1; i < n; i++) path.lineTo(poly[i * 2], poly[i * 2 + 1])
      path.closePath()
    }
  }
  geoPathCache.set(p, path)
  return path
}

const patternCache = new Map<string, CanvasPattern | null>()
function hatchPattern(
  ctx: CanvasRenderingContext2D,
  colorHex: string,
  themeId: string
): CanvasPattern | null {
  const key = colorHex + '|' + themeId
  let pat = patternCache.get(key)
  if (pat) return pat
  const c = document.createElement('canvas')
  c.width = c.height = 8
  const pctx = c.getContext('2d')!
  pctx.strokeStyle = colorHex
  pctx.globalAlpha = 0.55
  pctx.lineWidth = 1.4
  pctx.beginPath()
  pctx.moveTo(-2, 6)
  pctx.lineTo(6, -2)
  pctx.moveTo(2, 10)
  pctx.lineTo(10, 2)
  pctx.stroke()
  pat = ctx.createPattern(c, 'repeat')
  patternCache.set(key, pat)
  return pat
}

function fillPath(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  p: AnyProps,
  theme: Theme
): void {
  if (!p.fill || p.fill === 'none') return
  if (p.fill === 'semi') ctx.fillStyle = SEMI[theme.id as 'light' | 'dark']
  else if (p.fill === 'pattern')
    ctx.fillStyle = hatchPattern(ctx, theme.colors[p.color as ColorId].stroke, theme.id) as string | CanvasPattern
  else ctx.fillStyle = theme.colors[p.color as ColorId].fill
  ctx.fill(path)
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  layout: GeoLabelLayout | null,
  color: string,
  w: number,
  h: number
): void {
  if (!layout) return
  ctx.font = `500 ${layout.fontSize}px ${layout.font}`
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  let y = h / 2 - layout.textH / 2 + lineBaseline(layout.font, layout.fontSize, layout.lh)
  for (const line of layout.lines) {
    ctx.fillText(line.text, w / 2, y)
    y += layout.lh
  }
}

function drawPath(shape: ShapeRecord): Path2D {
  const p = asProps(shape.props)
  if (p.done) {
    const hit = outlineCache.get(p)
    if (hit) return hit
  }
  const path = new Path2D()
  const outline = strokeOutline(p.pts, { size: INK_SIZES[p.size as SizeId], simulate: !p.isPen })
  traceSmooth(path as any, outline, true)
  path.closePath()
  if (p.done) outlineCache.set(p, path)
  return path
}

export interface DrawShapeOpts {
  theme: Theme
  store: Store
  zoom?: number
  ghost?: boolean
  onAssetLoad?: () => void
  hideText?: 'label' | 'text'
}

export function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: ShapeRecord,
  opts: DrawShapeOpts
): void {
  const { theme } = opts
  const p = asProps(shape.props)
  const col = theme.colors[(p.color || 'black') as ColorId]
  ctx.save()
  if (opts.ghost) ctx.globalAlpha = 0.3
  const lb = localBounds(shape)
  if (shape.rot) {
    const cx = shape.x + lb.x + lb.w / 2
    const cy = shape.y + lb.y + lb.h / 2
    ctx.translate(cx, cy)
    ctx.rotate(shape.rot)
    ctx.translate(-cx, -cy)
  }
  ctx.translate(shape.x, shape.y)

  switch (shape.type) {
    case 'draw': {
      if (p.dash && p.dash !== 'draw') {
        ctx.strokeStyle = col.stroke
        strokeStyled(ctx, p.dash, SIZES[p.size as SizeId])
        ctx.beginPath()
        const flat: number[] = []
        for (let i = 0; i < p.pts.length; i += 3) flat.push(p.pts[i], p.pts[i + 1])
        traceSmooth(ctx, flat)
        ctx.stroke()
        ctx.setLineDash([])
      } else {
        ctx.fillStyle = col.stroke
        ctx.fill(drawPath(shape))
      }
      break
    }
    case 'highlight': {
      ctx.globalAlpha = (opts.ghost ? 0.3 : 1) * HIGHLIGHT_ALPHA
      ctx.globalCompositeOperation = theme.id === 'dark' ? 'lighten' : 'multiply'
      ctx.strokeStyle = col.stroke
      ctx.lineWidth = SIZES[p.size as SizeId] * HIGHLIGHT_SCALE
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      const flat: number[] = []
      for (let i = 0; i < p.pts.length; i += 3) flat.push(p.pts[i], p.pts[i + 1])
      traceSmooth(ctx, flat)
      ctx.stroke()
      break
    }
    case 'geo': {
      const path = geoPath(shape)
      fillPath(ctx, path, p, theme)
      ctx.strokeStyle = col.stroke
      strokeStyled(ctx, p.dash, SIZES[p.size as SizeId])
      ctx.stroke(path)
      ctx.setLineDash([])
      if (opts.hideText !== 'label') drawLabel(ctx, geoLabelLayout(shape), col.stroke, p.w, p.h)
      break
    }
    case 'arrow':
    case 'line': {
      const w = SIZES[p.size as SizeId]
      ctx.strokeStyle = col.stroke
      strokeStyled(ctx, p.dash, w)
      const bend = p.bend || 0
      const len = Math.hypot(p.dx, p.dy) || 1
      const nx = -p.dy / len,
        ny = p.dx / len
      const cx2 = p.dx / 2 + nx * bend * 2
      const cy2 = p.dy / 2 + ny * bend * 2
      ctx.beginPath()
      ctx.moveTo(0, 0)
      if (bend) ctx.quadraticCurveTo(cx2, cy2, p.dx, p.dy)
      else ctx.lineTo(p.dx, p.dy)
      ctx.stroke()
      ctx.setLineDash([])
      if (shape.type === 'arrow') {
        const tx = p.dx - cx2,
          ty = p.dy - cy2
        const ta = bend ? Math.atan2(ty, tx) : Math.atan2(p.dy, p.dx)
        const hl = Math.min(Math.max(w * 3.2, 12), len * 0.4)
        ctx.beginPath()
        ctx.moveTo(p.dx - Math.cos(ta - 0.5) * hl, p.dy - Math.sin(ta - 0.5) * hl)
        ctx.lineTo(p.dx, p.dy)
        ctx.lineTo(p.dx - Math.cos(ta + 0.5) * hl, p.dy - Math.sin(ta + 0.5) * hl)
        ctx.lineWidth = w
        ctx.lineCap = 'round'
        ctx.stroke()
      }
      break
    }
    case 'text': {
      const l = textLayout(shape)
      ctx.font = `500 ${l.fontSize}px ${l.font}`
      ctx.fillStyle = col.stroke
      ctx.textBaseline = 'alphabetic'
      const align: string = p.align || 'start'
      ctx.textAlign = align === 'middle' ? 'center' : align === 'end' ? 'right' : 'left'
      const ax = align === 'middle' ? l.w / 2 : align === 'end' ? l.w : 0
      let y = lineBaseline(l.font, l.fontSize, l.lh)
      if (opts.hideText !== 'text') {
        for (const line of l.lines) {
          ctx.fillText(line.text, ax, y)
          y += l.lh
        }
      }
      break
    }
    case 'note': {
      const l = noteLayout(shape)
      const s = p.scale || 1
      ctx.scale(s, s)
      ctx.fillStyle = col.note
      ctx.beginPath()
      ;(ctx as any).roundRect(0, 0, NOTE_W, l.boxH, 6)
      ctx.shadowColor = 'rgba(20, 16, 8, 0.22)'
      ctx.shadowBlur = 10
      ctx.shadowOffsetY = 4
      ctx.fill()
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
      ctx.shadowOffsetY = 0
      ctx.font = `500 ${l.fontSize}px ${l.font}`
      ctx.fillStyle = theme.noteText
      ctx.textAlign = 'center'
      ctx.textBaseline = 'alphabetic'
      const bl = lineBaseline(l.font, l.fontSize, l.lh)
      let y = Math.max(NOTE_PAD, l.boxH / 2 - l.textH / 2) + bl
      if (opts.hideText !== 'text') {
        for (const line of l.lines) {
          ctx.fillText(line.text, NOTE_W / 2, y)
          y += l.lh
        }
      }
      break
    }
    case 'image': {
      const img = assetImage(opts.store, p.assetId, opts.onAssetLoad)
      if (img) {
        ctx.beginPath()
        ;(ctx as any).roundRect(0, 0, p.w, p.h, 4)
        ctx.save()
        ctx.clip()
        ctx.drawImage(img, 0, 0, p.w, p.h)
        ctx.restore()
      } else {
        ctx.fillStyle = SEMI[theme.id as 'light' | 'dark']
        ctx.beginPath()
        ;(ctx as any).roundRect(0, 0, p.w, p.h, 4)
        ctx.fill()
      }
      break
    }
  }
  ctx.restore()
}

export function hitShape(
  shape: ShapeRecord,
  px: number,
  py: number,
  tol: number,
  store: Store
): boolean {
  const b = pageBounds(shape)
  const wide = tol + SIZES[(asProps(shape.props).size || 'm') as SizeId] * 2
  if (
    !boundsContain(
      { x: b.x - wide, y: b.y - wide, w: b.w + wide * 2, h: b.h + wide * 2 },
      px,
      py
    )
  )
    return false
  const l = toLocal(shape, px, py)
  const p = asProps(shape.props)
  switch (shape.type) {
    case 'draw':
      return distToPolyline(l.x, l.y, p.pts, 3) <= tol + SIZES[p.size as SizeId] * 0.9
    case 'highlight':
      return (
        distToPolyline(l.x, l.y, p.pts, 3) <= tol + (SIZES[p.size as SizeId] * HIGHLIGHT_SCALE) / 2
      )
    case 'geo': {
      const edgeTol = tol + SIZES[p.size as SizeId]
      if (p.geo === 'ellipse') {
        const inside = pointInEllipse(l.x, l.y, p.w / 2, p.h / 2, p.w / 2, p.h / 2)
        if (p.fill !== 'none' || p.label) return inside || nearEllipseEdge(l, p, edgeTol)
        return nearEllipseEdge(l, p, edgeTol)
      }
      const poly = geoPolygon(p.geo, p.w, p.h)
      if (p.fill !== 'none' || p.label) {
        if (pointInPolygon(l.x, l.y, poly)) return true
      }
      return distToPolyline(l.x, l.y, poly, 2, true) <= edgeTol
    }
    case 'arrow':
    case 'line': {
      const pts = sampleLinePts(p, p.bend || 0)
      return distToPolyline(l.x, l.y, pts, 2) <= tol + SIZES[p.size as SizeId]
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
  return false
}

const nearEllipseEdge = (l: { x: number; y: number }, p: AnyProps, tol: number): boolean => {
  const rx = p.w / 2,
    ry = p.h / 2
  if (rx <= 0 || ry <= 0) return false
  const outer = pointInEllipse(l.x, l.y, rx, ry, rx + tol, ry + tol)
  const inner = pointInEllipse(
    l.x,
    l.y,
    rx,
    ry,
    Math.max(0.5, rx - tol),
    Math.max(0.5, ry - tol)
  )
  return outer && !inner
}

export const sampleLinePts = (p: AnyProps, bend: number): number[] => {
  if (!bend) return [0, 0, p.dx, p.dy]
  const len = Math.hypot(p.dx, p.dy) || 1
  const nx = -p.dy / len,
    ny = p.dx / len
  const cx = p.dx / 2 + nx * bend * 2
  const cy = p.dy / 2 + ny * bend * 2
  const pts: number[] = []
  for (let i = 0; i <= 16; i++) {
    const t = i / 16
    const mt = 1 - t
    pts.push(
      mt * mt * 0 + 2 * mt * t * cx + t * t * p.dx,
      mt * mt * 0 + 2 * mt * t * cy + t * t * p.dy
    )
  }
  return pts
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
    pts = p.pts
    stride = 3
  } else if (shape.type === 'arrow' || shape.type === 'line') pts = sampleLinePts(p, p.bend || 0)
  else if (shape.type === 'geo') {
    pts = geoPolygon(p.geo, p.w, p.h)
    if (pointInPolygon(local.x + local.w / 2, local.y + local.h / 2, pts)) return true
  }
  if (!pts) return true
  const n = Math.floor(pts.length / stride)
  if (n === 1) return boundsContain(local, pts[0], pts[1])
  for (let i = 0; i < n - 1; i++) {
    if (
      segIntersectsBounds(
        pts[i * stride],
        pts[i * stride + 1],
        pts[(i + 1) * stride],
        pts[(i + 1) * stride + 1],
        local
      )
    )
      return true
  }
  if (shape.type === 'geo' && n > 2) {
    if (
      segIntersectsBounds(
        pts[(n - 1) * stride],
        pts[(n - 1) * stride + 1],
        pts[0],
        pts[1],
        local
      )
    )
      return true
  }
  return false
}

export function scaleShape(shape: ShapeRecord, sx: number, sy: number): ShapeRecord {
  const p = asProps(shape.props)
  switch (shape.type) {
    case 'draw':
    case 'highlight': {
      const pts = p.pts.slice()
      for (let i = 0; i < pts.length; i += 3) {
        pts[i] *= sx
        pts[i + 1] *= sy
      }
      return { ...shape, props: { ...p, pts } } as ShapeRecord
    }
    case 'geo':
      return {
        ...shape,
        props: { ...p, w: Math.max(1, p.w * sx), h: Math.max(1, p.h * sy) },
      } as ShapeRecord
    case 'arrow':
    case 'line':
      return {
        ...shape,
        props: {
          ...p,
          dx: p.dx * sx,
          dy: p.dy * sy,
          ...(p.bend ? { bend: p.bend * Math.sqrt(Math.abs(sx * sy)) } : {}),
        },
      } as ShapeRecord
    case 'image':
      return {
        ...shape,
        props: { ...p, w: Math.max(1, p.w * sx), h: Math.max(1, p.h * sy) },
      } as ShapeRecord
    case 'text': {
      const s = Math.sqrt(Math.abs(sx * sy))
      return {
        ...shape,
        props: {
          ...p,
          scale: Math.max(0.2, (p.scale || 1) * s),
          ...(p.autosize === false && p.w ? { w: p.w * sx } : {}),
        },
      } as ShapeRecord
    }
    case 'note': {
      const s = Math.sqrt(Math.abs(sx * sy))
      return { ...shape, props: { ...p, scale: Math.max(0.3, (p.scale || 1) * s) } } as ShapeRecord
    }
    default:
      return shape
  }
}
