import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  PanResponder,
  StyleSheet,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
} from 'react-native'
import Svg, { Path } from 'react-native-svg'
import type {
  Camera,
  ColorId,
  FillId,
  GeoId,
  GridId,
  InkPenDefinition,
  ShapeRecord,
  SizeId,
  TextBlock,
} from '@incantly/canvas/headless'
import {
  DEFAULT_CAMERA,
  isInkCapturingTool,
  panCamera,
  pinchCamera,
  sanitizeCamera,
} from '@incantly/canvas/headless'
import { InkOverlay, type InkHit } from '../ink/InkOverlay.js'
import type { DrawingStroke } from '@incantly/canvas/headless'
import { ShapeLayer, type ShapeDraft } from '../shapes/ShapeLayer.js'
import { TextBoxLayer } from '../shapes/TextBoxLayer.js'

type TouchPt = { x: number; y: number }

function ptOf(t: { locationX?: number; locationY?: number; pageX?: number; pageY?: number }): TouchPt | null {
  // locationX/Y share the target's coordinate space for all touches in the
  // same view, so pinch distance is valid. Fall back to page coords.
  const x = typeof t.locationX === 'number' ? t.locationX : t.pageX
  const y = typeof t.locationY === 'number' ? t.locationY : t.pageY
  if (typeof x !== 'number' || typeof y !== 'number') return null
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y }
}

function touchesOf(e: GestureResponderEvent): TouchPt[] {
  const t = e.nativeEvent.touches
  if (t && t.length > 0) {
    const out: TouchPt[] = []
    for (let i = 0; i < t.length; i++) {
      const p = ptOf(t[i] as { locationX?: number; locationY?: number; pageX?: number; pageY?: number })
      if (p) out.push(p)
    }
    if (out.length > 0) return out
  }
  const fallback = ptOf(e.nativeEvent as { locationX?: number; locationY?: number })
  return fallback ? [fallback] : []
}

/** Max grid dots per frame — caps SVG path size on large tablets / low zoom. */
const MAX_GRID_DOTS = 1600
const GRID_STEP = 48
const GRID_DOT_R = 1.2

export interface BoardViewportProps {
  shapes: readonly ShapeRecord[]
  pageId: string
  tool: string
  color: ColorId
  size: SizeId
  geoKind: GeoId
  fill: FillId
  pens: readonly InkPenDefinition[]
  selectedId: string | null
  readonly?: boolean
  grid?: GridId
  camera?: Camera
  onCamera?: (camera: Camera) => void
  onCommitShape: (draft: ShapeDraft) => void
  onMoveShape: (id: string, x: number, y: number) => void
  onSelect: (id: string | null) => void
  onPlaceText: (x: number, y: number) => void
  onChangeText: (id: string, blocks: TextBlock[]) => void
  onResizeShape?: (id: string, box: { x: number; y: number; w: number; h: number }) => void
  editingTextId?: string | null
  onEditText?: (id: string | null) => void
  onCommitInk: (stroke: DrawingStroke) => void
  onEraseInk: (hits: InkHit[]) => void
  onEraseShapeIds: (ids: string[]) => void
}

