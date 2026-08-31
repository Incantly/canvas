import * as React from 'react'
import type {
  ColorId,
  DashId,
  Diff,
  DiffSource,
  FillId,
  FontId,
  GridId,
  SizeId,
  Snapshot,
  Styles,
  ThemeId,
  ToolId,
  VersionKind,
} from '@incantly/canvas'

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
  setTool(tool: ToolId): void
  setStyle(key: keyof Styles, value: ColorId | SizeId | DashId | FillId | FontId): void
  setDocumentBackground(color: string | null): void
  setGrid(grid: GridId): void
  undo(): void
  redo(): void
  clear(): void
  fitContent(animate?: number): void
  focusPageDocument(): void
  refreshPageDocument(): void
  setPage(pageId: string, opts?: { fit?: boolean; animate?: number }): void
  addPage(opts?: { width?: number; height?: number; name?: string }): void
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
  uiTools?: ToolId[]
  uiIcons?: Partial<Record<string, string>>
  hidePagesBar?: boolean
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
  style?: any
  webviewProps?: Record<string, any>
}
