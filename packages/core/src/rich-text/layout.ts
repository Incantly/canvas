import type { ColorId, FontId, SizeId } from '../types/base.js'
import type { Theme } from '../types/themes.js'
import { FONT_SIZES, FONTS } from '../palette.js'
import type { InlineSpan, TextBlock, BlockType } from './types.js'
const lineBaselineLocal = (font: string, fontSize: number, lh: number): number => {
  const ctx = measurer()
  ctx.font = `500 ${fontSize}px ${font}`
  const m = ctx.measureText('Mg')
  const a = m.fontBoundingBoxAscent ?? fontSize * 0.8
  const d = m.fontBoundingBoxDescent ?? fontSize * 0.2
  return (lh - (a + d)) / 2 + a
}

export interface LayoutRun {
  text: string
  x: number
  y: number
  w: number
  fontSize: number
  fontFamily: string
  fontWeight: string
  fontStyle: string
  underline: boolean
  strikethrough: boolean
  code: boolean
  linkHref?: string
  color: string
  blockType: BlockType
}

export interface RichTextLayout {
  runs: LayoutRun[]
  lines: number
  w: number
  h: number
  fontSize: number
  fontFamily: string
  lh: number
}

const BLOCK_SCALE: Record<BlockType, number> = {
  paragraph: 1,
  heading1: 2,
  heading2: 1.5,
  heading3: 1.25,
  bulletList: 1,
  numberedList: 1,
  codeBlock: 0.92,
  quote: 1,
  divider: 1,
}

const LIST_INDENT = 24

let measureCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null
function measurer(): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  if (!measureCtx) {
    measureCtx = (
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(1, 1)
        : document.createElement('canvas')
    ).getContext('2d') as CanvasRenderingContext2D
  }
  return measureCtx
}

function spanFont(
  span: InlineSpan,
  blockType: BlockType,
  defaults: { font: FontId; fontSize: number }
): { family: string; size: number; weight: string; style: string } {
  const family = FONTS[span.font || defaults.font]
  const size = span.fontSize || defaults.fontSize * BLOCK_SCALE[blockType]
  const weight = span.bold || blockType.startsWith('heading') ? '600' : '500'
  const style = span.italic || blockType === 'quote' ? 'italic' : 'normal'
  return { family, size, weight, style }
}

function measureRun(
  text: string,
  family: string,
  size: number,
  weight: string,
  style: string
): number {
  const ctx = measurer()
  ctx.font = `${style} ${weight} ${size}px ${family}`
  return ctx.measureText(text).width
}

function listPrefix(block: TextBlock, listIndex: number): string {
  if (block.type === 'bulletList') return '• '
  if (block.type === 'numberedList') return `${listIndex + 1}. `
  return ''
}

interface WordPiece {
  text: string
  span: InlineSpan
}

function flattenWords(block: TextBlock): WordPiece[] {
  const out: WordPiece[] = []
  for (const span of block.content) {
    const parts = String(span.text ?? '').split(/(\s+)/)
    for (const part of parts) {
      if (part) out.push({ text: part, span })
    }
  }
  return out.length ? out : [{ text: '', span: { text: '' } }]
}

export interface LayoutOptions {
  blocks: TextBlock[]
  maxW: number
  defaultFont: FontId
  baseFontSize: number
  defaultColor: ColorId
  theme: Theme
  align?: 'left' | 'center' | 'right'
}

