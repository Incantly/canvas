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
    const pieces = measurement.breakable === false || block.keepTogether
      ? [{ height }]
      : measurement.fragments?.length ? measurement.fragments : [{ height }]
    if (block.keepWithNext && index + 1 < input.blocks.length) {
      const next = measurements.get(String(input.blocks[index + 1].nodeId))
      if (next && used > 0 && used + height + next.height > available) flush(index)
    }
    if (pieces.length > 1) {
      const minimumStart = Math.max(1, block.orphans ?? 1)
      const minimumEnd = Math.max(1, block.widows ?? 1)
      let pieceIndex = 0
      while (pieceIndex < pieces.length) {
        const piece = pieces[pieceIndex]
        const remainingPieces = pieces.length - pieceIndex
        if (used + piece.height > available && fragments.length) { flush(index); continue }
        if (pieceIndex < minimumStart && used > 0 && pieces.slice(0, minimumStart).reduce((sum, item) => sum + item.height, 0) > available - used) { flush(index); continue }
        if (remainingPieces <= minimumEnd && used > 0 && pieces.slice(pieceIndex).reduce((sum, item) => sum + item.height, 0) > available - used) { flush(index); continue }
        fragments.push({ nodeId: String(block.nodeId), pageIndex, height: piece.height, from: piece.from, to: piece.to, derivationKey: `${block.nodeId}:${pieceIndex}:${piece.height}:${available}` })
        used += piece.height
        pieceIndex++
      }
      continue
    }
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
