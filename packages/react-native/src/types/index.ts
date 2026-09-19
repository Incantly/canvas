import * as React from 'react'
import type {
  ColorId,
  DashId,
  Diff,
  DiffSource,
  EraserMode,
  FillId,
  FontId,
  GridId,
  SizeId,
  Snapshot,
  Styles,
  ThemeId,
  ToolId,
  VersionKind,
  PaperSizeId,
  PaperStyleId,
} from '@incantly/canvas'
import type { FormatBarConfig } from '../document/format-bar-config.js'
import type { InkBarConfig } from '../ink/ink-bar-config.js'
import type { CanvasInkChromeProps } from '../ink/canvas-ink-chrome-context.js'
import type { VersionStorage, InkPenDefinition } from '@incantly/canvas/headless'

export interface VersionSummary {
  id: string
  createdAt: number
  label?: string
  kind: VersionKind
}

export interface SafeAreaInsets {
  top?: number
  right?: number
  bottom?: number
  left?: number
}

export interface CanvasRef {
  loadSnapshot(snapshot: Snapshot, fit?: boolean): void
  applyDiff(diff: Diff): void
  setTool(tool: ToolId | string): void
  setStyle(key: keyof Styles, value: ColorId | SizeId | DashId | FillId | FontId): void
  /** Continuous pen width in paper units (slider). */
  setPenWidth(width: number): void
  /** Eraser footprint radius in paper units. */
  setEraserRadius(radius: number): void
  /** Eraser behavior: whole-stroke vs pixel erase. */
  setEraserMode(mode: EraserMode): void
  setDocumentBackground(color: string | null): void
  setDocumentPaperColor(color: string | null): void
  setGrid(grid: GridId): void
  undo(): void
  redo(): void
  clear(): void
  fitContent(animate?: number): void
  focusPageDocument(): void
  refreshPageDocument(): void
  setPage(pageId: string, opts?: { fit?: boolean; animate?: number }): void
  addPage(opts?: {
    width?: number
    height?: number
    name?: string
    paperSize?: PaperSizeId
    paperStyle?: PaperStyleId
  }): void
  setPagePaper(
    pageId: string,
    opts: {
      width?: number
      height?: number
      paperSize?: PaperSizeId
      paperStyle?: PaperStyleId
    },
  ): void
  removePage(pageId?: string): void
  getSnapshot(): Promise<Snapshot>
  exportPng(opts?: { background?: boolean; scale?: number; margin?: number }): Promise<string | null>
  listVersions(): Promise<VersionSummary[]>
  revertVersion(versionId: string): Promise<void>
  saveVersion(label?: string): Promise<VersionSummary>
}

export interface CanvasProps {
  theme?: ThemeId | string
  grid?: GridId
  readonly?: boolean
  hideUi?: boolean
  themeToggle?: boolean
  gridControl?: boolean
  watermark?: boolean
  snapshot?: Snapshot
  styles?: Partial<Styles>
  documentMode?: boolean
  documentBackground?: string | null
  documentPaperColor?: string | null
  uiTools?: ToolId[]
  uiIcons?: Partial<Record<string, string>>
  hidePagesBar?: boolean
  /**
   * Document page navigator style. `strip` (default) is the bottom bar with
   * prev/next, add, and delete. `floating` is a bottom-left pill with
   * prev/next + current/total — add/delete live in host chrome instead.
   */
  pagerVariant?: 'strip' | 'floating'
  touchUi?: boolean
  safeAreaInsets?: SafeAreaInsets
  onReady?: () => void
  onChange?: (diff: Diff, source: DiffSource) => void
  onSelectionChange?: (ids: string[]) => void
  onThemeChange?: (theme: ThemeId) => void
  onGridChange?: (grid: GridId) => void
  onEdit?: () => void
  onKeyboard?: (height: number) => void
  onSave?: (dataUrl: string, background: boolean) => void
  onError?: (message: string) => void
  onPromptLink?: (respond: (url: string | null) => void) => void
  onReadClipboard?: (respond: (text: string) => void) => void
  /**
   * Customize document format-bar labels and icons per item.
   * Keys: `paragraph`, `heading1`…`heading3`, `bulletList`, `numberedList`,
   * `quote`, `codeBlock`, `divider`, `bold`, `italic`, `underline`,
   * `strikethrough`, `inlineCode`, `link`.
   */
  formatBar?: FormatBarConfig
  /**
   * Replace Type / Pen / Highlight / Eraser (and host pen) labels or icons.
   * Same shape as `formatBar`: `{ draw: { icon: <PenIcon /> }, eraser: { hidden: true } }`.
   */
  inkBar?: InkBarConfig
  /**
   * Hide the default top ink toolbar. Use `renderInkBar`, `children` + `CanvasInkToolbar`,
   * or `useCanvasInkChrome()` to host chrome anywhere (bottom, side, floating).
   */
  hideInkBar?: boolean
  /**
   * Fully custom ink chrome. Receives the same props as `<InkToolbar>`.
   * Return a positioned view (e.g. absolute bottom dock) inside the canvas root.
   */
  renderInkBar?: (chrome: CanvasInkChromeProps) => React.ReactNode
  /** Rendered above the viewport inside `<Canvas>` (pointerEvents box-none). */
  children?: React.ReactNode
  /**
   * Host drawing tools. Defaults to pen + highlighter.
   * Each pen's `style` controls pressure, width, opacity, and stored `kind`.
   */
  inkPens?: readonly InkPenDefinition[]
  /**
   * Persistent version history. Host should pass `createSqliteVersionStorage(...)`.
   * Defaults to in-memory (lost when the component unmounts).
   */
  versionStorage?: VersionStorage
  /** Scopes version rows. Defaults to the core notebook id. */
  notebookId?: string
  style?: any
  webviewProps?: Record<string, any>
}
