import type { DocumentNodeId } from './ids.js'

export interface PaginationBlockInput {
  nodeId: DocumentNodeId | string
  kind: string
  index: number
  explicitBreakBefore?: boolean
  keepWithNext?: boolean
  keepTogether?: boolean
  widows?: number
  orphans?: number
  intrinsicWidth?: number
  intrinsicHeight?: number
}

export interface PaginationMeasurement {
  nodeId: DocumentNodeId | string
  height: number
  lineCount?: number
  breakable?: boolean
  fragments?: Array<{ height: number; from?: number; to?: number }>
}

export interface PaginationRegion {
  pageIndex: number
  width: number
  height: number
  headerHeight: number
  footerHeight: number
}

export interface PaginationInput {
  blocks: PaginationBlockInput[]
  measurements: readonly PaginationMeasurement[]
  regions: readonly PaginationRegion[]
  startIndex?: number
}

export interface PaginationFragment {
  nodeId: string
  pageIndex: number
  from?: number
  to?: number
  height: number
  derivationKey: string
}

export interface PaginationPage {
  pageIndex: number
  blockStart: number
  blockEnd: number
  fragments: PaginationFragment[]
  derivationKey: string
}

export type PaginationWarningCode = 'overflow' | 'missing-measurement' | 'invalid-region' | 'unbreakable-overflow'
export interface PaginationWarning {
  code: PaginationWarningCode
  nodeId?: string
  pageIndex?: number
  message: string
}

export interface PaginationResult {
  pages: PaginationPage[]
  warnings: PaginationWarning[]
  invalidation: { fromBlock: number; throughBlock: number }
}

const finitePositive = (value: number): boolean => Number.isFinite(value) && value > 0

export function paginate(input: PaginationInput): PaginationResult {
  const pages: PaginationPage[] = []
  const warnings: PaginationWarning[] = []
  const measurements = new Map(input.measurements.map((value) => [String(value.nodeId), value]))
  let pageIndex = 0
  let blockStart = Math.max(0, input.startIndex ?? 0)
  let cursor = 0
  let fragments: PaginationFragment[] = []
  let used = 0
  const flush = (blockEnd: number): void => {
    if (!fragments.length) return
    const region = input.regions[pageIndex] ?? input.regions[input.regions.length - 1]
    const key = `${pageIndex}:${blockStart}:${blockEnd}:${fragments.map((item) => item.derivationKey).join(',')}`
    pages.push({ pageIndex, blockStart, blockEnd, fragments, derivationKey: key })
    fragments = []
    used = 0
    pageIndex++
    blockStart = blockEnd
    void region
  }
  for (let index = blockStart; index < input.blocks.length; index++) {
    const block = input.blocks[index]
    const measurement = measurements.get(String(block.nodeId))
    const region = input.regions[pageIndex]
    if (!measurement) {
      warnings.push({ code: 'missing-measurement', nodeId: String(block.nodeId), message: 'No measurement was supplied for this block.' })
      continue
    }
    const available = region ? region.height - region.headerHeight - region.footerHeight : 0
    if (!finitePositive(available)) {
      warnings.push({ code: 'invalid-region', pageIndex, message: 'Page region has no usable content height.' })
      break
    }
    const forcedBreak = block.explicitBreakBefore && fragments.length > 0
    if (forcedBreak) flush(index)
    const height = Math.max(0, measurement.height)
    if (used + height <= available || !fragments.length) {
      fragments.push({ nodeId: String(block.nodeId), pageIndex, height, derivationKey: `${block.nodeId}:${height}:${available}` })
      used += height
      if (used > available) warnings.push({ code: 'unbreakable-overflow', nodeId: String(block.nodeId), pageIndex, message: 'Block exceeds the available page region.' })
      continue
    }
    flush(index)
    index--
  }
  flush(input.blocks.length)
  return { pages, warnings, invalidation: { fromBlock: blockStart, throughBlock: input.blocks.length } }
}
