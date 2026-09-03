import type { DrawingStroke, ShapeRecord, Store, TextBlock } from '@incantly/canvas/headless'
import {
  canPutShape,
  createDrawShape,
  newId,
  simplifyPackedStrokePts,
} from '@incantly/canvas/headless'

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
