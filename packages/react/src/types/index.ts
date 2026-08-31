import * as React from 'react'
import type {
  Camera,
  Diff,
  DiffSource,
  Editor,
  BoardUI,
  GridId,
  Snapshot,
  Store,
  Styles,
  ThemeId,
} from '@incantly/canvas'

export interface CanvasRef {
  readonly editor: Editor | null
  readonly ui: BoardUI | null
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
  snapshot?: Snapshot
  camera?: Camera
  styles?: Partial<Styles>
  autoFit?: boolean
  onMount?: (editor: Editor, ui: BoardUI) => void
  onChange?: (diff: Diff, source: DiffSource, editor: Editor) => void
  onSelectionChange?: (ids: string[], editor: Editor) => void
  onThemeChange?: (theme: ThemeId, editor: Editor) => void
  onGridChange?: (grid: GridId, editor: Editor) => void
  onSave?: (blob: Blob, background: boolean) => void
  className?: string
  style?: React.CSSProperties
}