import type { ColorId, ThemeId } from './base.js'

export interface ThemePaletteEntry {
  stroke: string
  fill: string
  note: string
}

export interface ThemeGridConfig {
  line: { minor: string; major: string }
  dot: { minor: string; major: string }
}

export interface Theme {
  id: ThemeId
  background: string
  colors: Record<ColorId, ThemePaletteEntry>
  noteText: string
  selection: string
  selectionFill: string
  handleFill: string
  scribble: string
  grid: ThemeGridConfig
}
