import type { DrawingStroke, Store } from '@incantly/canvas/headless'
import { removeDocumentStroke, simplifyPackedStrokePts } from '@incantly/canvas/headless'
import type { InkHit } from './types.js'

export type { InkHit } from './types.js'

function packedPtsOk(pts: number[]): boolean {
  if (!Array.isArray(pts) || pts.length < 3) return false
  const n = Math.floor(pts.length / 3) * 3
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(pts[i])) return false
  }
  return n >= 3
}

export function sortEraseHitsDescending(hits: InkHit[]): InkHit[] {
  return hits.slice().sort((a, b) =>
    a.blockIndex !== b.blockIndex ? b.blockIndex - a.blockIndex : b.strokeIndex - a.strokeIndex,
  )
}

/** Append a completed stroke to the trailing drawing block. One undo step. */
export function commitDocumentInkStroke(store: Store, pageId: string, stroke: DrawingStroke): boolean {
  if (!store.page(pageId)) return false
  if (stroke.kind !== 'draw' && stroke.kind !== 'highlight') return false
  if (!packedPtsOk(stroke.pts)) return false
  const pts = simplifyPackedStrokePts(stroke.pts.slice(0, Math.floor(stroke.pts.length / 3) * 3))
  if (pts.length < 3) return false
  store.beginBatch()
  try {
    const blockIndex = store.ensureEndDrawingBlock(pageId)
    store.appendDocumentDrawingStroke(pageId, blockIndex, { ...stroke, pts })
  } finally {
    store.endBatch()
  }
  return true
}

/** Remove hit strokes (indices from the pre-erase snapshot). One undo step. */
export function eraseDocumentInkHits(store: Store, pageId: string, hits: InkHit[]): boolean {
  if (!store.page(pageId) || hits.length === 0) return false
  store.beginBatch()
  try {
    let blocks = store.pageDocumentBlocks(pageId)
    for (const hit of sortEraseHitsDescending(hits)) {
      if (hit.blockIndex < 0 || hit.strokeIndex < 0) continue
      blocks = removeDocumentStroke(blocks, hit.blockIndex, hit.strokeIndex)
    }
    store.setPageDocument(pageId, blocks)
  } finally {
    store.endBatch()
  }
  return true
}
