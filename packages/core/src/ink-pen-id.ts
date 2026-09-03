const INK_PEN_ID_MAX = 64
const INK_PEN_ID_RE = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/
const RESERVED_INK_IDS = new Set([
  'select',
  'type',
  'eraser',
  'hand',
  'laser',
  'arrow',
  'line',
  'geo',
  'text',
  'note',
  'image',
])

/** Chrome ids that are never host pens. */
export function isReservedInkChromeId(id: string): boolean {
  return RESERVED_INK_IDS.has(id)
}

/** Safe host pen id, or undefined. */
export function sanitizeInkPenId(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const id = raw.trim()
  if (id.length === 0 || id.length > INK_PEN_ID_MAX) return undefined
  if (!INK_PEN_ID_RE.test(id)) return undefined
  if (isReservedInkChromeId(id)) return undefined
  return id
}
