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
} from '@quickdrawjs/core'

export interface QuickdrawRef {
  loadSnapshot(snapshot: Snapshot, fit?: boolean): void
  applyDiff(diff: Diff): void
  setTool(tool: ToolId): void
  setStyle(key: keyof Styles, value: ColorId | SizeId | DashId | FillId | FontId): void
  setGrid(grid: GridId): void
  undo(): void
  redo(): void
  clear(): void
  fitContent(animate?: number): void
  getSnapshot(): Promise<Snapshot>
  exportPng(opts?: { background?: boolean; scale?: number; margin?: number }): Promise<string | null>
}

export interface QuickdrawProps {
  theme?: ThemeId | string
  grid?: GridId
  readonly?: boolean
  hideUi?: boolean
  themeToggle?: boolean
  gridControl?: boolean
  watermark?: boolean
  snapshot?: Snapshot
  styles?: Partial<Styles>
  onReady?: () => void
  onChange?: (diff: Diff, source: DiffSource) => void
  onSelectionChange?: (ids: string[]) => void
  onThemeChange?: (theme: ThemeId) => void
  onGridChange?: (grid: GridId) => void
  onSave?: (dataUrl: string, background: boolean) => void
  onError?: (message: string) => void
  style?: any
  webviewProps?: Record<string, any>
}
