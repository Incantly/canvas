// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import {
  validateDocumentBlocks,
  layoutPageDocument,
  findDrawingTarget,
  insertDrawingBlockAfter,
  appendStrokeToDrawingBlock,
  strokeBoundsHeight,
  consolidateDocumentBlocks,
  documentBlocksToDomHtml,
  DRAWING_BLOCK_MIN_HEIGHT,
} from '../src/page-document-blocks.js'
import { PAGE_DOC_MARGIN_X, PAGE_DOC_MARGIN_Y } from '../src/page-document.js'
import { themeOf } from '../src/palette.js'

describe('page document drawing blocks', () => {
  it('validateDocumentBlocks accepts image blocks', () => {
    const blocks = validateDocumentBlocks([
      { type: 'paragraph', content: [{ text: 'Hello' }] },
      { type: 'image', src: 'data:image/png;base64,abc', width: 400, height: 200 },
    ])
    expect(blocks).toHaveLength(2)
    expect(blocks[1]?.type).toBe('image')
  })

  it('validateDocumentBlocks rejects image blocks with empty src', () => {
    const blocks = validateDocumentBlocks([
      { type: 'paragraph', content: [{ text: 'Before' }] },
      { type: 'image', src: '' },
      { type: 'image', src: '   ' },
      { type: 'image' },
      { type: 'paragraph', content: [{ text: 'After' }] },
    ])
    expect(blocks).toHaveLength(2)
    expect(blocks.every((b) => b.type !== 'image')).toBe(true)
    expect(blocks[0]?.type).toBe('paragraph')
    expect(blocks[1]?.type).toBe('paragraph')
  })

  it('layout includes image block height', () => {
    const theme = themeOf('light')
    const layout = layoutPageDocument(
      validateDocumentBlocks([
        { type: 'paragraph', content: [{ text: 'Caption' }] },
        { type: 'image', src: 'data:image/png;base64,abc', width: 400, height: 200 },
      ]),
      400,
      theme,
    )
    expect(layout.entries).toHaveLength(2)
    expect(layout.entries[1]!.h).toBeGreaterThan(0)
  })

  it('validateDocumentBlocks accepts drawing blocks', () => {
    const blocks = validateDocumentBlocks([
      { type: 'paragraph', content: [{ text: 'Hello' }] },
      {
        type: 'drawing',
        height: 140,
        strokes: [{ pts: [10, 10, 0.5, 20, 30, 0.5], color: 'black', size: 'm', kind: 'draw' }],
      },
    ])
    expect(blocks).toHaveLength(2)
    expect(blocks[1]?.type).toBe('drawing')
  })

  it('validateDocumentBlocks keeps a safe host pen id on strokes', () => {
    const blocks = validateDocumentBlocks([
      {
        type: 'drawing',
        height: 140,
        strokes: [
          { pts: [10, 10, 0.5, 20, 30, 0.5], color: 'black', size: 'm', kind: 'draw', pen: 'pencil' },
          { pts: [1, 1, 0.5, 2, 2, 0.5], color: 'black', size: 'm', kind: 'draw', pen: '../x' },
        ],
      },
    ])
    const drawing = blocks.find((b) => b.type === 'drawing')
    expect(drawing && drawing.type === 'drawing' ? drawing.strokes[0]?.pen : undefined).toBe('pencil')
    expect(drawing && drawing.type === 'drawing' ? drawing.strokes[1]?.pen : undefined).toBeUndefined()
  })

  it('validateDocumentBlocks rejects corrupt drawing strokes', () => {
    const blocks = validateDocumentBlocks([
      { type: 'drawing', height: 100, strokes: [{ pts: [1], color: 'black', size: 'm', kind: 'draw' }] },
    ])
    expect(blocks.every((b) => b.type !== 'drawing' || b.strokes.length === 0)).toBe(true)
  })

  it('layout keeps drawing blocks out of document flow', () => {
    const theme = themeOf('light')
    const layout = layoutPageDocument(
      validateDocumentBlocks([
        { type: 'paragraph', content: [{ text: 'Line one' }] },
        { type: 'drawing', height: DRAWING_BLOCK_MIN_HEIGHT, strokes: [] },
      ]),
      400,
      theme,
    )
    expect(layout.entries).toHaveLength(2)
    expect(layout.entries[1]!.h).toBe(0)
    expect(layout.totalHeight).toBe(layout.entries[0]!.h + 4)
  })

  it('findDrawingTarget allows drawing on text', () => {
    const theme = themeOf('light')
    const blocks = validateDocumentBlocks([
      { type: 'paragraph', content: [{ text: 'Typed line' }] },
    ])
    const layout = layoutPageDocument(blocks, 400, theme)
    const text = layout.entries[0]!
    const px = PAGE_DOC_MARGIN_X + 20
    const py = PAGE_DOC_MARGIN_Y + text.y + text.h / 2
    const target = findDrawingTarget(blocks, px, py, 816, 1200)
    expect(target.action).toBe('ensure-end')
    if (target.action === 'ensure-end') {
      expect(target.localX).toBe(px)
      expect(target.localY).toBeCloseTo(py)
    }
  })

  it('findDrawingTarget allows drawing in side margins', () => {
    const blocks = validateDocumentBlocks([
      { type: 'paragraph', content: [{ text: 'Body' }] },
    ])
    const target = findDrawingTarget(blocks, 24, 120, 816, 1200)
    expect(target.action).toBe('ensure-end')
    if (target.action === 'ensure-end') {
      expect(target.localX).toBe(24)
      expect(target.localX).toBeLessThan(PAGE_DOC_MARGIN_X)
    }
  })

  it('findDrawingTarget rejects outside paper bounds', () => {
    const blocks = validateDocumentBlocks([
      { type: 'paragraph', content: [{ text: 'Body' }] },
    ])
    expect(findDrawingTarget(blocks, -1, 50, 816, 1200).action).toBe('reject')
    expect(findDrawingTarget(blocks, 900, 50, 816, 1200).action).toBe('reject')
    expect(findDrawingTarget(blocks, 50, -1, 816, 1200).action).toBe('reject')
    expect(findDrawingTarget(blocks, 50, 2000, 816, 1200).action).toBe('reject')
  })

  it('findDrawingTarget allows drawing between paragraphs', () => {
    const theme = themeOf('light')
    const blocks = validateDocumentBlocks([
      { type: 'paragraph', content: [{ text: 'First' }] },
      { type: 'paragraph', content: [{ text: 'Second' }] },
    ])
    const layout = layoutPageDocument(blocks, 400, theme)
    const a = layout.entries[0]!
    const b = layout.entries[1]!
    const gapY = PAGE_DOC_MARGIN_Y + a.y + a.h + (b.y - a.y - a.h) / 2
    const target = findDrawingTarget(blocks, PAGE_DOC_MARGIN_X + 20, gapY, 816, 1200)
    expect(target.action).toBe('ensure-end')
    expect(b.y).toBeGreaterThan(a.y + a.h)
  })

  it('findDrawingTarget reuses trailing drawing block', () => {
    const theme = themeOf('light')
    const blocks = validateDocumentBlocks([
      { type: 'paragraph', content: [{ text: 'Note' }] },
      { type: 'drawing', height: DRAWING_BLOCK_MIN_HEIGHT, strokes: [] },
    ])
    const layout = layoutPageDocument(blocks, 400, theme)
    const text = layout.entries[0]!
    const target = findDrawingTarget(
      blocks,
      PAGE_DOC_MARGIN_X + 20,
      PAGE_DOC_MARGIN_Y + text.y + 10,
      816,
      1200,
    )
    expect(target.action).toBe('draw')
    if (target.action === 'draw') {
      expect(target.blockIndex).toBe(1)
      expect(target.localY).toBeCloseTo(PAGE_DOC_MARGIN_Y + text.y + 10)
    }
  })

  it('consolidateDocumentBlocks merges ink to document end', () => {
    const merged = consolidateDocumentBlocks(
      validateDocumentBlocks([
        { type: 'paragraph', content: [{ text: 'A' }] },
        { type: 'drawing', height: 100, strokes: [{ pts: [0, 0, 0.5], color: 'black', size: 'm', kind: 'draw' }] },
        { type: 'paragraph', content: [{ text: 'B' }] },
        { type: 'drawing', height: 100, strokes: [{ pts: [1, 1, 0.5], color: 'black', size: 'm', kind: 'draw' }] },
      ]),
    )
    expect(merged.filter((b) => b.type === 'drawing').length).toBe(1)
    expect(merged[merged.length - 1]?.type).toBe('drawing')
    if (merged[merged.length - 1]?.type === 'drawing') {
      expect(merged[merged.length - 1].strokes.length).toBe(2)
    }
  })

  it('consolidateDocumentBlocks preserves images between text and drawing', () => {
    const merged = consolidateDocumentBlocks(
      validateDocumentBlocks([
        { type: 'paragraph', content: [{ text: 'Intro' }] },
        { type: 'image', src: 'data:image/png;base64,abc', width: 320, height: 180 },
        { type: 'paragraph', content: [{ text: 'Caption' }] },
        { type: 'drawing', height: 100, strokes: [{ pts: [0, 0, 0.5], color: 'black', size: 'm', kind: 'draw' }] },
      ]),
    )
    expect(merged.map((b) => b.type)).toEqual(['paragraph', 'image', 'paragraph', 'drawing'])
    if (merged[1]?.type === 'image') {
      expect(merged[1].src).toContain('data:image/png')
    }
    expect(merged[merged.length - 1]?.type).toBe('drawing')
  })

  it('stroke bounds grow drawing block height', () => {
    const block = appendStrokeToDrawingBlock(
      { type: 'drawing', height: DRAWING_BLOCK_MIN_HEIGHT, strokes: [] },
      { pts: [0, 0, 0.5, 50, 90, 0.5], color: 'yellow', size: 'm', kind: 'highlight' },
    )
    expect(strokeBoundsHeight(block.strokes)).toBeGreaterThan(90)
    expect(block.height).toBeGreaterThanOrEqual(DRAWING_BLOCK_MIN_HEIGHT)
  })

  it('insertDrawingBlockAfter preserves order', () => {
    const { blocks, blockIndex } = insertDrawingBlockAfter(
      validateDocumentBlocks([{ type: 'paragraph', content: [{ text: 'A' }] }]),
      0,
    )
    expect(blockIndex).toBe(1)
    expect(blocks[1]?.type).toBe('drawing')
  })

  it('validateDocumentBlocks recovers empty and null input', () => {
    const fallback = [{ type: 'paragraph' as const, content: [{ text: '' }] }]
    expect(validateDocumentBlocks(null)).toEqual(fallback)
    expect(validateDocumentBlocks(undefined)).toEqual(fallback)
    expect(validateDocumentBlocks([])).toEqual(fallback)
  })

  it('validateDocumentBlocks drops garbage entries but keeps valid text', () => {
    const blocks = validateDocumentBlocks([
      null,
      'not-a-block',
      { type: 'paragraph', content: [{ text: 'Survived' }] },
      { type: 'drawing', height: -5, strokes: 'bad' },
      { type: 'drawing', height: 100, strokes: [{ pts: [NaN, 1, 0.5], color: 42, size: null, kind: 'draw' }] },
    ])
    expect(blocks.some((b) => b.type === 'paragraph' && b.content[0]?.text === 'Survived')).toBe(true)
    expect(blocks.every((b) => b.type !== 'drawing' || b.strokes.every((s) => s.pts.length >= 3))).toBe(true)
    expect(blocks.length).toBeGreaterThanOrEqual(1)
  })

  it('validateDocumentBlocks normalizes corrupt drawing block height', () => {
    const blocks = validateDocumentBlocks([
      {
        type: 'drawing',
        height: 'tall',
        strokes: [{ pts: [0, 0, 0.5, 40, 80, 0.5], color: 'black', size: 'm', kind: 'draw' }],
      },
    ])
    const draw = blocks.find((b) => b.type === 'drawing')
    expect(draw).toBeDefined()
    expect(draw!.height).toBeGreaterThanOrEqual(DRAWING_BLOCK_MIN_HEIGHT)
    expect(draw!.strokes).toHaveLength(1)
  })

  it('documentBlocksToDomHtml keeps valid block classes and data-doc-index', () => {
    const html = documentBlocksToDomHtml([
      { type: 'paragraph', content: [{ text: 'Hello' }] },
      { type: 'drawing', height: 120, strokes: [] },
    ])
    expect(html).toContain('data-doc-index="0"')
    expect(html).toContain('class="ic-rt-block ic-rt-paragraph"')
    expect(html).toContain('ic-drawing-overlay')
    const root = document.createElement('div')
    root.innerHTML = html
    expect(root.querySelector('[data-doc-index="0"][data-block="paragraph"]')).toBeTruthy()
  })
})