export function BoardViewport({
  shapes,
  tool,
  color,
  size,
  geoKind,
  fill,
  pens,
  selectedId,
  readonly,
  grid = 'dots',
  camera: cameraProp,
  onCamera,
  onCommitShape,
  onMoveShape,
  onSelect,
  onPlaceText,
  onChangeText,
  onResizeShape,
  editingTextId,
  onEditText,
  onCommitInk,
  onEraseInk,
  onEraseShapeIds,
}: BoardViewportProps) {
  const { width, height } = useWindowDimensions()
  const [localCam, setLocalCam] = useState<Camera>(cameraProp ?? DEFAULT_CAMERA)
  const camera = sanitizeCamera(cameraProp ?? localCam)
  const cameraRef = useRef(camera)
  const toolRef = useRef(tool)
  cameraRef.current = camera
  toolRef.current = tool
  const onCameraRef = useRef(onCamera)
  onCameraRef.current = onCamera
  const localCamRef = useRef(localCam)
  localCamRef.current = localCam
  // Coalesce gesture-driven camera updates to one React render per frame.
  // cameraRef updates synchronously so gesture math stays continuous,
  // while setLocalCam (the expensive SVG re-render) fires at most 60Hz.
  const pendingCam = useRef<Camera | null>(null)
  const camRaf = useRef<number | null>(null)
  const flushCam = useCallback(() => {
    camRaf.current = null
    const next = pendingCam.current
    pendingCam.current = null
    if (!next) return
    setLocalCam((prev) => {
      if (prev.x === next.x && prev.y === next.y && prev.z === next.z) return prev
      return next
    })
    onCameraRef.current?.(next)
  }, [])
  const setCam = useCallback(
    (next: Camera) => {
      const c = sanitizeCamera(next)
      cameraRef.current = c
      // Bail when nothing changed (e.g. zero-delta move events).
      const p = pendingCam.current ?? localCamRef.current
      if (p.x === c.x && p.y === c.y && p.z === c.z) return
      pendingCam.current = c
      if (camRaf.current == null) {
        camRaf.current = requestAnimationFrame(flushCam)
      }
    },
    [flushCam],
  )
  const flushCamSync = useCallback(() => {
    if (camRaf.current != null) {
      cancelAnimationFrame(camRaf.current)
      camRaf.current = null
    }
    flushCam()
  }, [flushCam])
  useEffect(() => {
    return () => {
      if (camRaf.current != null) cancelAnimationFrame(camRaf.current)
      pendingCam.current = null
    }
  }, [])

  const pinch = useRef<{
    dist: number
    center: { x: number; y: number }
    camera: Camera
  } | null>(null)
  const panLast = useRef<{ x: number; y: number } | null>(null)

  const camPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (e) => {
        const n = e.nativeEvent.touches?.length ?? 1
        if (n >= 2) return true
        return toolRef.current === 'hand'
      },
      onMoveShouldSetPanResponder: (e) => {
        const n = e.nativeEvent.touches?.length ?? 1
        if (n >= 2) return true
        return toolRef.current === 'hand'
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const pts = touchesOf(e)
        if (pts.length >= 2) {
          const a = pts[0]!
          const b = pts[1]!
          pinch.current = {
            dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
            center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
            camera: cameraRef.current,
          }
          panLast.current = null
          return
        }
        pinch.current = null
        const single = pts[0]
        panLast.current = single ? { x: single.x, y: single.y } : null
      },
      onPanResponderMove: (e) => {
        const pts = touchesOf(e)
        if (pts.length === 0) return
        if (pts.length >= 2) {
          const a = pts[0]!
          const b = pts[1]!
          const now = {
            dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
            center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          }
          if (!pinch.current) {
            pinch.current = { ...now, camera: cameraRef.current }
            return
          }
          // Skip zero-delta move events the OS emits between real updates.
          if (now.dist === pinch.current.dist && now.center.x === pinch.current.center.x && now.center.y === pinch.current.center.y) return
          setCam(pinchCamera(pinch.current, now))
          return
        }
        if (toolRef.current !== 'hand') return
        const last = panLast.current
        const x = pts[0]!.x
        const y = pts[0]!.y
        if (last && (x !== last.x || y !== last.y)) {
          setCam(panCamera(cameraRef.current, x - last.x, y - last.y))
        }
        panLast.current = { x, y }
      },
      onPanResponderRelease: () => {
        pinch.current = null
        panLast.current = null
        flushCamSync()
      },
      onPanResponderTerminate: () => {
        pinch.current = null
        panLast.current = null
        flushCamSync()
      },
    }),
  ).current

  // Single-Path dot grid: one native node per frame instead of hundreds of
  // <Circle> views. Screen-space `d` string, capped to bound bridge traffic.
  const gridD = useMemo(() => {
    if (grid === 'none') return null
    const z = camera.z
    if (!Number.isFinite(z) || z <= 0) return null
    const x0 = Math.floor(-camera.x / GRID_STEP) * GRID_STEP
    const y0 = Math.floor(-camera.y / GRID_STEP) * GRID_STEP
    const cols = Math.ceil(width / z / GRID_STEP) + 2
    const rows = Math.ceil(height / z / GRID_STEP) + 2
    if (cols <= 0 || rows <= 0) return null
    if (cols * rows > MAX_GRID_DOTS) return null
    let d = ''
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const sx = Math.round(((x0 + i * GRID_STEP) + camera.x) * z * 10) / 10
        const sy = Math.round(((y0 + j * GRID_STEP) + camera.y) * z * 10) / 10
        if (sx < -8 || sy < -8 || sx > width + 8 || sy > height + 8) continue
        d += `M${sx} ${sy}h0.01`
      }
    }
    return d || null
  }, [camera.x, camera.y, camera.z, grid, width, height])

  const inkOn = !readonly && isInkCapturingTool(tool, pens)

  return (
    <View style={styles.root} {...camPan.panHandlers}>
      <View style={[styles.board, { width, height }]}>
        {gridD ? (
          <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Path
              d={gridD}
              stroke="rgba(60,50,30,0.28)"
              strokeWidth={GRID_DOT_R * 2}
              strokeLinecap="round"
              fill="none"
            />
          </Svg>
        ) : null}
        <ShapeLayer
          width={width}
          height={height}
          zoom={camera.z}
          space="world"
          camera={camera}
          shapes={shapes}
          tool={tool}
          color={color}
          size={size}
          geoKind={geoKind}
          fill={fill}
          selectedId={selectedId}
          readonly={readonly || inkOn}
          onCommit={onCommitShape}
          onMove={onMoveShape}
          onSelect={onSelect}
          onPlaceText={onPlaceText}
          onResize={onResizeShape}
          onEditText={onEditText}
        />
        <InkOverlay
          width={width}
          height={height}
          zoom={camera.z}
          paperWidth={width}
          paperHeight={height}
          blocks={[]}
          tool={tool}
          color={color}
          size={size}
          pens={pens}
          readonly={readonly}
          variant="board"
          camera={camera}
          boardShapes={shapes}
          onCommitStroke={onCommitInk}
          onErase={onEraseInk}
          onEraseShapeIds={onEraseShapeIds}
        />
        <TextBoxLayer
          shapes={shapes}
          camera={camera}
          selectedId={selectedId}
          editingId={editingTextId}
          readonly={readonly}
          onChange={onChangeText}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f3efe6' },
  board: { flex: 1, overflow: 'hidden' },
})
