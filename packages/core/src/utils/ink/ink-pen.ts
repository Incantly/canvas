import { HIGHLIGHT_ALPHA, HIGHLIGHT_SCALE, INK_SIZES, SIZES } from '../../palette.js'
import type { SizeId } from '../../types/base.js'
import { isReservedInkChromeId, sanitizeInkPenId } from '../../ink-pen-id.js'

export { isReservedInkChromeId, sanitizeInkPenId }

export type InkStrokeCap = 'round' | 'butt' | 'square'

/** How a host pen collects and paints a stroke. */
export interface InkPenStyle {
  /** Stored on the stroke so web can still paint without the host pen list. */
  kind: 'draw' | 'highlight'
  /** Multiplier on `SIZES[size]`. Defaults: 0.75 draw, `HIGHLIGHT_SCALE` highlight. */
  widthScale?: number
  /** Path opacity. Defaults: 1 draw, `HIGHLIGHT_ALPHA` highlight. */
  opacity?: number
  /** Vary width along the stroke from packed pressure samples. */
  pressureWidth?: boolean
  /** Pressure 0 → this fraction of base width. Default 0.35. */
  pressureMin?: number
  /** Pressure 1 → this fraction of base width. Default 1.2. */
  pressureMax?: number
  cap?: InkStrokeCap
}

export interface InkPenDefinition {
  id: string
  name: string
  style: InkPenStyle
}

export const DEFAULT_INK_PENS: readonly InkPenDefinition[] = [
  { id: 'draw', name: 'Pen', style: { kind: 'draw', widthScale: 0.75, cap: 'round' } },
  {
    id: 'highlight',
    name: 'Highlight',
    style: { kind: 'highlight', widthScale: HIGHLIGHT_SCALE, opacity: HIGHLIGHT_ALPHA, cap: 'round' },
  },
]

function clampNum(n: number, lo: number, hi: number, fallback: number): number {
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback
}

export function sanitizeInkPenStyle(raw: unknown): InkPenStyle | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Record<string, unknown>
  const kind = s.kind === 'highlight' ? 'highlight' : s.kind === 'draw' ? 'draw' : null
  if (!kind) return null
  const style: InkPenStyle = { kind }
  if (s.widthScale != null) {
    style.widthScale = clampNum(Number(s.widthScale), 0.05, 24, kind === 'highlight' ? HIGHLIGHT_SCALE : 0.75)
  }
  if (s.opacity != null) {
    style.opacity = clampNum(Number(s.opacity), 0, 1, kind === 'highlight' ? HIGHLIGHT_ALPHA : 1)
  }
  if (s.pressureWidth === true) style.pressureWidth = true
  if (s.pressureMin != null) style.pressureMin = clampNum(Number(s.pressureMin), 0.05, 8, 0.35)
  if (s.pressureMax != null) style.pressureMax = clampNum(Number(s.pressureMax), 0.05, 8, 1.2)
  if (s.cap === 'butt' || s.cap === 'square' || s.cap === 'round') style.cap = s.cap
  return style
}

function cloneDefaultPens(): InkPenDefinition[] {
  return DEFAULT_INK_PENS.map((p) => ({ id: p.id, name: p.name, style: { ...p.style } }))
}

/** Host `inkPens` list, or the built-in pen + highlighter. */
export function sanitizeInkPens(raw: unknown): InkPenDefinition[] {
  if (!Array.isArray(raw) || raw.length === 0) return cloneDefaultPens()
  const seen = new Set<string>()
  const out: InkPenDefinition[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const id = sanitizeInkPenId(rec.id)
    if (!id || seen.has(id)) continue
    const style = sanitizeInkPenStyle(rec.style)
    if (!style) continue
    const name =
      typeof rec.name === 'string' && rec.name.trim() ? rec.name.trim().slice(0, 40) : id
    seen.add(id)
    out.push({ id, name, style })
  }
  return out.length ? out : cloneDefaultPens()
}

export function resolveInkPen(
  pens: readonly InkPenDefinition[],
  id: string | undefined,
  kind?: 'draw' | 'highlight',
): InkPenDefinition {
  if (id) {
    const hit = pens.find((p) => p.id === id)
    if (hit) return hit
  }
  if (kind === 'highlight') {
    return (
      pens.find((p) => p.id === 'highlight') ??
      pens.find((p) => p.style.kind === 'highlight') ??
      DEFAULT_INK_PENS[1]!
    )
  }
  return pens.find((p) => p.id === 'draw') ?? pens[0] ?? DEFAULT_INK_PENS[0]!
}

export function isInkPenTool(tool: string, pens: readonly InkPenDefinition[]): boolean {
  return pens.some((p) => p.id === tool)
}

