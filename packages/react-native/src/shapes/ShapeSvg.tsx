import { Ellipse, G, Path, Rect } from 'react-native-svg'
import type {
  ColorId,
  FillId,
  GeoId,
  ShapeRecord,
  SizeId,
} from '@incantly/canvas/headless'
import {
  HIGHLIGHT_ALPHA,
  HIGHLIGHT_SCALE,
  SIZES,
  arrowHeadPath,
  geoSvgPath,
  lineSvgPath,
  localBounds,
  shapeRenderable,
  strokeDashArray,
  svgPathFromPackedPts,
  themeOf,
} from '@incantly/canvas/headless'

function strokeColor(color: ColorId | undefined): string {
  return themeOf('light').colors[color ?? 'black']?.stroke ?? '#1d1d1d'
}

function fillColor(color: ColorId | undefined, fill: FillId | undefined): string | 'none' {
  if (!fill || fill === 'none') return 'none'
  return themeOf('light').colors[color ?? 'black']?.fill ?? '#e8e8e8'
}

function fillOpacity(fill: FillId | undefined): number {
  if (fill === 'semi') return 0.55
  if (fill === 'pattern') return 0.35
  return 1
}

function widthOf(size: SizeId | undefined): number {
  return SIZES[size ?? 'm'] ?? SIZES.m
}

function ShapePath({
  d,
  color,
  size,
  dash,
  fill,
}: {
  d: string
  color: ColorId
  size: SizeId
  dash?: string
  fill?: FillId
}) {
  if (!d) return null
  const sw = widthOf(size)
  const dashArr = strokeDashArray((dash as 'solid' | 'dashed' | 'dotted' | 'draw') ?? 'solid', size)
  return (
    <Path
      d={d}
      fill={fillColor(color, fill)}
      fillOpacity={fillOpacity(fill)}
      stroke={strokeColor(color)}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={dashArr}
    />
  )
}

export function ShapeSvg({
  shape,
  selected,
  resizeHandles,
}: {
  shape: ShapeRecord
  selected?: boolean
  resizeHandles?: boolean
}) {
  if (!shapeRenderable(shape)) return null
  const rot = shape.rot || 0
  const inner = <ShapeInner shape={shape} />
  return (
    <G transform={`translate(${shape.x} ${shape.y}) rotate(${(rot * 180) / Math.PI})`}>
      {inner}
      {selected ? <SelectionBox shape={shape} handles={!!resizeHandles} /> : null}
    </G>
  )
}

function SelectionBox({ shape, handles }: { shape: ShapeRecord; handles: boolean }) {
  const b = localBounds(shape)
  const hs = 8
  const corners = handles
    ? [
        { x: b.x, y: b.y },
        { x: b.x + b.w, y: b.y },
        { x: b.x, y: b.y + b.h },
        { x: b.x + b.w, y: b.y + b.h },
      ]
    : []
  return (
    <>
      <Rect
        x={b.x - 4}
        y={b.y - 4}
        width={b.w + 8}
        height={b.h + 8}
        fill="none"
        stroke="#1967d2"
        strokeWidth={1.5}
        strokeDasharray="4,3"
      />
      {corners.map((c, i) => (
        <Rect
          key={i}
          x={c.x - hs / 2}
          y={c.y - hs / 2}
          width={hs}
          height={hs}
          fill="#fff"
          stroke="#1967d2"
          strokeWidth={1.5}
        />
      ))}
    </>
  )
}

