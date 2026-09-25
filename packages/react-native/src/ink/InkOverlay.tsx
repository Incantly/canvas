import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  PanResponder,
  StyleSheet,
  View,
  type GestureResponderEvent,
} from 'react-native'
import Svg, { Circle, G, Path } from 'react-native-svg'
import type {
  Camera,
  ColorId,
  DocumentBlock,
  DrawingStroke,
  EraseCircle,
  EraserMode,
  InkPenDefinition,
  ShapeRecord,
  SizeId,
} from '@incantly/canvas/headless'
import {
  DEFAULT_ERASER_RADIUS_PAPER,
  DEFAULT_INK_MIN_DIST,
  HIGHLIGHT_SCALE,
  SIZES,
  appendPackedStrokePoint,
  createLruCache,
  extendLivePathMany,
  hitEraseStroke,
  hitShape,
  inkBaseWidthPaper,
  inkStrokeOpacity,
  inkWidthAtPressure,
  interpolateGapPoints,
  isErasureFragment,
  sanitizeEraserRadius,
  sanitizeInkWidth,
  splitStrokeByEraser,
  strokePointsBounds,
  isDrawingBlock,
  isInkCapturingTool,
  isInkPenTool,
  resolveInkPen,
  sanitizeInkPens,
  screenToPage,
  svgPathFromPackedPts,
  svgRibbonFromPackedPts,
  themeOf,
} from '@incantly/canvas/headless'
import { clampToPaper, screenToPaper } from './coords.js'
import type { InkHit, PixelEraseEdit, PixelShapeEraseEdit } from './types.js'

export type { InkHit, PixelEraseEdit, PixelShapeEraseEdit } from './types.js'

const MAX_LIVE_POINTS = 8_000
const PATH_CACHE = createLruCache<string, string>(256)
/** Shared frozen empty-hide set — keeps memoized layers stable while drawing. */
const EMPTY_HIDE: ReadonlySet<string> = new Set<string>()
/** Stamp batch cap per erase move event (spacing stretches, never gaps). */
const MAX_ERASE_STAMPS = 24

/** Erase broadphase entry: centerline bbox + rendered half width. */
type EraseEntry = {
  b: { x0: number; y0: number; x1: number; y1: number } | null
  hw: number
}

export interface InkOverlayProps {
  width: number
  height: number
  zoom: number
  paperWidth: number
  paperHeight: number
  blocks: DocumentBlock[]
  tool: string
  color: ColorId
  size: SizeId
  /** Continuous pen width in paper units (slider). Absent = legacy `size` rendering. */
  penWidth?: number
  /** Eraser footprint radius in paper units. Absent = default radius. */
  eraserRadius?: number
  /** Eraser behavior. Absent = whole-stroke erase. */
  eraserMode?: EraserMode
  pens?: readonly InkPenDefinition[]
  readonly?: boolean
  onCommitStroke?: (stroke: DrawingStroke) => void
  onErase?: (hits: InkHit[]) => void
  /** Pixel-mode document commit: surviving pieces per hit stroke. */
  onErasePixel?: (edits: PixelEraseEdit[]) => void
  /** Open canvas: world coords via camera; committed ink is painted by ShapeLayer. */
  variant?: 'document' | 'board'
  camera?: Camera
  boardShapes?: readonly ShapeRecord[]
  onEraseShapeIds?: (ids: string[]) => void
  /** Pixel-mode board commit: surviving pieces per hit shape (local coords). */
  onErasePixelShapes?: (edits: PixelShapeEraseEdit[]) => void
  /**
   * Board pixel-mode live preview sink: surviving local-coord pieces per
   * shape id (present-but-empty hides). Null clears.
   */
  onPixelBoardPreview?: (pieces: ReadonlyMap<string, number[][]> | null) => void
}

function pathForPts(pts: number[]): string {
  const n = pts.length
  if (n < 3) return ''
  const key = `s:${n}:${pts[0]}:${pts[1]}:${pts[n - 3]}:${pts[n - 2]}:${pts[n - 1]}`
  const cached = PATH_CACHE.get(key)
  if (cached !== undefined) return cached
  const d = svgPathFromPackedPts(pts)
  PATH_CACHE.set(key, d)
  return d
}

