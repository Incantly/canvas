import type { Snapshot } from '../types/operations.js'
import type { NotebookRecord, PageRecord } from '../types/models.js'
import type { DocumentBlock, ImageBlock } from '../rich-text/types.js'
import { NOTEBOOK_ID } from '../pages.js'
import { mergePageDocumentsIntoNotebook } from '../notebook-document.js'
import { getPageDocument, normalizePageRecord } from '../page-document.js'
import {
  validateDocumentBlocks,
  consolidateDocumentBlocks,
} from '../page-document-blocks.js'

function pageBlocks(page: PageRecord, override?: unknown) {
  const raw = override ?? page.document?.blocks
  return consolidateDocumentBlocks(
    getPageDocument({ ...page, document: { blocks: raw as never } }),
  )
}
import { registerMigration } from './sequences.js'

function getNotebook(store: Record<string, any>): NotebookRecord | undefined {
  return store[NOTEBOOK_ID] as NotebookRecord | undefined
}

function getPages(store: Record<string, any>): PageRecord[] {
  return Object.values(store)
    .filter((r): r is PageRecord => !!r && r.typeName === 'page')
    .sort((a, b) => a.index - b.index || (a.id < b.id ? -1 : 1))
}

registerMigration({
  sequenceId: 'com.incantly.notebook.document',
  version: 1,
  up(snap: Snapshot): void {
    const store = snap.document.store
    const nb = getNotebook(store)
    if (!nb) return
    if (nb.document?.blocks?.length) return

    const pages = getPages(store)
    const blocks = mergePageDocumentsIntoNotebook(pages)
    store[NOTEBOOK_ID] = { ...nb, document: { blocks } }

    for (const page of pages) {
      if (page.document) {
        const { document: _doc, ...rest } = page
        store[page.id] = rest as PageRecord
      }
    }
  },
})

registerMigration({
  sequenceId: 'com.incantly.notebook.document',
  version: 2,
  up(snap: Snapshot): void {
    const store = snap.document.store
    const nb = getNotebook(store)
    if (!nb?.document?.blocks?.length) return

    const validated = validateDocumentBlocks(nb.document.blocks)
    const consolidated = consolidateDocumentBlocks(validated)
    store[NOTEBOOK_ID] = { ...nb, document: { blocks: consolidated } }
  },
})

registerMigration({
  sequenceId: 'com.incantly.notebook.document',
  version: 3,
  up(snap: Snapshot): void {
    const store = snap.document.store
    const nb = getNotebook(store)
    if (!nb?.document?.blocks?.length) return

    const blocks: DocumentBlock[] = []
    for (const block of nb.document.blocks) {
      if (block.type === 'image') {
        const img = block as ImageBlock
        const src = typeof img.src === 'string' ? img.src.trim() : ''
        if (!src) continue
        const normalized: ImageBlock = { type: 'image', src }
        if (typeof img.alt === 'string') normalized.alt = img.alt
        if (typeof img.width === 'number' && img.width > 0) normalized.width = img.width
        if (typeof img.height === 'number' && img.height > 0) normalized.height = img.height
        blocks.push(normalized)
      } else {
        blocks.push(block)
      }
    }

    store[NOTEBOOK_ID] = {
      ...nb,
      document: { blocks: validateDocumentBlocks(blocks) },
    }
  },
})

/**
 * Discrete pages: after notebook v1–v3 (continuous stream), move content onto
 * page 0 and keep per-page documents. Complements page.document v3 when that
 * step is undone by notebook v1 on a full-from-zero migrate.
 */
registerMigration({
  sequenceId: 'com.incantly.notebook.document',
  version: 4,
  up(snap: Snapshot): void {
    const store = snap.document.store
    const nb = getNotebook(store)
    const pages = getPages(store)
    if (!pages.length) return

    const nbBlocks = nb?.document?.blocks
    if (nbBlocks && nbBlocks.length) {
      const first = pages[0]!
      store[first.id] = {
        ...first,
        document: { blocks: pageBlocks(first, nbBlocks) },
      }
      if (nb) {
        const { document: _doc, ...rest } = nb
        store[NOTEBOOK_ID] = rest as NotebookRecord
      }
    }

    for (const page of getPages(store)) {
      if (!page.document?.blocks) {
        store[page.id] = normalizePageRecord(page)
      } else {
        store[page.id] = {
          ...page,
          document: { blocks: pageBlocks(page) },
        }
      }
    }
  },
})
