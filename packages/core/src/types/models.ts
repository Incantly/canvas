import type {
  ColorId,
  DashId,
  FillId,
  FontId,
  GeoId,
  GridId,
  PageLayout,
  SizeId,
} from './base.js'
import type { CanvasTextBlock } from '../canvas-text.js'

export type ShapeType =
  | 'draw'
  | 'highlight'
  | 'geo'
  | 'arrow'
  | 'line'
  | 'text'
  | 'note'
  | 'image'

interface BaseShape {
  id: string
  typeName: 'shape'
  parentId?: string
  x: number
  y: number
  rot: number
  z: number
}

export interface DrawShapeProps {
  pts: number[]
  color: ColorId
  size: SizeId
  dash?: DashId
  done: boolean
  isPen?: boolean
  /**
   * Explicit base width in paper units (replaces the `SIZES[size]` lookup).
   * Optional — absent means legacy `SizeId` rendering.
   */
  width?: number
}

export interface LineishShapeProps {
  dx: number
  dy: number
  bend: number
  color: ColorId
  size: SizeId
  dash: DashId
}

export interface GeoShapeProps {
  geo: GeoId
  w: number
  h: number
  color: ColorId
  size: SizeId
  dash: DashId
  fill: FillId
  font: FontId
  label?: string
  labelSize?: SizeId
}

export interface TextShapeProps {
  text?: string
  /** Structured content for positioned canvas text; unrelated to standalone documents. */
  blocks?: CanvasTextBlock[]
  color: ColorId
  size: SizeId
  font: FontId
  autosize?: boolean
  scale?: number
  w?: number
  /** Explicit box height (RN text boxes). Web ignores. */
  h?: number
  /** Box fill. `none` = transparent. Web ignores. */
  fill?: FillId
  align?: 'left' | 'center' | 'right'
}

export interface NoteShapeProps {
  text?: string
  /** Structured content for positioned canvas notes; unrelated to standalone documents. */
  blocks?: CanvasTextBlock[]
  color: ColorId
  size: SizeId
  font: FontId
  scale?: number
}

export interface ImageShapeProps {
  assetId: string
  w: number
  h: number
}

export interface DrawShapeRecord extends BaseShape {
  type: 'draw' | 'highlight'
  props: DrawShapeProps
}

export interface LineShapeRecord extends BaseShape {
  type: 'line'
  props: LineishShapeProps
}

export interface ArrowShapeRecord extends BaseShape {
  type: 'arrow'
  props: LineishShapeProps
}

export interface GeoShapeRecord extends BaseShape {
  type: 'geo'
  props: GeoShapeProps
}

export interface TextShapeRecord extends BaseShape {
  type: 'text'
  props: TextShapeProps
}

export interface NoteShapeRecord extends BaseShape {
  type: 'note'
  props: NoteShapeProps
}

export interface ImageShapeRecord extends BaseShape {
  type: 'image'
  props: ImageShapeProps
}

export type ShapeRecord =
  | DrawShapeRecord
  | LineShapeRecord
  | ArrowShapeRecord
  | GeoShapeRecord
  | TextShapeRecord
  | NoteShapeRecord
  | ImageShapeRecord

export interface AssetRecord {
  id: string
  typeName: 'asset'
  src: string
  w: number
  h: number
}

export interface PageRecord {
  id: string
  typeName: 'page'
  index: number
  x: number
  y: number
  width: number
  height: number
  name?: string
  grid?: GridId
}

export interface NotebookRecord {
  id: string
  typeName: 'notebook'
  pageLayout: PageLayout
  pageGap?: number
}

export type BoardRecord = ShapeRecord | AssetRecord | PageRecord | NotebookRecord

export type ShapeProps =
  | DrawShapeProps
  | LineishShapeProps
  | GeoShapeProps
  | TextShapeProps
  | NoteShapeProps
  | ImageShapeProps
