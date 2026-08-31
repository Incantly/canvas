import { describe, it, expect, vi } from 'vitest'
import { Store, newId, isDiffEmpty, invertDiff, composeDiff } from '../src/store.js'

const shape = (id: string, x = 0): any => ({
  id, typeName: 'shape', type: 'geo', x, y: 0, rot: 0, z: 1,
  props: { geo: 'rectangle', w: 10, h: 10, color: 'black', size: 'm', dash: 'draw', fill: 'none', font: 'draw' },
})

describe('newId', () => {
  it('produces unique prefixed ids', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId()))
    expect(ids.size).toBe(1000)
    for (const id of ids) expect(id.startsWith('shape:')).toBe(true)
    expect(newId('asset').startsWith('asset:')).toBe(true)
  })
})

describe('Store CRUD + diffs', () => {
  it('put emits an added diff', () => {
    const s = new Store()
    const fn = vi.fn()
    s.listen(fn)
    s.put(shape('a'))
    expect(fn).toHaveBeenCalledTimes(1)
    const [diff, source] = fn.mock.calls[0] as any
    expect(source).toBe('user')
    expect(Object.keys(diff.added)).toEqual(['a'])
    expect(isDiffEmpty(diff)).toBe(false)
  })

  it('update emits [from, to] pairs and merges props', () => {
    const s = new Store()
    s.put(shape('a'))
    const fn = vi.fn()
    s.listen(fn)
    s.update('a', { x: 5, props: { w: 20 } })
    const [diff] = fn.mock.calls[0] as any
    const [from, to] = diff.updated.a
    expect(from.x).toBe(0)
    expect(to.x).toBe(5)
    expect(to.props.w).toBe(20)
    expect(to.props.h).toBe(10)
  })

  it('remove emits removed with the prior record', () => {
    const s = new Store()
    s.put(shape('a'))
    const fn = vi.fn()
    s.listen(fn)
    s.remove(['a', 'missing'])
    const [diff] = fn.mock.calls[0] as any
    expect(diff.removed.a.id).toBe('a')
    expect(s.has('a')).toBe(false)
  })

  it('transact batches mutations into one diff; nested transacts share it', () => {
    const s = new Store()
    const fn = vi.fn()
    s.listen(fn)
    s.transact(() => {
      s.put(shape('a'))
      s.transact(() => s.put(shape('b')))
      s.update('a', { x: 3 })
    })
    expect(fn).toHaveBeenCalledTimes(1)
    const [diff] = fn.mock.calls[0] as any
    expect(diff.added.a.x).toBe(3)
    expect(diff.added.b).toBeTruthy()
    expect(diff.updated).toEqual({})
  })

  it('add + remove in one transaction nets to nothing', () => {
    const s = new Store()
    const fn = vi.fn()
    s.listen(fn)
    s.transact(() => {
      s.put(shape('a'))
      s.remove(['a'])
    })
    expect(fn).not.toHaveBeenCalled()
  })

  it('listener source filter separates user and remote', () => {
    const s = new Store()
    const user = vi.fn(), remote = vi.fn(), all = vi.fn()
    s.listen(user, { source: 'user' })
    s.listen(remote, { source: 'remote' })
    s.listen(all)
    s.put(shape('a'))
    s.put(shape('b'), 'remote')
    expect(user).toHaveBeenCalledTimes(1)
    expect(remote).toHaveBeenCalledTimes(1)
    expect(all).toHaveBeenCalledTimes(2)
  })

  it('shapes() excludes assets; asset() finds only assets', () => {
    const s = new Store()
    s.put(shape('a'))
    s.put({ id: 'as1', typeName: 'asset', src: 'data:x', w: 1, h: 1 })
    expect(s.shapes().map((r: any) => r.id)).toEqual(['a'])
    expect(s.asset('as1')!.id).toBe('as1')
    expect(s.asset('a')).toBeNull()
  })
})