function ribbonForPts(
  pts: number[],
  size: SizeId,
  style: ReturnType<typeof resolveInkPen>['style'],
  width?: number,
): string {
  const n = pts.length
  if (n < 6) return ''
  const mid = pts[Math.floor(n / 6) * 3 + 2]
  const key = `r:${n}:${pts[0]}:${pts[1]}:${pts[n - 3]}:${mid}:${style.widthScale}:${style.pressureMin}:${style.pressureMax}:${width ?? ''}`
  const cached = PATH_CACHE.get(key)
  if (cached !== undefined) return cached
  const base = inkBaseWidthPaper(size, style, width)
  const d = svgRibbonFromPackedPts(pts, (p) => inkWidthAtPressure(base, p, style))
  PATH_CACHE.set(key, d)
  return d
}

function pressureOf(e: GestureResponderEvent): number {
  const force = (e.nativeEvent as { force?: number }).force
  return typeof force === 'number' && force > 0 ? Math.min(1, force) : 0.5
}

function worldPoint(
  e: GestureResponderEvent,
  camera: Camera,
): { x: number; y: number } | null {
  const { locationX, locationY } = e.nativeEvent
  if (!Number.isFinite(locationX) || !Number.isFinite(locationY)) return null
  const p = screenToPage(locationX, locationY, camera)
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null
  return p
}

function paperPoint(
  e: GestureResponderEvent,
  zoom: number,
  paperW: number,
  paperH: number,
  clamp: boolean,
): { x: number; y: number } | null {
  const { locationX, locationY } = e.nativeEvent
  const hit = screenToPaper(locationX, locationY, zoom, paperW, paperH)
  if (hit) return hit
  if (!clamp) return null
  const z = Math.max(0.01, zoom)
  return clampToPaper(locationX / z, locationY / z, paperW, paperH)
}

