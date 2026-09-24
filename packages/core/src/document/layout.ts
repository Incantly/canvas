import type { PageLayout, PageLayoutSection, PageSetup } from './types.js'

export const PAGE_PRESETS = {
  a4: { width: 595.28, height: 841.89 },
  letter: { width: 612, height: 792 },
  legal: { width: 612, height: 1008 },
} as const

export function normalizePageSetup(input: PageSetup): PageSetup {
  const preset = input.size === 'custom' ? undefined : PAGE_PRESETS[input.size]
  const width = preset?.width ?? input.width
  const height = preset?.height ?? input.height
  if (width === undefined || height === undefined || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    throw new Error('Page dimensions must be positive finite values in points')
  return {
    ...input,
    width: input.size === 'custom' ? width : undefined,
    height: input.size === 'custom' ? height : undefined,
    margins: { ...input.margins },
  }
}

export function createPageLayout(pageSetup: PageSetup, id = 'section-1'): PageLayout {
  const section: PageLayoutSection = { id, pageSetup: normalizePageSetup(pageSetup) }
  return { version: 1, defaultSection: section, sections: [section] }
}

export function contentRegion(setup: PageSetup): { width: number; height: number } {
  const normalized = normalizePageSetup(setup)
  const size = normalized.size === 'custom' ? { width: normalized.width!, height: normalized.height! } : PAGE_PRESETS[normalized.size]
  const landscape = normalized.orientation === 'landscape'
  const width = landscape ? size.height : size.width
  const height = landscape ? size.width : size.height
  return { width: width - normalized.margins.left - normalized.margins.right, height: height - normalized.margins.top - normalized.margins.bottom }
}
