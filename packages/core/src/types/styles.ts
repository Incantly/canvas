import type { ColorId, SizeId, DashId, FillId, FontId } from './base.js'

export interface Styles {
  color: ColorId
  size: SizeId
  dash: DashId
  fill: FillId
  font: FontId
}

export interface ScribbleStroke {
  id?: string
  points: Array<{ x: number; y: number }>
  opacity?: number
  done?: boolean
  at?: number
}
