import type { ThemeId } from './types/base.js'

export function defaultDocumentBackground(themeId: ThemeId): string {
  return themeId === 'dark' ? '#191713' : '#ffffff'
}

/** Accept hex, rgb/rgba, hsl, and named CSS colors. */
export function normalizeCssColor(input: string): string | null {
  const s = String(input).trim()
  if (!s) return null
  if (typeof document !== 'undefined') {
    const el = document.createElement('div')
    el.style.color = ''
    el.style.color = s
    if (!el.style.color) return null
    return s
  }
  if (/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) return s
  if (/^rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?(?:\s*,\s*[\d.]+%?)?\s*\)$/i.test(s))
    return s
  if (/^hsla?\(/i.test(s)) return s
  return null
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  let h = hex.slice(1)
  if (h.length === 3 || h.length === 4) {
    h = h
      .slice(0, 3)
      .split('')
      .map((c) => c + c)
      .join('')
  } else if (h.length === 8) {
    h = h.slice(0, 6)
  }
  if (h.length !== 6) return null
  const n = Number.parseInt(h, 16)
  if (!Number.isFinite(n)) return null
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function parseRgbString(color: string): { r: number; g: number; b: number } | null {
  const m = color.match(
    /^rgba?\(\s*([\d.]+)%?\s*,\s*([\d.]+)%?\s*,\s*([\d.]+)%?(?:\s*,\s*[\d.]+%?)?\s*\)$/i,
  )
  if (!m) return null
  const scale = (v: string, i: number) => {
    const n = Number(v)
    if (!Number.isFinite(n)) return 0
    return color.includes('%') ? Math.round((n / 100) * 255) : Math.round(n)
  }
  return { r: scale(m[1], 0), g: scale(m[2], 1), b: scale(m[3], 2) }
}

export function parseCssColorRgb(color: string): { r: number; g: number; b: number } | null {
  const s = color.trim()
  if (s.startsWith('#')) return parseHex(s)
  if (s.startsWith('rgb')) return parseRgbString(s)
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#000'
    ctx.fillStyle = s
    const normalized = ctx.fillStyle
    if (normalized.startsWith('#')) return parseHex(normalized)
    return parseRgbString(normalized)
  }
  return null
}

export function contrastDocumentText(background: string): string {
  const rgb = parseCssColorRgb(background)
  if (!rgb) return '#1d1d1d'
  const lum = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255
  return lum > 0.55 ? '#1d1d1d' : 'rgba(255, 255, 255, 0.88)'
}