function ShapeInner({ shape }: { shape: ShapeRecord }) {
  const p = shape.props as unknown as Record<string, unknown>
  const color = (p.color as ColorId) ?? 'black'
  const size = (p.size as SizeId) ?? 'm'
  const dash = p.dash as string | undefined

  if (shape.type === 'geo') {
    const w = Number(p.w) || 1
    const h = Number(p.h) || 1
    const geo = (p.geo as GeoId) || 'rectangle'
    const fill = (p.fill as FillId) || 'none'
    if (geo === 'ellipse') {
      return (
        <Ellipse
          cx={w / 2}
          cy={h / 2}
          rx={w / 2}
          ry={h / 2}
          fill={fillColor(color, fill)}
          fillOpacity={fillOpacity(fill)}
          stroke={strokeColor(color)}
          strokeWidth={widthOf(size)}
          strokeDasharray={strokeDashArray((dash as 'solid') ?? 'solid', size)}
        />
      )
    }
    return (
      <ShapePath d={geoSvgPath(geo, w, h)} color={color} size={size} dash={dash} fill={fill} />
    )
  }

  if (shape.type === 'line' || shape.type === 'arrow') {
    const dx = Number(p.dx) || 0
    const dy = Number(p.dy) || 0
    const bend = Number(p.bend) || 0
    return (
      <>
        <ShapePath d={lineSvgPath(dx, dy, bend)} color={color} size={size} dash={dash} fill="none" />
        {shape.type === 'arrow' ? (
          <Path
            d={arrowHeadPath(dx, dy, bend, size)}
            fill="none"
            stroke={strokeColor(color)}
            strokeWidth={widthOf(size)}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
      </>
    )
  }

  if (shape.type === 'draw' || shape.type === 'highlight') {
    const pts = (p.pts as number[]) ?? []
    const d = svgPathFromPackedPts(pts)
    if (!d) return null
    const sw =
      shape.type === 'highlight' ? widthOf(size) * HIGHLIGHT_SCALE : widthOf(size) * 0.75
    return (
      <Path
        d={d}
        fill="none"
        stroke={strokeColor(color)}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity={shape.type === 'highlight' ? HIGHLIGHT_ALPHA : 1}
      />
    )
  }

  if (shape.type === 'text') {
    const b = localBounds(shape)
    const fill = (p.fill as FillId) || 'none'
    return (
      <Rect
        x={0}
        y={0}
        width={Math.max(40, b.w)}
        height={Math.max(28, b.h)}
        rx={4}
        fill={fillColor(color, fill)}
        fillOpacity={fillOpacity(fill)}
        stroke={strokeColor(color)}
        strokeWidth={1}
      />
    )
  }

  return null
}

/** Live create preview (not yet in the store). */
export function DraftSvg({
  draft,
}: {
  draft:
    | { kind: 'lineish'; type: 'line' | 'arrow'; x: number; y: number; dx: number; dy: number; color: ColorId; size: SizeId }
    | { kind: 'geo'; geo: GeoId; x: number; y: number; w: number; h: number; color: ColorId; size: SizeId; fill: FillId }
    | null
}) {
  if (!draft) return null
  if (draft.kind === 'lineish') {
    return (
      <G transform={`translate(${draft.x} ${draft.y})`}>
        <ShapePath
          d={lineSvgPath(draft.dx, draft.dy, 0)}
          color={draft.color}
          size={draft.size}
          fill="none"
        />
        {draft.type === 'arrow' ? (
          <Path
            d={arrowHeadPath(draft.dx, draft.dy, 0, draft.size)}
            fill="none"
            stroke={strokeColor(draft.color)}
            strokeWidth={widthOf(draft.size)}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
      </G>
    )
  }
  return (
    <G transform={`translate(${draft.x} ${draft.y})`}>
      {draft.geo === 'ellipse' ? (
        <Ellipse
          cx={draft.w / 2}
          cy={draft.h / 2}
          rx={draft.w / 2}
          ry={draft.h / 2}
          fill="none"
          stroke={strokeColor(draft.color)}
          strokeWidth={widthOf(draft.size)}
        />
      ) : (
        <ShapePath
          d={geoSvgPath(draft.geo, draft.w, draft.h)}
          color={draft.color}
          size={draft.size}
          fill="none"
        />
      )}
    </G>
  )
}

