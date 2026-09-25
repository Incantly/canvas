import type { ColorId, DashId, DrawingStroke, ShapeRecord, SizeId, Store, TextBlock } from '@incantly/canvas/headless'
import {
  canPutShape,
  createDrawShape,
  newId,
  simplifyPackedStrokePts,
} from '@incantly/canvas/headless'
import type { PixelShapeEraseEdit } from '../ink/types.js'

function pageIds(store: Store): Set<string> {
  return new Set(store.pages().map((p) => p.id))
}

export function commitShape(store: Store, shape: ShapeRecord): boolean {
  const pages = pageIds(store)
  if (!canPutShape(shape, pages)) return false
  store.beginBatch()
  try {
    store.put(shape, 'user')
  } finally {
    store.endBatch()
  }
  return true
}

export function moveShape(store: Store, id: string, x: number, y: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false
  const rec = store.get(id)
  if (!rec || rec.typeName !== 'shape') return false
  store.beginBatch()
  try {
    store.update(id, { x, y }, 'user')
  } finally {
    store.endBatch()
  }
  return true
}

export function eraseShapeIds(store: Store, ids: string[]): boolean {
  const valid = ids.filter((id) => {
    const rec = store.get(id)
    return rec?.typeName === 'shape'
  })
  if (!valid.length) return false
  store.beginBatch()
  try {
    store.remove(valid, 'user')
  } finally {
    store.endBatch()
  }
  return true
}

/**
 * Pixel-erase commit for board draw/highlight shapes. The first surviving
 * piece keeps the original id (selection + z-order preserved); extras become
 * new shapes slotted just above. Fully erased shapes are removed. One batch
 * = one undo step. Returns whether anything changed + removed ids (so the
 * host can drop selection).
 */
export function applyPixelEraseShapes(
  store: Store,
  edits: PixelShapeEraseEdit[],
): { changed: boolean; removedIds: string[] } {
  const removedIds: string[] = []
  if (!edits.length) return { changed: false, removedIds }
  let changed = false
  store.beginBatch()
  try {
    for (const edit of edits) {
      const rec = store.get(edit.id)
      if (!rec || rec.typeName !== 'shape') continue
      if (rec.type !== 'draw' && rec.type !== 'highlight') continue
      if (!rec.parentId) continue
      const props = rec.props as {
        pts?: number[]
        color: ColorId
        size: SizeId
        width?: number
        dash?: DashId
      }
      const valid = edit.pieces.filter((p) => Array.isArray(p) && p.length >= 6)
      if (!valid.length) {
        store.remove([edit.id], 'user')
        removedIds.push(edit.id)
        changed = true
        continue
      }
      store.update(edit.id, { props: { ...props, pts: valid[0] } }, 'user')
      changed = true
      valid.slice(1).forEach((pts, k) => {
        const shape = createDrawShape({
          id: newId(),
          parentId: rec.parentId as string,
          z: rec.z + (k + 1) * 0.001,
          kind: rec.type as 'draw' | 'highlight',
          pts,
          color: props.color ?? 'black',
          size: props.size ?? 'm',
          ...(props.width != null ? { width: props.width } : {}),
          ...(props.dash ? { dash: props.dash } : {}),
        })
        if (shape && canPutShape(shape, pageIds(store))) {
          store.put(shape, 'user')
        }
      })
    }
  } finally {
    store.endBatch()
  }
  return { changed, removedIds }
}

export function commitBoardInkStroke(
  store: Store,
  pageId: string,
  stroke: DrawingStroke,
): boolean {
  if (!store.page(pageId)) return false
  if (stroke.kind !== 'draw' && stroke.kind !== 'highlight') return false
  const pts = simplifyPackedStrokePts(stroke.pts ?? [])
  const shape = createDrawShape({
    id: newId(),
    parentId: pageId,
    z: store.maxZ() + 1,
    kind: stroke.kind,
    pts,
    color: stroke.color,
    size: stroke.size,
    ...(stroke.width != null ? { width: stroke.width } : {}),
  })
  if (!shape) return false
  return commitShape(store, shape)
}

export function updateTextShapeBlocks(store: Store, id: string, blocks: TextBlock[]): boolean {
  const rec = store.get(id)
  if (!rec || rec.typeName !== 'shape' || rec.type !== 'text') return false
  store.update(id, { props: { blocks } }, 'user')
  return true
}

export function updateShapeFill(
  store: Store,
  id: string,
  fill: 'none' | 'semi' | 'solid' | 'pattern',
): boolean {
  const rec = store.get(id)
  if (!rec || rec.typeName !== 'shape') return false
  if (rec.type !== 'text' && rec.type !== 'geo') return false
  store.update(id, { props: { fill } }, 'user')
  return true
}

export function resizeShape(
  store: Store,
  id: string,
  box: { x: number; y: number; w: number; h: number },
): boolean {
  const rec = store.get(id)
  if (!rec || rec.typeName !== 'shape') return false
  if (!Number.isFinite(box.x) || !Number.isFinite(box.y) || !Number.isFinite(box.w) || !Number.isFinite(box.h)) {
    return false
  }
  if (box.w < 1 || box.h < 1) return false
  if (rec.type === 'geo') {
    store.update(id, { x: box.x, y: box.y, props: { w: box.w, h: box.h } }, 'user')
    return true
  }
  if (rec.type === 'text') {
    store.update(id, { x: box.x, y: box.y, props: { w: box.w, h: box.h, autosize: false } }, 'user')
    return true
  }
  return false
}
