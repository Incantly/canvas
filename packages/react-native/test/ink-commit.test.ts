import { describe, expect, it } from 'vitest'
import { Store, isDrawingBlock } from '@incantly/canvas/headless'
import {
  commitDocumentInkStroke,
  eraseDocumentInkHits,
  sortEraseHitsDescending,
} from '../src/ink/commit.js'

function pageId(store: Store): string {
  store.normalizePages('remote')
  const id = store.pages()[0]?.id
  if (!id) throw new Error('expected page')
  return id
}

describe('commitDocumentInkStroke', () => {
  it('appends a packed stroke to a trailing drawing block', () => {
    const store = new Store()
    const id = pageId(store)
    const ok = commitDocumentInkStroke(store, id, {
      pts: [10, 12, 0.5, 24, 18, 0.5],
      color: 'blue',
      size: 'm',
      kind: 'highlight',
    })
    expect(ok).toBe(true)
    const blocks = store.pageDocumentBlocks(id)
    const drawing = blocks.filter(isDrawingBlock)
    expect(drawing).toHaveLength(1)
    expect(drawing[0]!.strokes).toHaveLength(1)
    expect(drawing[0]!.strokes[0]!.kind).toBe('highlight')
    expect(drawing[0]!.strokes[0]!.pts).toEqual([10, 12, 0.5, 24, 18, 0.5])
    store.undo()
    expect(store.pageDocumentBlocks(id).filter(isDrawingBlock)).toHaveLength(0)
  })

  it('preserves a host pen id on commit', () => {
    const store = new Store()
    const id = pageId(store)
    expect(
      commitDocumentInkStroke(store, id, {
        pts: [0, 0, 0.5, 8, 2, 0.8],
        color: 'black',
        size: 's',
        kind: 'draw',
        pen: 'pencil',
      }),
    ).toBe(true)
    const drawing = store.pageDocumentBlocks(id).filter(isDrawingBlock)
    expect(drawing[0]!.strokes[0]!.pen).toBe('pencil')
  })

  it('rejects empty or non-finite points', () => {
    const store = new Store()
    const id = pageId(store)
    expect(commitDocumentInkStroke(store, id, { pts: [], color: 'black', size: 'm', kind: 'draw' })).toBe(
      false,
    )
    expect(
      commitDocumentInkStroke(store, id, {
        pts: [1, Number.NaN, 0.5],
        color: 'black',
        size: 'm',
        kind: 'draw',
      }),
    ).toBe(false)
    expect(store.pageDocumentBlocks(id).some(isDrawingBlock)).toBe(false)
  })

  it('is a no-op for an unknown page', () => {
    const store = new Store()
    expect(
      commitDocumentInkStroke(store, 'missing', {
        pts: [0, 0, 0.5],
        color: 'black',
        size: 'm',
        kind: 'draw',
      }),
    ).toBe(false)
  })
})

describe('eraseDocumentInkHits', () => {
  it('removes strokes from highest index first', () => {
    const store = new Store()
    const id = pageId(store)
    commitDocumentInkStroke(store, id, {
      pts: [0, 0, 0.5, 8, 0, 0.5],
      color: 'black',
      size: 'm',
      kind: 'draw',
    })
    commitDocumentInkStroke(store, id, {
      pts: [20, 20, 0.5, 30, 20, 0.5],
      color: 'red',
      size: 's',
      kind: 'draw',
    })
    const drawing = store.pageDocumentBlocks(id).find(isDrawingBlock)!
    expect(drawing.strokes).toHaveLength(2)
    const bi = store.pageDocumentBlocks(id).findIndex(isDrawingBlock)
    eraseDocumentInkHits(store, id, [
      { blockIndex: bi, strokeIndex: 0 },
      { blockIndex: bi, strokeIndex: 1 },
    ])
    const after = store.pageDocumentBlocks(id).find(isDrawingBlock)
    expect(after?.strokes ?? []).toHaveLength(0)
  })

  it('sorts hits descending so later indices are removed first', () => {
    expect(
      sortEraseHitsDescending([
        { blockIndex: 0, strokeIndex: 1 },
        { blockIndex: 1, strokeIndex: 0 },
        { blockIndex: 0, strokeIndex: 3 },
      ]),
    ).toEqual([
      { blockIndex: 1, strokeIndex: 0 },
      { blockIndex: 0, strokeIndex: 3 },
      { blockIndex: 0, strokeIndex: 1 },
    ])
  })
})
