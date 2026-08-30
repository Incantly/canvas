export type ToolId =
  | 'select' | 'hand' | 'draw' | 'highlight' | 'eraser' | 'laser'
  | 'arrow' | 'line' | 'geo' | 'text' | 'note' | 'image'

export type ColorId =
  | 'black' | 'grey' | 'light-violet' | 'violet' | 'blue' | 'light-blue'
  | 'yellow' | 'orange' | 'green' | 'light-green' | 'light-red' | 'red'

export type SizeId = 's' | 'm' | 'l' | 'xl'
export type DashId = 'draw' | 'solid' | 'dashed' | 'dotted'
export type FillId = 'none' | 'semi' | 'solid' | 'pattern'
export type FontId = 'draw' | 'sans' | 'serif' | 'mono'
export type GeoId = 'rectangle' | 'ellipse' | 'triangle' | 'diamond' | 'hexagon' | 'star' | 'cloud'
export type ThemeId = 'light' | 'dark'
export type GridId = 'none' | 'lines' | 'ruled' | 'dots' | 'crosses' | 'iso'

export interface Bounds { x: number; y: number; w: number; h: number }
export interface Camera { x: number; y: number; z: number }