export function isInkCapturingTool(tool: string, pens: readonly InkPenDefinition[]): boolean {
  return tool === 'eraser' || isInkPenTool(tool, pens)
}

export function inkBaseWidthPaper(
  size: SizeId,
  style: InkPenStyle,
  widthOverride?: number,
): number {
  const base = sanitizeInkWidth(widthOverride, SIZES[size] ?? SIZES.m)
  if (typeof style.widthScale === 'number') return base * style.widthScale
  return style.kind === 'highlight' ? base * HIGHLIGHT_SCALE : base * 0.75
}

export function inkWidthAtPressure(baseWidth: number, pressure: number, style: InkPenStyle): number {
  if (!style.pressureWidth) return baseWidth
  const p = Number.isFinite(pressure) ? Math.min(1, Math.max(0, pressure)) : 0.5
  const min = style.pressureMin ?? 0.35
  const max = style.pressureMax ?? 1.2
  const lo = Math.min(min, max)
  const hi = Math.max(min, max)
  return Math.max(0.25, baseWidth * (lo + (hi - lo) * p))
}

export function inkStrokeOpacity(style: InkPenStyle): number {
  if (typeof style.opacity === 'number') return style.opacity
  return style.kind === 'highlight' ? HIGHLIGHT_ALPHA : 1
}

/** Eraser behavior: `stroke` removes whole strokes, `pixel` cuts only touched segments. */
export type EraserMode = 'pixel' | 'stroke'

export function sanitizeEraserMode(raw: unknown): EraserMode {
  return raw === 'pixel' ? 'pixel' : 'stroke'
}

/** Eraser footprint radius in paper units. */
export const DEFAULT_ERASER_RADIUS_PAPER = 8
export const ERASER_RADIUS_MIN_PAPER = 1
export const ERASER_RADIUS_MAX_PAPER = 48

/** Finite paper-unit eraser radius, or `fallback` when invalid. */
export function sanitizeEraserRadius(raw: unknown, fallback: number): number {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.min(ERASER_RADIUS_MAX_PAPER, Math.max(ERASER_RADIUS_MIN_PAPER, n))
}

/** Continuous width-slider domain (paper units). Exponential feel: fine control at hairlines. */
export const INK_WIDTH_MIN_PAPER = 0.5
export const INK_WIDTH_MAX_PAPER = 24
export const INK_WIDTH_SLIDER_MIN = 1
export const INK_WIDTH_SLIDER_MAX = 100
/** Hard clamp for any stored/rendered explicit width. */
export const INK_WIDTH_HARD_MIN = 0.25
export const INK_WIDTH_HARD_MAX = 64

/** Finite paper-unit width, or `fallback` when the override is absent/invalid. */
export function sanitizeInkWidth(raw: unknown, fallback: number): number {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.min(INK_WIDTH_HARD_MAX, Math.max(INK_WIDTH_HARD_MIN, n))
}

/** Slider 1–100 → paper units (exponential, ≈0.5 → 24). */
export function widthSliderToPaper(value: number): number {
  const t = (Math.min(INK_WIDTH_SLIDER_MAX, Math.max(INK_WIDTH_SLIDER_MIN, value)) - INK_WIDTH_SLIDER_MIN) /
    (INK_WIDTH_SLIDER_MAX - INK_WIDTH_SLIDER_MIN)
  return INK_WIDTH_MIN_PAPER * Math.pow(INK_WIDTH_MAX_PAPER / INK_WIDTH_MIN_PAPER, t)
}

/** Paper units → nearest slider 1–100 (inverse of {@link widthSliderToPaper}). */
export function paperToWidthSlider(width: number): number {
  const w = Math.min(INK_WIDTH_MAX_PAPER, Math.max(INK_WIDTH_MIN_PAPER, width))
  const t = Math.log(w / INK_WIDTH_MIN_PAPER) / Math.log(INK_WIDTH_MAX_PAPER / INK_WIDTH_MIN_PAPER)
  return Math.round(INK_WIDTH_SLIDER_MIN + t * (INK_WIDTH_SLIDER_MAX - INK_WIDTH_SLIDER_MIN))
}

/**
 * Absolute outline width for filled-ribbon renderers (web board draw shapes).
 * Legacy output is bit-identical when no explicit width is stored: the
 * `INK_SIZES` table, scaled proportionally when an override exists.
 */
export function inkOutlineWidthPaper(size: SizeId, widthOverride?: number): number {
  const base = SIZES[size] ?? SIZES.m
  const legacy = INK_SIZES[size] ?? INK_SIZES.m
  if (widthOverride == null) return legacy
  const w = sanitizeInkWidth(widthOverride, base)
  return (w * legacy) / base
}