describe('undo / redo', () => {
  it('undoes and redoes a put', () => {
    const s = new Store()
    s.put(shape('a'))
    expect(s.canUndo).toBe(true)
    s.undo()
    expect(s.has('a')).toBe(false)
    expect(s.canRedo).toBe(true)
    s.redo()
    expect(s.has('a')).toBe(true)
  })

  it('a batch (gesture) undoes as one step', () => {
    const s = new Store()
    s.beginBatch()
    s.put(shape('a'))
    s.update('a', { x: 1 })
    s.update('a', { x: 2 })
    s.endBatch()
    expect(s.undos.length).toBe(1)
    s.undo()
    expect(s.has('a')).toBe(false)
  })

  it('remote diffs never enter undo history', () => {
    const s = new Store()
    s.put(shape('a'), 'remote')
    expect(s.canUndo).toBe(false)
  })

  it('new edits clear the redo stack', () => {
    const s = new Store()
    s.put(shape('a'))
    s.undo()
    expect(s.canRedo).toBe(true)
    s.put(shape('b'))
    expect(s.canRedo).toBe(false)
  })

  it('undo of an update restores the exact prior record', () => {
    const s = new Store()
    s.put(shape('a'))
    s.update('a', { x: 42 })
    s.undo()
    expect(s.get('a')!.x).toBe(0)
    s.redo()
    expect(s.get('a')!.x).toBe(42)
  })

  it('listenHistory fires when a gesture batch closes', () => {
    const s = new Store()
    const history = vi.fn(() => ({ undo: s.canUndo, redo: s.canRedo }))
    s.listenHistory(history)
    s.beginBatch()
    s.put(shape('a'))
    s.update('a', { x: 1 })
    const nDuringGesture = history.mock.calls.length
    s.endBatch()
    expect(history.mock.calls.length).toBeGreaterThan(nDuringGesture)
    expect((history.mock.results.at(-1) as any).value).toEqual({ undo: true, redo: false })
    s.undo()
    expect((history.mock.results.at(-1) as any).value).toEqual({ undo: false, redo: true })
    s.redo()
    expect((history.mock.results.at(-1) as any).value).toEqual({ undo: true, redo: false })
  })

  it('canUndo/canRedo are already settled when the undo/redo diff emits', () => {
    const s = new Store()
    s.put(shape('a'))
    let redoSeen: any, undoSeen: any
    s.listen(() => { redoSeen = s.canRedo; undoSeen = s.canUndo })
    s.undo()
    expect(redoSeen).toBe(true)
    expect(undoSeen).toBe(false)
    s.redo()
    expect(undoSeen).toBe(true)
    expect(redoSeen).toBe(false)
  })

  it('undo emits as a user diff', () => {
    const s = new Store()
    s.put(shape('a'))
    const fn = vi.fn()
    s.listen(fn, { source: 'user' })
    s.undo()
    expect(fn).toHaveBeenCalledTimes(1)
    expect((fn.mock.calls[0][0] as any).removed.a).toBeTruthy()
  })
})

describe('diff algebra', () => {
  it('invertDiff swaps added/removed and flips update pairs', () => {
    const a = shape('a'), a2 = { ...a, x: 9 }
    const d = { added: { b: shape('b') }, removed: { c: shape('c') }, updated: { a: [a, a2] } } as any
    const inv = invertDiff(d)
    expect(inv.added.c).toBeTruthy()
    expect(inv.removed.b).toBeTruthy()
    expect(inv.updated.a).toEqual([a2, a])
  })

  it('composeDiff squashes sequential diffs', () => {
    const a1 = shape('a'), a2 = { ...a1, x: 1 }, a3 = { ...a1, x: 2 }
    const d1 = { added: {}, removed: {}, updated: { a: [a1, a2] } } as any
    const d2 = { added: {}, removed: {}, updated: { a: [a2, a3] } } as any
    const c = composeDiff(d1, d2)
    expect(c.updated.a).toEqual([a1, a3])
  })

  it('composeDiff: add then remove cancels; remove then re-add becomes update', () => {
    const a = shape('a')
    const add = { added: { a }, removed: {}, updated: {} } as any
    const rem = { added: {}, removed: { a }, updated: {} } as any
    expect(isDiffEmpty(composeDiff(add, rem))).toBe(true)
    const a2 = { ...a, x: 7 }
    const readd = { added: { a: a2 }, removed: {}, updated: {} } as any
    const c = composeDiff(rem, readd)
    expect(c.updated.a).toEqual([a, a2])
    expect(c.removed.a).toBeUndefined()
  })

  it('applying diff then its inverse is a no-op on the document', () => {
    const s = new Store()
    s.put(shape('a'))
    let captured: any
    const unsub = s.listen((d: any) => { captured = d })
    s.transact(() => {
      s.update('a', { x: 100 })
      s.put(shape('b'))
    })
    unsub()
    const before = JSON.stringify(s.getSnapshot())
    s.applyDiff(invertDiff(captured), 'remote')
    s.applyDiff(captured, 'remote')
    expect(JSON.stringify(s.getSnapshot())).toBe(before)
  })
})

