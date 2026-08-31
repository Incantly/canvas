import type { Snapshot } from '../types/operations.js'
import type { PageRecord, ShapeRecord, NotebookRecord } from '../types/models.js'
import { NOTEBOOK_ID } from '../pages.js'
import { getPageDocument, mergeTextShapesIntoPage, normalizePageRecord } from '../page-document.js'
import { registerMigration } from './sequences.js'

function getPages(store: Record<string, any>): PageRecord[] {
  return Object.values(store)
    .filter((r): r is PageRecord => !!r && r.typeName === 'page')
    .sort((a, b) => a.index - b.index || (a.id < b.id ? -1 : 1))
}

function getShapesOnPage(store: Record<string, any>, pageId: string): ShapeRecord[] {
  return Object.values(store).filter(
    (r): r is ShapeRecord =>
      !!r && r.typeName === 'shape' && r.type === 'text' && (r as any).parentId === pageId,
  )
}

registerMigration({
  sequenceId: 'com.incantly.page.document',
  version: 1,
  up(snap: Snapshot): void {
    const store = snap.document.store
    const pages = getPages(store)

    for (const page of pages) {
      if (page.document?.blocks?.length) continue

      const textShapes = getShapesOnPage(store, page.id)
      if (textShapes.length) {
        const blocks = mergeTextShapesIntoPage(page, textShapes)
        store[page.id] = { ...page, document: { blocks } }
        for (const s of textShapes) delete store[s.id]
      } else {
        store[page.id] = normalizePageRecord(page)
      }
    }
  },
})

registerMigration({
  sequenceId: 'com.incantly.page.document',
  version: 2,
  up(snap: Snapshot): void {
    const store = snap.document.store
    const nb = store[NOTEBOOK_ID] as NotebookRecord | undefined
    if (!nb?.document?.blocks?.length) return

    const pages = getPages(store)
    for (const page of pages) {
      const textShapes = getShapesOnPage(store, page.id)
      if (textShapes.length) {
        const merged = mergeTextShapesIntoPage(page, textShapes)
        const existingBlocks = nb.document?.blocks ?? []
        store[NOTEBOOK_ID] = {
          ...nb,
          document: { blocks: [...existingBlocks, ...merged] },
        }
        for (const s of textShapes) delete store[s.id]
      }
      if (page.document) {
        const { document: _doc, ...rest } = page
        store[page.id] = rest as PageRecord
      }
    }
  },
})
