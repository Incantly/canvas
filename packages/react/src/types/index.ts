import * as React from 'react'
import type {
  Camera,
  Diff,
  DiffSource,
  DocumentUiOptions,
  Editor,
  BoardUI,
  GridId,
  Snapshot,
  Store,
  Styles,
  ThemeId,
  ToolId,
} from '@incantly/canvas'

export interface CanvasRef {
  readonly editor: Editor | null
  readonly ui: BoardUI | null
  getSnapshot(): Snapshot | null
  loadSnapshot(snapshot: Snapshot, fit?: boolean): void
}

export interface CanvasProps {
  theme?: ThemeId | string
  grid?: GridId
  readonly?: boolean
  hideUi?: boolean
  themeToggle?: boolean
  gridControl?: boolean
  watermark?: boolean
  store?: Store
  /** Initial uncontrolled snapshot. Ignored when `store` is provided and after mount. */
  initialSnapshot?: Snapshot
  /** @deprecated Use `initialSnapshot`. */
  snapshot?: Snapshot
  /** Initial camera only; use the Editor ref for later camera changes. */
  initialCamera?: Camera
  /** @deprecated Use `initialCamera`. */
  camera?: Camera
  /** Initial drawing styles only; use the Editor ref for later style changes. */
  initialStyles?: Partial<Styles>
  /** @deprecated Use `initialStyles`. */
  styles?: Partial<Styles>
  /** Fit once after mount. */
  fitOnMount?: boolean
  /** Refit whenever the host element is resized. */
  fitOnResize?: boolean
  /** @deprecated Use `fitOnMount` and `fitOnResize`. */
  autoFit?: boolean
  /** Initialization-only. Page body is the primary typing surface. */
  documentMode?: boolean
  /** Primary dock tools (notes preset when documentMode). */
  uiTools?: ToolId[]
  /** Custom dock icon SVG inner HTML. */
  uiIcons?: Partial<Record<string, string>>
  /** Hide page navigation bar (default true when documentMode). */
  hidePagesBar?: boolean
  /** Viewport/canvas color around the page sheet (documentMode). */
  documentBackground?: string | null
  /** Page sheet color behind rich text (documentMode). */
  documentPaperColor?: string | null
  /** Initialization-only touch-first formatting bar. */
  touchUi?: boolean
  /** Initialization-only slash menu and selection toolbar configuration. */
  documentUi?: DocumentUiOptions
  onMount?: (editor: Editor, ui: BoardUI) => void
  onChange?: (diff: Diff, source: DiffSource, editor: Editor) => void
  onSelectionChange?: (ids: string[], editor: Editor) => void
  onThemeChange?: (theme: ThemeId, editor: Editor) => void
  onGridChange?: (grid: GridId, editor: Editor) => void
  onSave?: (blob: Blob, background: boolean) => void
  className?: string
  style?: React.CSSProperties
}