describe('snapshots', () => {
  it('round-trips the document', () => {
    const s = new Store()
    s.put(shape('a'))
    s.put(shape('b', 5))
    const snap = s.getSnapshot()
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap)

    const s2 = new Store()
    s2.loadSnapshot(snap)
    expect(s2.shapes().length).toBe(2)
    expect(s2.pages().length).toBe(1)
    expect(s2.get('b')!.x).toBe(5)
    expect(s2.canUndo).toBe(false)
  })

  it('loadSnapshot replaces existing content', () => {
    const s = new Store()
    s.put(shape('old'))
    s.loadSnapshot({ document: { store: { a: shape('a') } } } as any)
    expect(s.shapes().map((r) => r.id)).toEqual(['a'])
    expect(s.pages().length).toBe(1)
    expect(s.get('a')!.parentId).toBe(s.pages()[0].id)
  })

  it('loadSnapshot resets history', () => {
    const s = new Store()
    s.put(shape('old'))
    s.undo()
    expect(s.canRedo).toBe(true)
    s.put(shape('other'))
    expect(s.canUndo).toBe(true)
    let notified = 0
    s.listenHistory(() => notified++)
    s.loadSnapshot({ document: { store: { a: shape('a') } } } as any)
    expect(s.canUndo).toBe(false)
    expect(s.canRedo).toBe(false)
    expect(notified).toBeGreaterThan(0)
  })

  it('clear empties the store (undoably for users)', () => {
    const s = new Store()
    s.put(shape('a'))
    s.clear()
    expect(s.size).toBe(0)
    s.undo()
    expect(s.size).toBe(1)
  })
})

describe('z order helpers', () => {
  it('maxZ / minZ scan records', () => {
    const s = new Store()
    s.put({ ...shape('a'), z: 4 })
    s.put({ ...shape('b'), z: -2 })
    expect(s.maxZ()).toBe(4)
    expect(s.minZ()).toBe(-2)
  })
})

describe('pages', () => {
  it('normalizePages creates a default page for orphan shapes', () => {
    const s = new Store()
    s.put(shape('a'))
    const pageId = s.normalizePages('remote')
    expect(s.pages().length).toBe(1)
    expect(s.get('a')!.parentId).toBe(pageId)
  })

  it('addPage and removePage manage page records', () => {
    const s = new Store()
    s.normalizePages('remote')
    const p2 = s.addPage({ name: 'Page 2' })
    expect(s.pages().length).toBe(2)
    expect(s.removePage(p2.id)).toBe(true)
    expect(s.pages().length).toBe(1)
    expect(s.removePage(s.pages()[0].id)).toBe(false)
  })

  it('clearPage removes shapes but keeps the page', () => {
    const s = new Store()
    const pageId = s.normalizePages('remote')
    s.put({ ...shape('a'), parentId: pageId })
    s.clearPage(pageId)
    expect(s.shapes().length).toBe(0)
    expect(s.pages().length).toBe(1)
  })
})

