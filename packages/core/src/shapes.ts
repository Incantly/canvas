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
  themeOf,
} from './palette.js'
import {
  geoPolygon,
  ellipsePolygon,
  cloudPolygon,
  CLOUD_START,
  CLOUD_CURVES,
  wobblePolyline,
  traceSmooth,
} from './geometry.js'
import {
  NOTE_W,
  localBounds,
  pageBounds,
  toLocal,
  hitShape,
  sampleLinePts,
  marqueeHits,
} from './utils/shapes/hit.js'
import { strokeOutline } from './freehand.js'
import {
  getShapeBlocks,
  layoutRichText,
  drawRichTextLayout,
  type RichTextLayout,
} from './rich-text/index.js'

export {
  NOTE_W,
  localBounds,
  pageBounds,
  toLocal,
  hitShape,
  sampleLinePts,
  marqueeHits,
}

export const NOTE_PAD = 20
const LABEL_PAD = 12

const SEMI: Record<'light' | 'dark', string> = {
  light: 'rgba(249, 247, 241, 0.85)',
  dark: 'rgba(32, 30, 25, 0.85)',
}

type AnyProps = Record<string, any>
const asProps = (p: ShapeProps): AnyProps => p as AnyProps

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
    ).getContext('2d') as CanvasRenderingContext2D | null
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

interface TextLayout extends RichTextLayout {}

export function textLayout(shape: ShapeRecord): TextLayout {
  const p = asProps(shape.props)
  const hit = layoutCache.get(p)
  if (hit) return hit as TextLayout
  const fontSize = FONT_SIZES[p.size as SizeId] * (p.scale || 1)
  const maxW = p.autosize === false && p.w ? p.w : 0
  const blocks = getShapeBlocks(p)
  const l = layoutRichText({
    blocks,
    maxW,
    defaultFont: (p.font || 'sans') as FontId,
    baseFontSize: fontSize,
    defaultColor: (p.color || 'black') as ColorId,
    theme: themeOf('light'),
    align: p.align === 'center' ? 'center' : p.align === 'right' ? 'right' : 'left',
  })
  layoutCache.set(p, l)
  return l
}

/** Theme-aware layout for rendering. */
export function textLayoutThemed(shape: ShapeRecord, theme: Theme): TextLayout {
  const p = asProps(shape.props)
  const fontSize = FONT_SIZES[p.size as SizeId] * (p.scale || 1)
  const maxW = p.autosize === false && p.w ? p.w : 0
  const blocks = getShapeBlocks(p)
  return layoutRichText({
    blocks,
    maxW,
    defaultFont: (p.font || 'sans') as FontId,
    baseFontSize: fontSize,
    defaultColor: (p.color || 'black') as ColorId,
    theme,
    align: p.align === 'center' ? 'center' : p.align === 'right' ? 'right' : 'left',
  })
}

interface NoteLayout {
  layout: RichTextLayout
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
  const blocks = getShapeBlocks(p)
  const layout = layoutRichText({
    blocks,
    maxW: NOTE_W - NOTE_PAD * 2,
    defaultFont: (p.font || 'draw') as FontId,
    baseFontSize: fontSize,
    defaultColor: 'black',
    theme: themeOf('light'),
    align: 'left',
  })
  const textH = layout.h
  const l: NoteLayout = {
    layout,
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
      const l = textLayoutThemed(shape, theme)
      if (opts.hideText !== 'text') {
        drawRichTextLayout(ctx, l)
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
      if (opts.hideText !== 'text') {
        const noteLayoutThemed = layoutRichText({
          blocks: getShapeBlocks(p),
          maxW: NOTE_W - NOTE_PAD * 2,
          defaultFont: (p.font || 'draw') as FontId,
          baseFontSize: l.fontSize,
          defaultColor: 'black',
          theme,
          align: 'left',
        })
        ctx.save()
        ctx.translate(NOTE_PAD, Math.max(NOTE_PAD, l.boxH / 2 - l.textH / 2))
        for (const run of noteLayoutThemed.runs) {
          run.color = theme.noteText
        }
        drawRichTextLayout(ctx, noteLayoutThemed)
        ctx.restore()
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
