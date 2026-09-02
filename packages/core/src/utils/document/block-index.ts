import type { DocumentBlock } from '../../rich-text/types.js'
import { isDrawingBlock } from '../../rich-text/types.js'

export function findLastDrawingBlockIndex(blocks: DocumentBlock[]): number {
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (isDrawingBlock(blocks[i]!)) return i
  }
  return -1
}

export function replaceBlockAt<T extends DocumentBlock>(
  blocks: DocumentBlock[],
  index: number,
  block: T,
): DocumentBlock[] {
  const next = blocks.slice()
  next[index] = block
  return next
}

export function insertBlockAfter(
  blocks: DocumentBlock[],
  afterIndex: number,
  block: DocumentBlock,
): DocumentBlock[] {
  const next = blocks.slice()
  const insertAt = afterIndex < 0 ? 0 : afterIndex + 1
  next.splice(insertAt, 0, block)
  return next
}
