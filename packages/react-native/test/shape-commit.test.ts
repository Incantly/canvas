import { describe, expect, it } from 'vitest'
import {
  Store,
  createDrawShape,
  createGeoShape,
  createLineishShape,
  createTextShape,
  newId,
} from '@incantly/canvas/headless'
import {
  commitBoardInkStroke,
  commitShape,
  eraseShapeIds,
  moveShape,
  resizeShape,
  updateShapeFill,
  updateTextShapeBlocks,
} from '../src/shapes/commit.js'
import { eventToShapePoint } from '../src/shapes/coords.js'
import { textToBlocks } from '@incantly/canvas/headless'

function pageId(store: Store): string {
  store.normalizePages('remote')
  const id = store.pages()[0]?.id
  if (!id) throw new Error('expected page')
  return id
}

describe('commitShape', () => {
  it('puts a geo and undoes it', () => {
    const store = new Store()
    const pid = pageId(store)
    const shape = createGeoShape({
      id: newId(),
      parentId: pid,
      z: 1,
      x: 10,
      y: 12,
      w: 80,
      h: 40,
      geo: 'rectangle',
      color: 'blue',
      size: 'm',
    })
    expect(commitShape(store, shape)).toBe(true)
    expect(store.shapesOnPage(pid)).toHaveLength(1)
    store.undo()
    expect(store.shapesOnPage(pid)).toHaveLength(0)
  })

  it('rejects a shape with a missing parent page', () => {
    const store = new Store()
    pageId(store)
    const shape = createLineishShape({
      id: newId(),
      type: 'line',
      parentId: 'page:missing',
      z: 1,
      x: 0,
      y: 0,
      dx: 40,
      dy: 10,
      color: 'black',
      size: 'm',
    })
    expect(commitShape(store, shape)).toBe(false)
  })

  it('moves a shape and restores via undo', () => {
    const store = new Store()
    const pid = pageId(store)
    const shape = createGeoShape({
      id: 'g-move',
      parentId: pid,
      z: 1,
      x: 0,
      y: 0,
      w: 20,
      h: 20,
      geo: 'ellipse',
      color: 'black',
      size: 's',
    })
    commitShape(store, shape)
    expect(moveShape(store, 'g-move', 40, 50)).toBe(true)
    expect((store.get('g-move') as { x: number }).x).toBe(40)
    store.undo()
    expect((store.get('g-move') as { x: number }).x).toBe(0)
  })
})

describe('board ink + text', () => {
  it('commits a draw shape from packed pts', () => {
    const store = new Store()
    const pid = pageId(store)
    expect(
      commitBoardInkStroke(store, pid, {
        pts: [10, 10, 0.5, 30, 18, 0.5],
        color: 'black',
        size: 'm',
        kind: 'draw',
      }),
    ).toBe(true)
    const draw = store.shapesOnPage(pid).find((s) => s.type === 'draw')
    expect(draw).toBeTruthy()
    expect(draw?.x).toBe(10)
  })

  it('erases draw shapes by id', () => {
    const store = new Store()
    const pid = pageId(store)
    const s = createDrawShape({
      id: 'd1',
      parentId: pid,
      z: 1,
      kind: 'highlight',
      pts: [0, 0, 0.5, 8, 0, 0.5],
      color: 'yellow',
      size: 'l',
    })!
    commitShape(store, s)
    expect(eraseShapeIds(store, ['d1'])).toBe(true)
    expect(store.get('d1')).toBeUndefined()
  })

  it('updates text blocks', () => {
    const store = new Store()
    const pid = pageId(store)
    const t = createTextShape({
      id: 't1',
      parentId: pid,
      z: 1,
      x: 8,
      y: 8,
      color: 'black',
      size: 'm',
    })
    commitShape(store, t)
    expect(updateTextShapeBlocks(store, 't1', textToBlocks('hello'))).toBe(true)
    expect((store.get('t1') as { props: { blocks: { content: { text: string }[] }[] } }).props.blocks[0]?.content[0]?.text).toBe(
      'hello',
    )
  })

  it('resizes a text box and updates fill', () => {
    const store = new Store()
    const pid = pageId(store)
    const t = createTextShape({
      id: 't2',
      parentId: pid,
      z: 1,
      x: 8,
      y: 8,
      color: 'black',
      size: 'm',
    })
    commitShape(store, t)
    expect(resizeShape(store, 't2', { x: 12, y: 16, w: 220, h: 140 })).toBe(true)
    const rec = store.get('t2') as { x: number; y: number; props: { w: number; h: number; fill?: string } }
    expect(rec.x).toBe(12)
    expect(rec.props.w).toBe(220)
    expect(rec.props.h).toBe(140)
    expect(updateShapeFill(store, 't2', 'semi')).toBe(true)
    expect((store.get('t2') as { props: { fill?: string } }).props.fill).toBe('semi')
  })
})

describe('eventToShapePoint', () => {
  it('maps paper and world spaces', () => {
    const paper = eventToShapePoint(80, 40, 'paper', 0.5, 816, 1056, undefined, false)
    expect(paper).toEqual({ x: 160, y: 80 })
    const world = eventToShapePoint(40, 80, 'world', 1, 0, 0, { x: 10, y: 20, z: 2 }, false)
    expect(world?.x).toBeCloseTo(40 / 2 - 10)
    expect(world?.y).toBeCloseTo(80 / 2 - 20)
    expect(eventToShapePoint(Number.NaN, 0, 'paper', 1, 100, 100, undefined, false)).toBeNull()
  })
})
