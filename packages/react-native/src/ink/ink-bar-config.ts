import type { ReactNode } from 'react'
import type { InkPenDefinition } from '@incantly/canvas/headless'

/** Type, eraser, or a host/built-in pen id (`draw`, `highlight`, `pencil`, …). */
export type InkBarItemId = string

export type InkBarMode = 'notes' | 'board'

/**
 * Per-item customization when hosting `<Canvas>` ink chrome.
 *
 * @example
 * ```tsx
 * <Canvas
 *   inkBar={{
 *     type: { name: 'Type', icon: <TypeIcon /> },
 *     select: { name: 'Cursor', icon: <CursorIcon /> },
 *     draw: { name: 'Ballpoint', icon: <PenIcon /> },
 *     eraser: { icon: <EraserIcon /> },
 *     highlight: { hidden: true },
 *   }}
 * />
 * ```
 */
export interface InkBarItemConfig {
  name?: string
  icon?: ReactNode
  hidden?: boolean
}

export type InkBarConfig = Partial<Record<string, InkBarItemConfig>>

export interface ResolvedInkBarItem {
  id: InkBarItemId
  name: string
  icon?: ReactNode
}

const NOTES_SHAPES: { id: string; name: string }[] = [
  { id: 'line', name: 'Line' },
  { id: 'arrow', name: 'Arrow' },
  { id: 'geo', name: 'Shape' },
]

const BOARD_PREFIX: { id: string; name: string }[] = [
  { id: 'hand', name: 'Hand' },
  { id: 'select', name: 'Cursor' },
]

export function resolveInkBarItems(
  pens: readonly InkPenDefinition[],
  config?: InkBarConfig,
  mode: InkBarMode = 'notes',
): ResolvedInkBarItem[] {
  const chrome: { id: string; name: string }[] =
    mode === 'board'
      ? [
          ...BOARD_PREFIX,
          ...pens.map((p) => ({ id: p.id, name: p.name })),
          { id: 'eraser', name: 'Eraser' },
          ...NOTES_SHAPES,
          { id: 'text', name: 'Text' },
        ]
      : [
          { id: 'type', name: 'Type' },
          { id: 'select', name: 'Cursor' },
          ...pens.map((p) => ({ id: p.id, name: p.name })),
          { id: 'eraser', name: 'Eraser' },
          ...NOTES_SHAPES,
        ]
  const out: ResolvedInkBarItem[] = []
  for (const item of chrome) {
    const custom = config?.[item.id]
    if (custom?.hidden) continue
    out.push({
      id: item.id,
      name: custom?.name?.trim() ? custom.name : item.name,
      icon: custom?.icon,
    })
  }
  return out
}
