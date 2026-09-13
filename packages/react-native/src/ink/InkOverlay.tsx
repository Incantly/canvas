import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  PanResponder,
  StyleSheet,
  View,
  type GestureResponderEvent,
} from 'react-native'
import Svg, { G, Path } from 'react-native-svg'
import type {
  Camera,
  ColorId,
  DocumentBlock,
  DrawingStroke,
  InkPenDefinition,
  ShapeRecord,
  SizeId,
} from '@incantly/canvas/headless'
import {
  DEFAULT_INK_MIN_DIST,
  appendPackedStrokePoint,
  createLruCache,
  hitDocumentStroke,
  hitShape,
  inkBaseWidthPaper,
  inkStrokeOpacity,
  inkWidthAtPressure,
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
import type { InkHit } from './types.js'

export type { InkHit } from './types.js'

const MAX_LIVE_POINTS = 8_000
const PATH_CACHE = createLruCache<string, string>(256)
/** Shared frozen empty-hide set — keeps memoized layers stable while drawing. */
const EMPTY_HIDE: ReadonlySet<string> = new Set<string>()

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
  pens?: readonly InkPenDefinition[]
  readonly?: boolean
  onCommitStroke?: (stroke: DrawingStroke) => void
  onErase?: (hits: InkHit[]) => void
  /** Open canvas: world coords via camera; committed ink is painted by ShapeLayer. */
  variant?: 'document' | 'board'
  camera?: Camera
  boardShapes?: readonly ShapeRecord[]
  onEraseShapeIds?: (ids: string[]) => void
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
): string {
  const n = pts.length
  if (n < 6) return ''
  const mid = pts[Math.floor(n / 6) * 3 + 2]
  const key = `r:${n}:${pts[0]}:${pts[1]}:${pts[n - 3]}:${mid}:${style.widthScale}:${style.pressureMin}:${style.pressureMax}`
  const cached = PATH_CACHE.get(key)
  if (cached !== undefined) return cached
  const base = inkBaseWidthPaper(size, style)
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
  pens: pensProp,
  readonly,
  onCommitStroke,
  onErase,
  variant = 'document',
  camera,
  boardShapes = [],
  onEraseShapeIds,
}: InkOverlayProps) {
  const pens = useMemo(() => sanitizeInkPens(pensProp), [pensProp])
  const capturing = !readonly && isInkCapturingTool(tool, pens)
  const livePts = useRef<number[]>([])
  const lastEraseKey = useRef('')
  const eraseHits = useRef<Map<string, InkHit>>(new Map())
  const eraseShapeIds = useRef<Set<string>>(new Set())
  const lastErasePt = useRef<{ x: number; y: number } | null>(null)
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
  const onCommitRef = useRef(onCommitStroke)
  const onEraseRef = useRef(onErase)
  const variantRef = useRef(variant)
  const cameraRef = useRef(camera)
  const boardShapesRef = useRef(boardShapes)
  const onEraseShapeIdsRef = useRef(onEraseShapeIds)
  capturingRef.current = capturing
  toolRef.current = tool
  pensRef.current = pens
  zoomRef.current = zoom
  paperRef.current = { w: paperWidth, h: paperHeight }
  blocksRef.current = blocks
  colorRef.current = color
  sizeRef.current = size
  onCommitRef.current = onCommitStroke
  onEraseRef.current = onErase
  variantRef.current = variant
  cameraRef.current = camera
  boardShapesRef.current = boardShapes
  onEraseShapeIdsRef.current = onEraseShapeIds

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

  const collectErase = (x: number, y: number) => {
    if (variantRef.current === 'board') {
      const z = Math.max(0.35, cameraRef.current?.z ?? zoomRef.current)
      for (const s of boardShapesRef.current) {
        if (s.type !== 'draw' && s.type !== 'highlight') continue
        if (!hitShape(s, x, y, 10 / z)) continue
        if (eraseShapeIds.current.has(s.id)) continue
        eraseShapeIds.current.add(s.id)
        lastEraseKey.current = s.id
        bumpLive()
      }
      return
    }
    const z = Math.max(0.35, zoomRef.current)
    const hit = hitDocumentStroke(blocksRef.current, x, y, 10 / z)
    if (!hit) return
    const key = `${hit.blockIndex}:${hit.strokeIndex}`
    if (key === lastEraseKey.current) return
    eraseHits.current.set(key, hit)
    lastEraseKey.current = key
    bumpLive()
  }

  const interpolateErase = (x: number, y: number) => {
    const prev = lastErasePt.current
    lastErasePt.current = { x, y }
    if (!prev) {
      collectErase(x, y)
      return
    }
    const z = Math.max(0.35, zoomRef.current)
    const step = 6 / z
    const dist = Math.hypot(x - prev.x, y - prev.y)
    const n = Math.max(1, Math.ceil(dist / Math.max(0.5, step)))
    for (let i = 1; i <= n; i++) {
      collectErase(prev.x + ((x - prev.x) * i) / n, prev.y + ((y - prev.y) * i) / n)
    }
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
        livePts.current = []
        eraseHits.current.clear()
        eraseShapeIds.current.clear()
        lastEraseKey.current = ''
        lastErasePt.current = null
        if (toolRef.current === 'eraser') {
          interpolateErase(p.x, p.y)
          return
        }
        appendPackedStrokePoint(livePts.current, p.x, p.y, pressureOf(e), 0)
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
        if (livePts.current.length / 3 >= MAX_LIVE_POINTS) return
        if (appendPackedStrokePoint(livePts.current, p.x, p.y, pressureOf(e), minDist)) {
          bumpLive()
        }
      },
      onPanResponderRelease: () => {
        drawing.current = false
        if (toolRef.current === 'eraser') {
          const hits = [...eraseHits.current.values()]
          const ids = [...eraseShapeIds.current]
          eraseHits.current.clear()
          eraseShapeIds.current.clear()
          lastErasePt.current = null
          livePts.current = []
          bumpLive()
          if (ids.length) onEraseShapeIdsRef.current?.(ids)
          else if (hits.length) onEraseRef.current?.(hits)
          return
        }
        const pts = livePts.current.slice()
        livePts.current = []
        bumpLive()
        if (pts.length < 3) return
        if (!isInkPenTool(toolRef.current, pensRef.current)) return
        const pen = resolveInkPen(pensRef.current, toolRef.current)
        onCommitRef.current?.({
          pts,
          color: colorRef.current,
          size: sizeRef.current,
          kind: pen.style.kind,
          pen: pen.id,
        })
      },
      onPanResponderTerminate: () => {
        drawing.current = false
        livePts.current = []
        eraseHits.current.clear()
        eraseShapeIds.current.clear()
        lastErasePt.current = null
        bumpLive()
      },
    }),
  ).current

  const erasing = tool === 'eraser'
  // Erase-hide set only changes while the eraser is active. While drawing,
  // reuse a frozen empty set so the memoized committed layer stays skipped.
  const eraseHide = useMemo(() => {
    const set = new Set<string>()
    for (const key of eraseHits.current.keys()) set.add(key)
    return set
    // liveTick only advances while a gesture is active; reading the ref here
    // intentionally snapshots erase targets gathered since grant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveTick])
  const hide: ReadonlySet<string> = erasing ? eraseHide : EMPTY_HIDE

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
  const livePtsNow = tool === 'eraser' ? [] : livePts.current
  const cam = camera ?? { x: 0, y: 0, z: zoom }
  const transform =
    variant === 'board' ? `scale(${cam.z}) translate(${cam.x} ${cam.y})` : `scale(${zoom})`

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
          />
          {livePen && livePtsNow.length >= 3 ? (
            <LiveStroke
              pts={livePtsNow}
              size={size}
              color={themeOf('light').colors[color]?.stroke ?? themeOf('light').colors.black.stroke}
              pen={livePen}
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
}: {
  pens: InkPenDefinition[]
  strokes: Array<{ key: string; stroke: DrawingStroke }>
  hide: ReadonlySet<string>
}) {
  const theme = themeOf('light')
  return (
    <>
      {strokes.map(({ key, stroke }) => {
        if (hide.has(key)) return null
        const pen = resolveInkPen(pens, stroke.pen, stroke.kind)
        return (
          <InkPath
            key={key}
            pts={stroke.pts}
            size={stroke.size}
            color={theme.colors[stroke.color]?.stroke ?? theme.colors.black.stroke}
            pen={pen}
          />
        )
      })}
    </>
  )
})

function LiveStroke({
  pts,
  size,
  color,
  pen,
}: {
  pts: number[]
  size: SizeId
  color: string
  pen: InkPenDefinition
}) {
  return <InkPath pts={pts} size={size} color={color} pen={pen} />
}

function InkPath({
  pts,
  size,
  color,
  pen,
}: {
  pts: number[]
  size: SizeId
  color: string
  pen: InkPenDefinition
}) {
  const style = pen.style
  const opacity = inkStrokeOpacity(style)
  if (style.pressureWidth) {
    const d = ribbonForPts(pts, size, style)
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
      strokeWidth={inkBaseWidthPaper(size, style)}
      strokeLinecap={style.cap ?? 'round'}
      strokeLinejoin="round"
      strokeOpacity={opacity}
    />
  )
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', left: 0, top: 0, zIndex: 4 },
})