export function layoutRichText(opts: LayoutOptions): RichTextLayout {
  const {
    blocks,
    maxW,
    defaultFont,
    baseFontSize,
    defaultColor,
    theme,
    align = 'left',
  } = opts
  const runs: LayoutRun[] = []
  let y = 0
  let maxLineW = 8
  let listCounter = 0
  let prevListType: BlockType | null = null
  const defaultFamily = FONTS[defaultFont]
  const baseLh = baseFontSize * 1.32

  for (const block of blocks) {
    if (block.type === 'divider') {
      const blockLh = baseFontSize * 1.6
      if (maxLineW < maxW || maxW === 0) maxLineW = Math.max(maxLineW, maxW || 200)
      runs.push({
        text: '',
        x: 0,
        y,
        w: maxW > 0 ? maxW : 200,
        fontSize: baseFontSize,
        fontFamily: defaultFamily,
        fontWeight: '500',
        fontStyle: 'normal',
        underline: false,
        strikethrough: false,
        code: false,
        color: theme.colors[defaultColor].stroke,
        blockType: 'divider',
      })
      y += blockLh
      continue
    }
    if (block.type === 'numberedList') {
      if (prevListType !== 'numberedList') listCounter = 0
      listCounter++
    } else if (block.type !== 'bulletList') {
      listCounter = 0
    }
    prevListType = block.type

    const blockSize = baseFontSize * BLOCK_SCALE[block.type]
    const blockLh =
      block.type === 'codeBlock' ? blockSize * 1.45 : blockSize * (block.type.startsWith('heading') ? 1.2 : 1.32)
    const indent = (block.indent || 0) * LIST_INDENT
    const prefix = listPrefix(block, listCounter - 1)
    const prefixW = prefix
      ? measureRun(prefix, defaultFamily, blockSize, '500', 'normal')
      : 0
    const contentMaxW = maxW > 0 ? Math.max(40, maxW - indent - prefixW) : 0

    const words = flattenWords(block)
    let lineX = indent + prefixW
    let lineStartX = indent
    let lineRuns: LayoutRun[] = []
    let lineW = indent + prefixW
    let firstOnLine = true

    const flushLine = (): void => {
      if (prefix && firstOnLine && lineRuns.length) {
        const col = theme.colors[defaultColor].stroke
        lineRuns.unshift({
          text: prefix,
          x: indent,
          y,
          w: prefixW,
          fontSize: blockSize,
          fontFamily: defaultFamily,
          fontWeight: '500',
          fontStyle: 'normal',
          underline: false,
          strikethrough: false,
          code: false,
          color: col,
          blockType: block.type,
        })
      }
      if (lineRuns.length) {
        const shift =
          align === 'center' && maxW > 0
            ? Math.max(0, (maxW - lineW) / 2)
            : align === 'right' && maxW > 0
              ? Math.max(0, maxW - lineW)
              : 0
        for (const r of lineRuns) {
          r.x += shift
          runs.push(r)
        }
        maxLineW = Math.max(maxLineW, lineW + shift)
      }
      y += blockLh
      lineX = indent + prefixW
      lineStartX = indent
      lineRuns = []
      lineW = indent + prefixW
      firstOnLine = true
    }

    const pushRun = (text: string, span: InlineSpan): void => {
      const mono = block.type === 'codeBlock' || span.code
      const fontId = mono ? 'mono' : span.font || defaultFont
      const { family, size, weight, style } = spanFont(span, block.type, {
        font: fontId,
        fontSize: baseFontSize,
      })
      const colorId = span.color || defaultColor
      const col = theme.colors[colorId]?.stroke ?? theme.colors.black.stroke
      const w = measureRun(text, family, size, weight, style)
      lineRuns.push({
        text,
        x: lineX,
        y,
        w,
        fontSize: size,
        fontFamily: family,
        fontWeight: weight,
        fontStyle: style,
        underline: !!span.underline || !!span.link,
        strikethrough: !!span.strikethrough,
        code: !!span.code || block.type === 'codeBlock',
        linkHref: span.link?.href,
        color: col,
        blockType: block.type,
      })
      lineX += w
      lineW = lineX
      firstOnLine = false
    }

    for (const { text, span } of words) {
      if (!text) continue
      const { family, size, weight, style } = spanFont(span, block.type, {
        font: span.code || block.type === 'codeBlock' ? 'mono' : defaultFont,
        fontSize: baseFontSize,
      })
      const w = measureRun(text, family, size, weight, style)
      if (contentMaxW > 0 && lineX + w > indent + prefixW + contentMaxW && lineX > indent + prefixW) {
        flushLine()
      }
      if (contentMaxW > 0 && w > contentMaxW && text.trim()) {
        let chunk = ''
        for (const ch of text) {
          const test = chunk + ch
          const tw = measureRun(test, family, size, weight, style)
          if (chunk && lineX + tw > indent + prefixW + contentMaxW) {
            pushRun(chunk, span)
            flushLine()
            chunk = ch.trimStart() ? ch : ''
          } else chunk = test
        }
        if (chunk) pushRun(chunk, span)
      } else {
        pushRun(text, span)
      }
    }
    flushLine()
    if (block.type === 'codeBlock') y += blockSize * 0.25
  }

  const h = Math.max(baseLh, y)
  const w = maxW > 0 ? maxW : Math.max(8, maxLineW) + 2
  return {
    runs,
    lines: Math.max(1, Math.ceil(h / baseLh)),
    w,
    h,
    fontSize: baseFontSize,
    fontFamily: defaultFamily,
    lh: baseLh,
  }
}

export function drawRichTextLayout(
  ctx: CanvasRenderingContext2D,
  layout: RichTextLayout,
  offsetY = 0
): void {
  ctx.textBaseline = 'alphabetic'
  let lastY = -1
  let lineBl = 0
  for (const run of layout.runs) {
    if (run.y !== lastY) {
      lastY = run.y
      lineBl = lineBaselineLocal(run.fontFamily, run.fontSize, run.fontSize * 1.32)
    }
    const drawY = run.y + lineBl + offsetY
    if (run.blockType === 'divider') {
      ctx.strokeStyle = run.color
      ctx.globalAlpha = 0.35
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(run.x, drawY - run.fontSize * 0.5)
      ctx.lineTo(run.x + run.w, drawY - run.fontSize * 0.5)
      ctx.stroke()
      ctx.globalAlpha = 1
      continue
    }
    ctx.font = `${run.fontStyle} ${run.fontWeight} ${run.fontSize}px ${run.fontFamily}`
    ctx.fillStyle = run.color
    if (run.code) {
      const pad = 3
      ctx.fillStyle = 'rgba(120, 120, 120, 0.12)'
      ctx.fillRect(run.x - pad, run.y + offsetY + 1, run.w + pad * 2, run.fontSize * 1.15)
      ctx.fillStyle = run.color
    }
    ctx.fillText(run.text, run.x, drawY)
    if (run.underline || run.linkHref) {
      ctx.strokeStyle = run.color
      ctx.lineWidth = Math.max(1, run.fontSize / 14)
      ctx.beginPath()
      ctx.moveTo(run.x, drawY + 2)
      ctx.lineTo(run.x + run.w, drawY + 2)
      ctx.stroke()
    }
    if (run.strikethrough) {
      ctx.strokeStyle = run.color
      ctx.lineWidth = Math.max(1, run.fontSize / 16)
      ctx.beginPath()
      ctx.moveTo(run.x, drawY - run.fontSize * 0.28)
      ctx.lineTo(run.x + run.w, drawY - run.fontSize * 0.28)
      ctx.stroke()
    }
  }
}
