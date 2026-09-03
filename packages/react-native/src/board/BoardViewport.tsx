import { useMemo, useRef, useState } from 'react'
import {
  PanResponder,
  StyleSheet,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
} from 'react-native'
import Svg, { Circle } from 'react-native-svg'
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
  cameraToCenter,
  cameraViewport,
  isInkCapturingTool,
  panCamera,
  pinchCamera,
  sanitizeCamera,
} from '@incantly/canvas/headless'
import { InkOverlay, type InkHit } from '../ink/InkOverlay.js'
import type { DrawingStroke } from '@incantly/canvas/headless'
import { ShapeLayer, type ShapeDraft } from '../shapes/ShapeLayer.js'
import { TextBoxLayer } from '../shapes/TextBoxLayer.js'
import { Minimap } from './Minimap.js'

function touchesOf(e: GestureResponderEvent): { x: number; y: number }[] {
  const t = e.nativeEvent.touches
  if (!t || t.length === 0) return [{ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }]
  return Array.from({ length: t.length }, (_, i) => ({
    x: t[i]!.locationX,
    y: t[i]!.locationY,
  }))
}

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
  const setCam = (next: Camera) => {
    const c = sanitizeCamera(next)
    cameraRef.current = c
    setLocalCam(c)
    onCamera?.(c)
  }

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
        panLast.current = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }
      },
      onPanResponderMove: (e) => {
        const pts = touchesOf(e)
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
          setCam(pinchCamera(pinch.current, now))
          return
        }
        if (toolRef.current !== 'hand') return
        const last = panLast.current
        const x = e.nativeEvent.locationX
        const y = e.nativeEvent.locationY
        if (last) setCam(panCamera(cameraRef.current, x - last.x, y - last.y))
        panLast.current = { x, y }
      },
      onPanResponderRelease: () => {
        pinch.current = null
        panLast.current = null
      },
      onPanResponderTerminate: () => {
        pinch.current = null
        panLast.current = null
      },
    }),
  ).current

  const gridDots = useMemo(() => {
    if (grid === 'none') return null
    const z = camera.z
    const step = 48
    const dots: { x: number; y: number }[] = []
    const x0 = Math.floor(-camera.x / step) * step
    const y0 = Math.floor(-camera.y / step) * step
    const cols = Math.ceil(width / z / step) + 2
    const rows = Math.ceil(height / z / step) + 2
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        dots.push({ x: x0 + i * step, y: y0 + j * step })
      }
    }
    return dots
  }, [camera.x, camera.y, camera.z, grid, width, height])

  const inkOn = !readonly && isInkCapturingTool(tool, pens)

  return (
    <View style={styles.root} {...camPan.panHandlers}>
      <View style={[styles.board, { width, height }]}>
        <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
          {gridDots
            ? gridDots.map((d, i) => {
                const sx = (d.x + camera.x) * camera.z
                const sy = (d.y + camera.y) * camera.z
                if (sx < -8 || sy < -8 || sx > width + 8 || sy > height + 8) return null
                return <Circle key={i} cx={sx} cy={sy} r={1.2} fill="rgba(60,50,30,0.28)" />
              })
            : null}
        </Svg>
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
        <Minimap
          shapes={shapes}
          viewport={cameraViewport(camera, width, height)}
          fallback={{ x: -200, y: -200, w: 800, h: 600 }}
          onPanTo={(wx, wy) => setCam(cameraToCenter(wx, wy, width, height, camera.z))}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f3efe6' },
  board: { flex: 1, overflow: 'hidden' },
})