describe('page document drawing blocks', () => {
  const pageRecord = () => ({
    id: 'p1',
    typeName: 'page' as const,
    index: 0,
    x: 0,
    y: 0,
    width: 816,
    height: 1056,
    name: 'Page 1',
    document: { blocks: [{ type: 'paragraph' as const, content: [{ text: 'Body' }] }] },
  })

  it('appendDocumentDrawingStroke throws on invalid block index', () => {
    const s = new Store()
    s.loadSnapshot({ document: { store: { p1: pageRecord() } } } as any)
    const stroke = { pts: [1, 2, 0.5], color: 'black' as const, size: 'm' as const, kind: 'draw' as const }
    expect(() => s.appendDocumentDrawingStroke('p1', 0, stroke)).toThrow(/Invalid drawing block index/)
    expect(() => s.appendDocumentDrawingStroke('p1', 99, stroke)).toThrow(/Invalid drawing block index/)
    expect(() => s.appendDocumentDrawingStroke('missing', 0, stroke)).toThrow(/Unknown page/)
  })

  it('appendDocumentDrawingStroke appends to a drawing block', () => {
    const s = new Store()
    const page = pageRecord()
    page.document = {
      blocks: [
        { type: 'paragraph', content: [{ text: 'Note' }] },
        { type: 'drawing', height: 120, strokes: [] },
      ],
    }
    s.loadSnapshot({ document: { store: { p1: page } } } as any)
    const stroke = { pts: [5, 5, 0.5, 20, 30, 0.5], color: 'black' as const, size: 'm' as const, kind: 'draw' as const }
    s.appendDocumentDrawingStroke('p1', 1, stroke)
    const blocks = s.pageDocumentBlocks('p1')
    expect(blocks[1]?.type).toBe('drawing')
    if (blocks[1]?.type === 'drawing') expect(blocks[1].strokes).toHaveLength(1)
  })

  it('loadSnapshot normalizes empty page document blocks', () => {
    const s = new Store()
    s.loadSnapshot({
      document: {
        store: {
          p1: { ...pageRecord(), document: { blocks: [] } },
        },
      },
    } as any)
    const blocks = s.pageDocumentBlocks('p1')
    expect(blocks.length).toBeGreaterThanOrEqual(1)
    expect(blocks[0]?.type).toBe('paragraph')
  })

  it('loadSnapshot sanitizes corrupt drawing blocks in snapshot', () => {
    const s = new Store()
    s.loadSnapshot({
      document: {
        store: {
          p1: {
            ...pageRecord(),
            document: {
              blocks: [
                { type: 'paragraph', content: [{ text: 'Keep me' }] },
                { type: 'drawing', height: -1, strokes: [{ pts: [1], color: 'black', size: 'm', kind: 'draw' }] },
                { type: 'drawing', strokes: [{ pts: [0, 0, 0.5, 10, 20, 0.5], color: 'black', size: 'm', kind: 'draw' }] },
              ],
            },
          },
        },
      },
    } as any)
    const blocks = s.pageDocumentBlocks('p1')
    expect(blocks.some((b) => b.type === 'paragraph' && b.content[0]?.text === 'Keep me')).toBe(true)
    const drawings = blocks.filter((b) => b.type === 'drawing')
    expect(drawings.length).toBe(1)
    expect(drawings[0]!.strokes.length).toBe(1)
    expect(drawings[0]!.strokes[0]!.pts.length).toBeGreaterThanOrEqual(3)
    expect(drawings[0]!.height).toBeGreaterThan(0)
  })

  it('migratePageDocuments assigns default document when page has no document', () => {
    const s = new Store()
    s.put({
      id: 'p1',
      typeName: 'page',
      index: 0,
      x: 0,
      y: 0,
      width: 816,
      height: 1056,
      name: 'Bare page',
    } as any)
    s.migratePageDocuments('remote')
    const page = s.page('p1')!
    expect(page.document?.blocks?.length).toBeGreaterThanOrEqual(1)
    expect(page.document!.blocks[0]?.type).toBe('paragraph')
  })
})

describe('rich text migration', () => {
  it('loadSnapshot migrates legacy text props to page document', () => {
    const s = new Store()
    s.loadSnapshot({
      document: {
        store: {
          p1: {
            id: 'p1',
            typeName: 'page',
            index: 0,
            x: 0,
            y: 0,
            width: 816,
            height: 1056,
            name: 'Page 1',
          },
          t1: {
            id: 't1',
            typeName: 'shape',
            type: 'text',
            parentId: 'p1',
            x: 0,
            y: 0,
            rot: 0,
            z: 1,
            props: { text: 'Legacy line', color: 'black', size: 'm', font: 'sans' },
          },
        },
      },
    })
    expect(s.get('t1')).toBeUndefined()
    const blocks = s.notebookDocumentBlocks()
    expect(blocks.some((b: any) => b.content?.[0]?.text === 'Legacy line')).toBe(true)
  })
})
