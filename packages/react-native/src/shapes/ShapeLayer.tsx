import { useCallback, useEffect, useRef, useState } from 'react'
import {
  PanResponder,
  StyleSheet,
  View,
  type GestureResponderEvent,
} from 'react-native'
import Svg, { G } from 'react-native-svg'
import type {
  Camera,
  ColorId,
  FillId,
  GeoId,
  ShapeRecord,
  SizeId,
} from '@incantly/canvas/headless'
import {
  geoFromDrag,
  hitResizeCorner,
  hitTopShape,
  isShapeCreateTool,
  isTinyGeo,
  isTinyLineish,
  localBounds,
  pageBounds,
  resizeBox,
  shapeRenderable,
  type ResizeCorner,
} from '@incantly/canvas/headless'
import { DraftSvg, ShapeSvg } from './ShapeSvg.js'
import { eventToShapePoint, type ShapeSpace } from './coords.js'

type LineDraft = {
  kind: 'lineish'
  type: 'line' | 'arrow'
  x: number
  y: number
  dx: number
  dy: number
  color: ColorId
  size: SizeId
}
type GeoDraft = {
  kind: 'geo'
  geo: GeoId
  x: number
  y: number
  w: number
  h: number
  color: ColorId
  size: SizeId
  fill: FillId
}
export type ShapeDraft = LineDraft | GeoDraft

type DragState = {
  id: string
  origX: number
  origY: number
  startX: number
  startY: number
  dx: number
  dy: number
  moved: boolean
  resize?: {
    corner: ResizeCorner
    start: { x: number; y: number; w: number; h: number }
    now: { x: number; y: number; w: number; h: number }
    minW: number
    minH: number
  }
}

function resizable(s: ShapeRecord): boolean {
  return s.type === 'text' || s.type === 'geo'
}

export interface ShapeLayerProps {
  width: number
  height: number
  zoom: number
  space?: ShapeSpace
  camera?: Camera
  paperWidth?: number
  paperHeight?: number
  shapes: readonly ShapeRecord[]
  tool: string
  color: ColorId
  size: SizeId
  geoKind: GeoId
  fill?: FillId
  selectedId: string | null
  readonly?: boolean
  onCommit: (draft: ShapeDraft) => void
  onMove: (id: string, x: number, y: number) => void
  onSelect: (id: string | null) => void
  onPlaceText?: (x: number, y: number) => void
  onResize?: (id: string, box: { x: number; y: number; w: number; h: number }) => void
  onEditText?: (id: string | null) => void
}

