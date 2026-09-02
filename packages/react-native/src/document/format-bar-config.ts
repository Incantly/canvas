import type { ReactNode } from 'react'

/** Stable id for each format-bar control. */
export type FormatBarItemId =
  | 'paragraph'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'bulletList'
  | 'numberedList'
  | 'quote'
  | 'codeBlock'
  | 'divider'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'inlineCode'
  | 'link'

/** Alias used by applyFormat / BlockFormatBar. */
export type BlockFormatAction = FormatBarItemId

/**
 * Per-item customization when hosting `<Canvas>` / `<BlockFormatBar>`.
 *
 * @example
 * ```tsx
 * <Canvas
 *   formatBar={{
 *     paragraph: { name: 'Body', icon: <BodyIcon /> },
 *     heading1: { name: 'Title', icon: <H1Icon /> },
 *     bold: { name: 'Bold', icon: <BoldIcon /> },
 *     divider: { hidden: true },
 *   }}
 * />
 * ```
 */
export interface FormatBarItemConfig {
  /** Visible label (and accessibility name). Defaults to SDK label. */
  name?: string
  /** Custom icon node (SVG, Image, Text, etc.). Shown before the name when set. */
  icon?: ReactNode
  /** Hide this control from the bar. */
  hidden?: boolean
}

/** Map of format-bar item id → name / icon overrides. */
export type FormatBarConfig = Partial<Record<FormatBarItemId, FormatBarItemConfig>>

export interface FormatBarDefaultItem {
  id: FormatBarItemId
  /** Default English label used when `formatBar[id].name` is omitted. */
  name: string
}

/** Default order + names for every SDK format-bar item. */
export const DEFAULT_FORMAT_BAR_ITEMS: readonly FormatBarDefaultItem[] = [
  { id: 'paragraph', name: 'Text' },
  { id: 'heading1', name: 'Heading 1' },
  { id: 'heading2', name: 'Heading 2' },
  { id: 'heading3', name: 'Heading 3' },
  { id: 'bulletList', name: 'Bullet list' },
  { id: 'numberedList', name: 'Numbered list' },
  { id: 'quote', name: 'Quote' },
  { id: 'codeBlock', name: 'Code block' },
  { id: 'divider', name: 'Divider' },
  { id: 'bold', name: 'Bold' },
  { id: 'italic', name: 'Italic' },
  { id: 'underline', name: 'Underline' },
  { id: 'strikethrough', name: 'Strikethrough' },
  { id: 'inlineCode', name: 'Inline code' },
  { id: 'link', name: 'Link' },
] as const

export function resolveFormatBarItems(config?: FormatBarConfig): {
  id: FormatBarItemId
  name: string
  icon?: ReactNode
}[] {
  const out: { id: FormatBarItemId; name: string; icon?: ReactNode }[] = []
  for (const item of DEFAULT_FORMAT_BAR_ITEMS) {
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
