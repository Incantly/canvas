import type { Snapshot } from '../types/operations.js'
import type { NotebookRecord, PageRecord, ShapeRecord } from '../types/models.js'
import { NOTEBOOK_ID } from '../pages.js'
import { newId } from '../utils/id.js'
import { emptyDocument } from '../rich-text/document.js'
import { registerMigration } from './sequences.js'

registerMigration({
  sequenceId: 'com.incantly.store',
  version: 1,
  up(snap: Snapshot): void {
    const store = snap.document.store

    if (!store[NOTEBOOK_ID]) {
      store[NOTEBOOK_ID] = {
        id: NOTEBOOK_ID,
        typeName: 'notebook',
        pageLayout: 'vertical',
      } as NotebookRecord
    }

    const pages = Object.values(store).filter(
      (r): r is PageRecord => !!r && (r as any).typeName === 'page',
    )

    if (!pages.length) {
      const pageId = newId('page')
      const page: PageRecord = {
        id: pageId,
        typeName: 'page',
        index: 0,
        x: 0,
        y: 0,
        width: 816,
        height: 1056,
        name: 'Page 1',
        document: { blocks: emptyDocument() },
      }
      store[pageId] = page
      pages.push(page)
    }

    const firstPageId = pages.sort(
      (a, b) => a.index - b.index || (a.id < b.id ? -1 : 1),
    )[0]!.id

    for (const rec of Object.values(store)) {
      if (!rec || (rec as any).typeName !== 'shape') continue
      const shape = rec as ShapeRecord
      if (!shape.parentId) {
        store[shape.id] = { ...shape, parentId: firstPageId }
      }
    }
  },
})