export function ShapeLayer({
  width,
  height,
  zoom,
  space = 'paper',
  camera,
  paperWidth = width,
  paperHeight = height,
  shapes,
  tool,
  color,
  size,
  geoKind,
  fill = 'none',
  selectedId,
  readonly,
  onCommit,
  onMove,
  onSelect,
  onPlaceText,
  onResize,
  onEditText,
}: ShapeLayerProps) {
  const live = useRef<ShapeDraft | null>(null)
  const geoOrigin = useRef<{ x: number; y: number } | null>(null)
  const drag = useRef<DragState | null>(null)
  const drawing = useRef(false)
  const [tick, setTick] = useState(0)
  const raf = useRef<number | null>(null)

  const toolRef = useRef(tool)
  const colorRef = useRef(color)
  const sizeRef = useRef(size)
  const geoRef = useRef(geoKind)
  const fillRef = useRef(fill)
  const zoomRef = useRef(zoom)
  const spaceRef = useRef(space)
  const cameraRef = useRef(camera)
  const paperRef = useRef({ w: paperWidth, h: paperHeight })
  const shapesRef = useRef(shapes)
  const selectedIdRef = useRef(selectedId)
  const readonlyRef = useRef(!!readonly)
  const onCommitRef = useRef(onCommit)
  const onMoveRef = useRef(onMove)
  const onSelectRef = useRef(onSelect)
  const onPlaceTextRef = useRef(onPlaceText)
  const onResizeRef = useRef(onResize)
  const onEditTextRef = useRef(onEditText)
  toolRef.current = tool
  colorRef.current = color
  sizeRef.current = size
  geoRef.current = geoKind
  fillRef.current = fill
  zoomRef.current = zoom
  spaceRef.current = space
  cameraRef.current = camera
  paperRef.current = { w: paperWidth, h: paperHeight }
  shapesRef.current = shapes
  selectedIdRef.current = selectedId
  readonlyRef.current = !!readonly
  onCommitRef.current = onCommit
  onMoveRef.current = onMove
  onSelectRef.current = onSelect
  onPlaceTextRef.current = onPlaceText
  onResizeRef.current = onResize
  onEditTextRef.current = onEditText

  const bump = useCallback(() => {
    if (raf.current != null) return
    raf.current = requestAnimationFrame(() => {
      raf.current = null
      setTick((n) => n + 1)
    })
  }, [])

  useEffect(() => {
    return () => {
      if (raf.current != null) cancelAnimationFrame(raf.current)
    }
  }, [])

  const pointOf = (e: GestureResponderEvent, clamp: boolean) =>
    eventToShapePoint(
      e.nativeEvent.locationX,
      e.nativeEvent.locationY,
      spaceRef.current,
      zoomRef.current,
      paperRef.current.w,
      paperRef.current.h,
      cameraRef.current,
      clamp,
    )

  const hitTol = () =>
    10 /
    Math.max(
      0.35,
      spaceRef.current === 'world' ? cameraRef.current?.z ?? 1 : zoomRef.current,
    )

  const zoomNow = () =>
    Math.max(
      0.35,
      spaceRef.current === 'world' ? cameraRef.current?.z ?? 1 : zoomRef.current,
    )

  const capturing = !readonly && (isShapeCreateTool(tool) || tool === 'select' || tool === 'text')

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => {
        if (readonlyRef.current) return false
        const t = toolRef.current
        return isShapeCreateTool(t) || t === 'select' || t === 'text'
      },
      onMoveShouldSetPanResponder: () => drawing.current,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        if (readonlyRef.current) return
        const t = toolRef.current
        const p = pointOf(e, isShapeCreateTool(t))
        if (!p) return
        live.current = null
        drag.current = null
        geoOrigin.current = null
        if (t === 'select' || t === 'text') {
          const selected = shapesRef.current.find((s) => s.id === selectedIdRef.current)
          if (t === 'select' && selected && resizable(selected)) {
            const corner = hitResizeCorner(pageBounds(selected), p.x, p.y, 16 / zoomNow())
            if (corner) {
              drawing.current = true
              const start = {
                x: selected.x,
                y: selected.y,
                w: localBounds(selected).w,
                h: localBounds(selected).h,
              }
              drag.current = {
                id: selected.id,
                origX: selected.x,
                origY: selected.y,
                startX: p.x,
                startY: p.y,
                dx: 0,
                dy: 0,
                moved: false,
                resize: {
                  corner,
                  start,
                  now: { ...start },
                  minW: selected.type === 'text' ? 80 : 40,
                  minH: 36,
                },
              }
              onEditTextRef.current?.(null)
              bump()
              return
            }
          }
          const hit = hitTopShape(shapesRef.current.filter(shapeRenderable), p.x, p.y, hitTol())
          if (hit) {
            drawing.current = true
            drag.current = {
              id: hit.id,
              origX: hit.x,
              origY: hit.y,
              startX: p.x,
              startY: p.y,
              dx: 0,
              dy: 0,
              moved: false,
            }
            onSelectRef.current(hit.id)
            onEditTextRef.current?.(null)
            bump()
            return
          }
          drawing.current = t === 'text'
          onSelectRef.current(null)
          onEditTextRef.current?.(null)
          if (t === 'text') onPlaceTextRef.current?.(p.x, p.y)
          return
        }
        if (!isShapeCreateTool(t)) return
        drawing.current = true
        onSelectRef.current(null)
        onEditTextRef.current?.(null)
        if (t === 'line' || t === 'arrow') {
          live.current = {
            kind: 'lineish',
            type: t,
            x: p.x,
            y: p.y,
            dx: 0.01,
            dy: 0.01,
            color: colorRef.current,
            size: sizeRef.current,
          }
        } else {
          geoOrigin.current = p
          live.current = {
            kind: 'geo',
            geo: geoRef.current,
            x: p.x,
            y: p.y,
            w: 1,
            h: 1,
            color: colorRef.current,
            size: sizeRef.current,
            fill: fillRef.current,
          }
        }
        bump()
      },
      onPanResponderMove: (e) => {
        if (!drawing.current) return
        const p = pointOf(e, true)
        if (!p) return
        const d = drag.current
        if (d) {
          d.dx = p.x - d.startX
          d.dy = p.y - d.startY
          d.moved = d.moved || Math.hypot(d.dx, d.dy) > 2 / zoomNow()
          if (d.resize) {
            d.resize.now = resizeBox(
              d.resize.start,
              d.resize.corner,
              p,
              d.resize.minW,
              d.resize.minH,
            )
          }
          bump()
          return
        }
        const draft = live.current
        if (!draft) return
        if (draft.kind === 'lineish') {
          draft.dx = p.x - draft.x
          draft.dy = p.y - draft.y
        } else if (geoOrigin.current) {
          const box = geoFromDrag(geoOrigin.current, p)
          draft.x = box.x
          draft.y = box.y
          draft.w = box.w
          draft.h = box.h
        }
        bump()
      },
      onPanResponderRelease: () => {
        drawing.current = false
        const d = drag.current
        drag.current = null
        const draft = live.current
        live.current = null
        geoOrigin.current = null
        bump()
        if (d) {
          if (d.resize) {
            if (d.moved) onResizeRef.current?.(d.id, d.resize.now)
            return
          }
          if (d.moved) onMoveRef.current(d.id, d.origX + d.dx, d.origY + d.dy)
          else {
            onSelectRef.current(d.id)
            const hit = shapesRef.current.find((s) => s.id === d.id)
            onEditTextRef.current?.(hit?.type === 'text' ? d.id : null)
          }
          return
        }
        if (!draft) return
        const z = zoomNow()
        if (draft.kind === 'lineish') {
          if (isTinyLineish(draft.dx, draft.dy, z)) return
          onCommitRef.current(draft)
          return
        }
        if (isTinyGeo(draft.w, draft.h, z)) return
        onCommitRef.current(draft)
      },
      onPanResponderTerminate: () => {
        drawing.current = false
        live.current = null
        drag.current = null
        geoOrigin.current = null
        bump()
      },
    }),
  ).current

  void tick
  const visible = shapes.filter(shapeRenderable)
  const cam = camera ?? { x: 0, y: 0, z: zoom }
  const transform =
    space === 'world' ? `scale(${cam.z}) translate(${cam.x} ${cam.y})` : `scale(${zoom})`
  const dragNow = drag.current
  const showHandles = tool === 'select'

  return (
    <View
      collapsable={false}
      style={[styles.fill, { width, height }]}
      pointerEvents={capturing ? 'auto' : 'none'}
      {...(capturing ? pan.panHandlers : null)}
    >
      <Svg width={width} height={height} pointerEvents="none">
        <G transform={transform}>
          {visible.map((s) => {
            let preview = s
            if (dragNow && dragNow.id === s.id) {
              if (dragNow.resize) {
                const box = dragNow.resize.now
                preview = {
                  ...s,
                  x: box.x,
                  y: box.y,
                  props: { ...s.props, w: box.w, h: box.h },
                } as ShapeRecord
              } else {
                preview = { ...s, x: dragNow.origX + dragNow.dx, y: dragNow.origY + dragNow.dy }
              }
            }
            return (
              <ShapeSvg
                key={s.id}
                shape={preview}
                selected={s.id === selectedId}
                resizeHandles={showHandles && resizable(s) && s.id === selectedId}
              />
            )
          })}
          <DraftSvg draft={live.current} />
        </G>
      </Svg>
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', left: 0, top: 0, zIndex: 3 },
})