export function InkOverlay({
  width,
  height,
  zoom,
  paperWidth,
  paperHeight,
  blocks,
  tool,
  color,
  size,
  penWidth,
  eraserRadius: eraserRadiusProp,
  eraserMode = 'stroke',
  pens: pensProp,
  readonly,
  onCommitStroke,
  onErase,
  onErasePixel,
  variant = 'document',
  camera,
  boardShapes = [],
  onEraseShapeIds,
  onErasePixelShapes,
  onPixelBoardPreview,
}: InkOverlayProps) {
  const pens = useMemo(() => sanitizeInkPens(pensProp), [pensProp])
  const capturing = !readonly && isInkCapturingTool(tool, pens)
  const eraserRadius = sanitizeEraserRadius(eraserRadiusProp, DEFAULT_ERASER_RADIUS_PAPER)
  const livePts = useRef<number[]>([])
  // Incremental live preview: plain polyline extended per event (O(1)), so
  // fast strokes don't pay a full path rebuild per frame. The pressure
  // ribbon is computed once at commit time.
  const liveD = useRef('')
  const liveLast = useRef<{ x: number; y: number; pressure: number } | null>(null)
  const lastEraseKey = useRef('')
  const eraseHits = useRef<Map<string, InkHit>>(new Map())
  const eraseShapeIds = useRef<Set<string>>(new Set())
  const lastErasePt = useRef<{ x: number; y: number } | null>(null)
  /** Eraser footprint center (paper/world units) — drives the cursor ring. */
  const eraseCursor = useRef<{ x: number; y: number } | null>(null)
  /**
   * Pixel-mode accumulation (refs only — the store is untouched mid-gesture):
   * surviving pieces per stroke key, refined incrementally — each stamp batch
   * splits the current survivors (segment-precise, so taps between sampled
   * vertices still punch a hole). Doc keys are `${blockIndex}:${strokeIndex}`;
   * board keys are shape ids with pieces in shape-local coords. Present-but-
   * empty hides the stroke (fully erased).
   */
  const pixelPieces = useRef(new Map<string, number[][]>())
  const [liveTick, setLiveTick] = useState(0)
  const raf = useRef<number | null>(null)
  const drawing = useRef(false)

  const capturingRef = useRef(capturing)
  const toolRef = useRef(tool)
  const pensRef = useRef(pens)
  const zoomRef = useRef(zoom)
  const paperRef = useRef({ w: paperWidth, h: paperHeight })
  const blocksRef = useRef(blocks)
  const colorRef = useRef(color)
  const sizeRef = useRef(size)
  const penWidthRef = useRef(penWidth)
  const eraserRadiusRef = useRef(eraserRadius)
  const eraserModeRef = useRef<EraserMode>(eraserMode)
  const onCommitRef = useRef(onCommitStroke)
  const onEraseRef = useRef(onErase)
  const onErasePixelRef = useRef(onErasePixel)
  const variantRef = useRef(variant)
  const cameraRef = useRef(camera)
  const boardShapesRef = useRef(boardShapes)
  const onEraseShapeIdsRef = useRef(onEraseShapeIds)
  const onErasePixelShapesRef = useRef(onErasePixelShapes)
  const onPixelBoardPreviewRef = useRef(onPixelBoardPreview)
  capturingRef.current = capturing
  toolRef.current = tool
  pensRef.current = pens
  zoomRef.current = zoom
  paperRef.current = { w: paperWidth, h: paperHeight }
  blocksRef.current = blocks
  colorRef.current = color
  sizeRef.current = size
  penWidthRef.current = penWidth
  eraserRadiusRef.current = eraserRadius
  eraserModeRef.current = eraserMode
  onCommitRef.current = onCommitStroke
  onEraseRef.current = onErase
  onErasePixelRef.current = onErasePixel
  variantRef.current = variant
  cameraRef.current = camera
  boardShapesRef.current = boardShapes
  onEraseShapeIdsRef.current = onEraseShapeIds
  onErasePixelShapesRef.current = onErasePixelShapes
  onPixelBoardPreviewRef.current = onPixelBoardPreview

  const bumpLive = useCallback(() => {
    if (raf.current != null) return
    raf.current = requestAnimationFrame(() => {
      raf.current = null
      setLiveTick((n) => n + 1)
    })
  }, [])

  useEffect(() => {
    return () => {
      if (raf.current != null) cancelAnimationFrame(raf.current)
    }
  }, [])

  const inkPoint = (e: GestureResponderEvent, clamp: boolean) => {
    if (variantRef.current === 'board') {
      const cam = cameraRef.current ?? { x: 0, y: 0, z: Math.max(0.01, zoomRef.current) }
      return worldPoint(e, cam)
    }
    const paper = paperRef.current
    return paperPoint(e, zoomRef.current, paper.w, paper.h, clamp)
  }

  /** Rendered half width of a document stroke (paper units) for eraser tolerance. */
  const strokeHalfWidth = (stroke: { size: SizeId; pen?: string; kind: 'draw' | 'highlight'; width?: number }): number => {
    const style = resolveInkPen(pensRef.current, stroke.pen, stroke.kind).style
    return inkBaseWidthPaper(stroke.size, style, stroke.width) / 2
  }

  /** Rendered half width of a board draw/highlight shape (world units). Mirrors ShapeSvg. */
  const boardShapeHalfWidth = (s: ShapeRecord): number => {
    const p = s.props as { size?: SizeId; width?: number }
    const base = sanitizeInkWidth(p.width, SIZES[(p.size as SizeId) ?? 'm'] ?? SIZES.m)
    return (base * (s.type === 'highlight' ? HIGHLIGHT_SCALE : 0.75)) / 2
  }

  /**
   * Erase broadphase cache: centerline bbox + rendered half width per stroke.
   * Point walks are the erase hot path, so per-move hit-testing must not pay
   * them for strokes nowhere near the finger. Entries are keyed by data
   * identity — the store is untouched mid-erase-gesture, so one build serves
   * the whole gesture and any commit transparently rebuilds on next touch.
   * Pixel-mode survivors only ever shrink inside the original bbox, so the
   * cached (original) bounds stay a valid conservative prefilter.
   */
  const docEraseCache = useRef<{ data: unknown; map: Map<string, EraseEntry> }>({
    data: null,
    map: new Map(),
  })
  const boardEraseCache = useRef<{ data: unknown; map: Map<string, EraseEntry> }>({
    data: null,
    map: new Map(),
  })

  const docEraseEntry = (
    bi: number,
    si: number,
    stroke: { size: SizeId; pen?: string; kind: 'draw' | 'highlight'; width?: number; pts: number[] },
  ): EraseEntry => {
    const cache = docEraseCache.current
    if (cache.data !== blocksRef.current) {
      cache.data = blocksRef.current
      cache.map.clear()
    }
    const key = `${bi}:${si}`
    let entry = cache.map.get(key)
    if (!entry) {
      entry = { b: strokePointsBounds(stroke.pts), hw: strokeHalfWidth(stroke) }
      cache.map.set(key, entry)
    }
    return entry
  }

  const boardEraseEntry = (s: ShapeRecord): EraseEntry => {
    const cache = boardEraseCache.current
    if (cache.data !== boardShapesRef.current) {
      cache.data = boardShapesRef.current
      cache.map.clear()
    }
    let entry = cache.map.get(s.id)
    if (!entry) {
      const pts = (s.props as { pts?: number[] }).pts
      entry = { b: pts ? strokePointsBounds(pts) : null, hw: boardShapeHalfWidth(s) }
      cache.map.set(s.id, entry)
    }
    return entry
  }

  /** Cheap AABB prefilter: true when any circle can reach the bbox. */
  const bboxHitCircles = (
    b: EraseEntry['b'],
    hw: number,
    circles: readonly EraseCircle[],
    dx: number,
    dy: number,
  ): boolean => {
    if (!b) return false
    for (const c of circles) {
      const tol = c.r + hw
      if (c.x + tol >= b.x0 + dx && c.x - tol <= b.x1 + dx && c.y + tol >= b.y0 + dy && c.y - tol <= b.y1 + dy)
        return true
    }
    return false
  }

  /**
   * Whole-stroke erase for one stamp batch. Strokes far from every stamp are
   * skipped on cached bboxes — only candidates pay point walks. Hit order
   * matches the old per-stamp scan (ascending blocks, topmost stroke first).
   */
  const collectEraseStrokes = (circles: readonly EraseCircle[]) => {
    const radius = eraserRadiusRef.current
    if (circles.length === 0) {
      bumpLive()
      return
    }
    if (variantRef.current === 'board') {
      for (const s of boardShapesRef.current) {
        if (s.type !== 'draw' && s.type !== 'highlight') continue
        if (eraseShapeIds.current.has(s.id)) continue
        const entry = boardEraseEntry(s)
        if (!bboxHitCircles(entry.b, entry.hw, circles, s.x, s.y)) continue
        // hitShape already includes the shape's own width internally.
        let hit = false
        for (const c of circles) {
          if (hitShape(s, c.x, c.y, radius)) {
            hit = true
            break
          }
        }
        if (!hit) continue
        eraseShapeIds.current.add(s.id)
        lastEraseKey.current = s.id
      }
      bumpLive()
      return
    }
    const blocks = blocksRef.current
    for (const c of circles) {
      let done = false
      for (let bi = 0; bi < blocks.length && !done; bi++) {
        const block = blocks[bi]
        if (!block || !isDrawingBlock(block)) continue
        for (let si = block.strokes.length - 1; si >= 0; si--) {
          const stroke = block.strokes[si]!
          const entry = docEraseEntry(bi, si, stroke)
          if (entry.b && (c.x + radius + entry.hw < entry.b.x0 || c.x - radius - entry.hw > entry.b.x1 || c.y + radius + entry.hw < entry.b.y0 || c.y - radius - entry.hw > entry.b.y1))
            continue
          if (!hitEraseStroke(stroke.pts, c.x, c.y, radius, entry.hw)) continue
          const key = `${bi}:${si}`
          if (key === lastEraseKey.current) break
          eraseHits.current.set(key, { blockIndex: bi, strokeIndex: si })
          lastEraseKey.current = key
          bumpLive()
          done = true
          break
        }
      }
    }
    bumpLive()
  }

  /**
   * Pixel-mode accumulation for one stamp batch. Each batch splits the
   * current survivors (original stroke on first touch) — the store is
   * untouched until release. Far strokes are skipped on cached bboxes; only
   * candidates pay the segment split (which carries its own broadphase, so no
   * second bbox pass here). Returns true when any stroke changed (caller
   * bumps the live render).
   */
  const accumulatePixelErase = (circles: readonly EraseCircle[]): boolean => {
    if (circles.length === 0) return false
    const radius = eraserRadiusRef.current
    const diameter = radius * 2
    let touched = false
    if (variantRef.current === 'board') {
      for (const s of boardShapesRef.current) {
        if (s.type !== 'draw' && s.type !== 'highlight') continue
        const entry = boardEraseEntry(s)
        if (!bboxHitCircles(entry.b, entry.hw, circles, s.x, s.y)) continue
        const pts = (s.props as { pts?: number[] }).pts
        if (!pts || pts.length < 3) continue
        // Draw shapes never rotate (rot is always 0) — translate only.
        const local = circles.map((c) => ({ x: c.x - s.x, y: c.y - s.y, r: c.r }))
        const hw = entry.hw
        const current = pixelPieces.current.get(s.id) ?? [pts]
        if (current.length === 0) continue
        const next: number[][] = []
        let changed = false
        for (const piece of current) {
          const split = splitStrokeByEraser(piece, local, hw)
          if (split.length === 1 && split[0] === piece) {
            next.push(piece)
            continue
          }
          changed = true
          for (const p of split) {
            if (!isErasureFragment(p, diameter)) next.push(p)
          }
        }
        if (!changed) continue
        pixelPieces.current.set(s.id, next)
        touched = true
      }
      if (touched) {
        onPixelBoardPreviewRef.current?.(new Map(pixelPieces.current))
      }
      return touched
    }
    const blocks = blocksRef.current
    blocks.forEach((block, bi) => {
      if (!isDrawingBlock(block)) return
      block.strokes.forEach((stroke, si) => {
        const key = `${bi}:${si}`
        const prev = pixelPieces.current.get(key)
        if (prev && prev.length === 0) return
        const entry = docEraseEntry(bi, si, stroke)
        if (!bboxHitCircles(entry.b, entry.hw, circles, 0, 0)) return
        const hw = entry.hw
        const current = prev ?? [stroke.pts]
        const next: number[][] = []
        let changed = false
        for (const piece of current) {
          const split = splitStrokeByEraser(piece, circles, hw)
          if (split.length === 1 && split[0] === piece) {
            next.push(piece)
            continue
          }
          changed = true
          for (const p of split) {
            if (!isErasureFragment(p, diameter)) next.push(p)
          }
        }
        if (!changed) return
        pixelPieces.current.set(key, next)
        touched = true
      })
    })
    return touched
  }

  const interpolateErase = (x: number, y: number) => {
    eraseCursor.current = { x, y }
    const radius = eraserRadiusRef.current
    const pixel = eraserModeRef.current === 'pixel'
    const prev = lastErasePt.current
    lastErasePt.current = { x, y }
    // Stamp spacing tracks the footprint (half-radius overlap) so fast
    // drags can't hop over strokes between stamps. The batch is capped —
    // spacing stretches past the ideal step on huge jumps, but stays under
    // one footprint diameter so coverage has no gaps.
    const step = Math.max(0.5, radius * 0.5)
    const circles: EraseCircle[] = []
    if (!prev) {
      circles.push({ x, y, r: radius })
    } else {
      const dist = Math.hypot(x - prev.x, y - prev.y)
      const n = Math.min(MAX_ERASE_STAMPS, Math.max(1, Math.ceil(dist / step)))
      for (let i = 1; i <= n; i++) {
        circles.push({
          x: prev.x + ((x - prev.x) * i) / n,
          y: prev.y + ((y - prev.y) * i) / n,
          r: radius,
        })
      }
    }
    if (pixel) {
      if (accumulatePixelErase(circles)) bumpLive()
      else bumpLive() // cursor ring still tracks on empty moves
      return
    }
    collectEraseStrokes(circles)
  }

  const resetLive = () => {
    livePts.current = []
    liveD.current = ''
    liveLast.current = null
  }

  /** Append one live sample: commit data + incremental preview extension. */
  const appendLiveSample = (x: number, y: number, pressure: number, minDist: number): boolean => {
    return appendLiveSamples([{ x, y, pressure }], minDist)
  }

  /**
   * Batch-append live samples with a single preview-path concatenation.
   * Fast strokes emit up to 64 gap points per bridge event — extending the
   * SVG string per point copies the whole path each time (O(n²) over the
   * stroke) and visibly trails the pen. Filtering still runs per point (so
   * min-dist behavior is unchanged); only the string build is batched.
   */
  const appendLiveSamples = (
    samples: ReadonlyArray<{ x: number; y: number; pressure: number }>,
    minDist: number,
  ): boolean => {
    const accepted: Array<{ x: number; y: number; pressure: number }> = []
    for (const s of samples) {
      if (livePts.current.length / 3 >= MAX_LIVE_POINTS) break
      if (!appendPackedStrokePoint(livePts.current, s.x, s.y, s.pressure, minDist)) continue
      accepted.push(s)
    }
    if (accepted.length === 0) return false
    liveD.current = extendLivePathMany(liveD.current, accepted)
    liveLast.current = accepted[accepted.length - 1]!
    return true
  }

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => capturingRef.current,
      onMoveShouldSetPanResponder: () => capturingRef.current,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        if (!capturingRef.current) return
        const p = inkPoint(e, false)
        if (!p) return
        drawing.current = true
        resetLive()
        eraseHits.current.clear()
        eraseShapeIds.current.clear()
        pixelPieces.current.clear()
        lastEraseKey.current = ''
        lastErasePt.current = null
        eraseCursor.current = null
        if (toolRef.current === 'eraser') {
          interpolateErase(p.x, p.y)
          return
        }
        appendLiveSample(p.x, p.y, pressureOf(e), 0)
        bumpLive()
      },
      onPanResponderMove: (e) => {
        if (!drawing.current) return
        const p = inkPoint(e, true)
        if (!p) return
        if (toolRef.current === 'eraser') {
          interpolateErase(p.x, p.y)
          return
        }
        const z = Math.max(
          0.35,
          variantRef.current === 'board' ? cameraRef.current?.z ?? 1 : zoomRef.current,
        )
        const minDist = DEFAULT_INK_MIN_DIST / z
        const pressure = pressureOf(e)
        // Bridge events are sparse on fast strokes — fill the gap with
        // interpolated samples (pressure lerped) so ink tracks the finger.
        // Collected into one batch so the preview path pays a single string
        // concatenation per bridge event instead of one per sample.
        const last = liveLast.current
        let batch: Array<{ x: number; y: number; pressure: number }>
        if (last) {
          const fromPressure = last.pressure
          const dist = Math.hypot(p.x - last.x, p.y - last.y)
          const gap = interpolateGapPoints(last.x, last.y, p.x, p.y, minDist)
          batch = new Array(gap.length + 1)
          for (let i = 0; i < gap.length; i++) {
            const m = gap[i]!
            const t = dist > 1e-6 ? Math.hypot(m.x - last.x, m.y - last.y) / dist : 1
            batch[i] = { x: m.x, y: m.y, pressure: fromPressure + (pressure - fromPressure) * t }
          }
          batch[gap.length] = { x: p.x, y: p.y, pressure }
        } else {
          batch = [{ x: p.x, y: p.y, pressure }]
        }
        if (appendLiveSamples(batch, minDist)) bumpLive()
      },
      onPanResponderRelease: () => {
        drawing.current = false
        if (toolRef.current === 'eraser') {
          const pixel = eraserModeRef.current === 'pixel'
          const hits = [...eraseHits.current.values()]
          const ids = [...eraseShapeIds.current]
          eraseHits.current.clear()
          eraseShapeIds.current.clear()
          lastErasePt.current = null
          eraseCursor.current = null
          resetLive()
          bumpLive()
          if (pixel) {
            // Single store write for the whole drag — survivors were previewed
            // from refs; the store sees one batched commit (one undo step).
            const edits: PixelEraseEdit[] = []
            const shapeEdits: PixelShapeEraseEdit[] = []
            for (const [key, pieces] of pixelPieces.current) {
              if (variantRef.current === 'board') {
                shapeEdits.push({ id: key, pieces })
                continue
              }
              const sep = key.indexOf(':')
              const blockIndex = Number(key.slice(0, sep))
              const strokeIndex = Number(key.slice(sep + 1))
              if (!Number.isInteger(blockIndex) || !Number.isInteger(strokeIndex)) continue
              edits.push({ blockIndex, strokeIndex, pieces })
            }
            pixelPieces.current.clear()
            onPixelBoardPreviewRef.current?.(null)
            if (variantRef.current === 'board') {
              if (shapeEdits.length) onErasePixelShapesRef.current?.(shapeEdits)
            } else if (edits.length) {
              onErasePixelRef.current?.(edits)
            }
            return
          }
          if (ids.length) onEraseShapeIdsRef.current?.(ids)
          else if (hits.length) onEraseRef.current?.(hits)
          return
        }
        const pts = livePts.current.slice()
        resetLive()
        bumpLive()
        if (pts.length < 3) return
        if (!isInkPenTool(toolRef.current, pensRef.current)) return
        const pen = resolveInkPen(pensRef.current, toolRef.current)
        const committedWidth = penWidthRef.current
        onCommitRef.current?.({
          pts,
          color: colorRef.current,
          size: sizeRef.current,
          kind: pen.style.kind,
          pen: pen.id,
          ...(committedWidth != null ? { width: committedWidth } : {}),
        })
      },
      onPanResponderTerminate: () => {
        drawing.current = false
        resetLive()
        eraseHits.current.clear()
        eraseShapeIds.current.clear()
        pixelPieces.current.clear()
        lastErasePt.current = null
        eraseCursor.current = null
        onPixelBoardPreviewRef.current?.(null)
        bumpLive()
      },
    }),
  ).current

  const erasing = tool === 'eraser'
  // Erase-hide set only changes while the eraser is active. While drawing,
  // reuse a frozen empty set so the memoized committed layer stays skipped.
  // The previous set is reused while membership is identical — otherwise a
  // fresh identity every live frame would re-render the whole stroke list.
  const prevHideRef = useRef<ReadonlySet<string>>(EMPTY_HIDE)
  const eraseHide = useMemo(() => {
    if (eraseHits.current.size === 0) {
      prevHideRef.current = EMPTY_HIDE
      return EMPTY_HIDE
    }
    const prev = prevHideRef.current
    if (prev.size === eraseHits.current.size) {
      let same = true
      for (const key of eraseHits.current.keys()) {
        if (!prev.has(key)) {
          same = false
          break
        }
      }
      if (same) return prev
    }
    const set = new Set<string>()
    for (const key of eraseHits.current.keys()) set.add(key)
    prevHideRef.current = set
    return set
    // liveTick only advances while a gesture is active; reading the ref here
    // intentionally snapshots erase targets gathered since grant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveTick])
  const hide: ReadonlySet<string> = erasing ? eraseHide : EMPTY_HIDE

  // Pixel-mode surviving pieces, snapshotted per live frame. Only present
  // while pixel-erasing on the document surface; board pieces flow upstream
  // to ShapeLayer instead (see onPixelBoardPreview). The snapshot keeps its
  // identity while no stroke's pieces change, so untouched strokes skip
  // re-render (see memoized InkPath below).
  const prevPixelRef = useRef<ReadonlyMap<string, number[][]> | undefined>(undefined)
  const pixelPreview = useMemo(() => {
    if (!erasing || eraserMode !== 'pixel' || variant !== 'document') {
      prevPixelRef.current = undefined
      return undefined
    }
    if (pixelPieces.current.size === 0) {
      prevPixelRef.current = undefined
      return undefined
    }
    const prev = prevPixelRef.current
    if (prev && prev.size === pixelPieces.current.size) {
      let same = true
      for (const [key, pieces] of pixelPieces.current) {
        if (prev.get(key) !== pieces) {
          same = false
          break
        }
      }
      if (same) return prev
    }
    const snap: ReadonlyMap<string, number[][]> = new Map(pixelPieces.current)
    prevPixelRef.current = snap
    return snap
    // Intentional ref snapshot on the gesture render pulse.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveTick, erasing, eraserMode, variant])

  // Committed strokes depend only on store data — NOT on liveTick — so the
  // memoized layer below skips re-render on every live pen movement.
  const committed = useMemo(() => {
    if (variant === 'board') return []
    const out: Array<{ key: string; stroke: DrawingStroke }> = []
    blocks.forEach((block, bi) => {
      if (!isDrawingBlock(block)) return
      block.strokes.forEach((stroke, si) => {
        out.push({ key: `${bi}:${si}`, stroke })
      })
    })
    return out
  }, [blocks, variant])

  const livePen = isInkPenTool(tool, pens) ? resolveInkPen(pens, tool) : null
  // Incremental preview string — no path recomputation on live frames.
  const liveDNow = tool === 'eraser' ? '' : liveD.current
  const theme = themeOf('light')
  const liveColor = theme.colors[color]?.stroke ?? theme.colors.black.stroke
  const cam = camera ?? { x: 0, y: 0, z: zoom }
  const transform =
    variant === 'board' ? `scale(${cam.z}) translate(${cam.x} ${cam.y})` : `scale(${zoom})`
  // Eraser footprint ring. Reads the cursor ref on the same liveTick render
  // that hit-testing triggers, so it tracks without extra renders.
  const cursor = erasing ? eraseCursor.current : null
  const viewScale = variant === 'board' ? cam.z : zoom

  return (
    <View
      collapsable={false}
      style={[styles.fill, { width, height }]}
      pointerEvents={capturing ? 'auto' : 'none'}
      {...(capturing ? pan.panHandlers : null)}
    >
      <Svg width={width} height={height} pointerEvents="none">
        <G transform={transform}>
          <CommittedStrokeLayer
            pens={pens}
            strokes={committed}
            hide={hide}
            pixel={pixelPreview}
          />
          {livePen && liveDNow !== '' ? (
            <Path
              d={liveDNow}
              fill="none"
              stroke={liveColor}
              strokeWidth={inkBaseWidthPaper(size, livePen.style, penWidth)}
              strokeLinecap={livePen.style.cap ?? 'round'}
              strokeLinejoin="round"
              strokeOpacity={inkStrokeOpacity(livePen.style)}
            />
          ) : null}
          {cursor ? (
            <Circle
              cx={cursor.x}
              cy={cursor.y}
              r={Math.max(0.5, eraserRadius)}
              fill="rgba(120,120,120,0.08)"
              stroke="rgba(90,90,90,0.65)"
              strokeWidth={1 / Math.max(0.01, viewScale)}
            />
          ) : null}
        </G>
      </Svg>
    </View>
  )
}

const CommittedStrokeLayer = memo(function CommittedStrokeLayer({
  pens,
  strokes,
  hide,
  pixel,
}: {
  pens: InkPenDefinition[]
  strokes: Array<{ key: string; stroke: DrawingStroke }>
  hide: ReadonlySet<string>
  pixel?: ReadonlyMap<string, number[][]>
}) {
  const theme = themeOf('light')
  return (
    <>
      {strokes.map(({ key, stroke }) => {
        if (hide.has(key)) return null
        const pen = resolveInkPen(pens, stroke.pen, stroke.kind)
        const pieces = pixel?.get(key)
        return (
          <InkPath
            key={key}
            pts={stroke.pts}
            size={stroke.size}
            color={theme.colors[stroke.color]?.stroke ?? theme.colors.black.stroke}
            pen={pen}
            width={stroke.width}
            pieces={pieces}
          />
        )
      })}
    </>
  )
})

/**
 * Memoized stroke path — props are referentially stable for untouched strokes
 * (committed data + stable hide/pixel snapshots), so erase moves only
 * re-render strokes the eraser actually touched.
 */
function InkPathInner({
  pts,
  size,
  color,
  pen,
  width,
  pieces,
}: {
  pts: number[]
  size: SizeId
  color: string
  pen: InkPenDefinition
  width?: number
  /** Pixel-erase preview: surviving pieces (present-but-empty hides the stroke). */
  pieces?: number[][]
}) {
  if (pieces) {
    if (pieces.length === 0) return null
    return (
      <>
        {pieces.map((piece, i) => (
          <InkPath key={i} pts={piece} size={size} color={color} pen={pen} width={width} />
        ))}
      </>
    )
  }
  const style = pen.style
  const opacity = inkStrokeOpacity(style)
  if (style.pressureWidth) {
    const d = ribbonForPts(pts, size, style, width)
    if (!d) return null
    return <Path d={d} fill={color} fillOpacity={opacity} stroke="none" />
  }
  const d = pathForPts(pts)
  if (!d) return null
  return (
    <Path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={inkBaseWidthPaper(size, style, width)}
      strokeLinecap={style.cap ?? 'round'}
      strokeLinejoin="round"
      strokeOpacity={opacity}
    />
  )
}

const InkPath = memo(InkPathInner)

const styles = StyleSheet.create({
  fill: { position: 'absolute', left: 0, top: 0, zIndex: 4 },
})
