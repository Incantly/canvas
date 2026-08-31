// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Editor, TOOLS } from '../src/editor.js'
import { createCanvas } from '../src/index.js'
import { blocksToPlainText, blocksToHtml, textToBlocks } from '../src/rich-text/index.js'
import { notesPageContentRect } from '../src/page-document.js'
import { notesPaperHeight } from '../src/notebook-document.js'

let pid = 1
const ev = (x: number, y: number, over: any = {}) => ({
  pointerId: over.pointerId ?? pid,
  pointerType: 'mouse',
  clientX: x,
  clientY: y,
  button: 0,
  pressure: 0.5,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ctrlKey: false,
  target: null,
  preventDefault() {},
  stopPropagation() {},
  ...over,
})

function drag(editor: Editor, pts: number[][], over: any = {}) {
  pid++
  const [x0, y0] = pts[0]
  ;(editor as any)._pointerDown({ ...ev(x0, y0, over), target: (editor as any).canvas })
  for (const [x, y] of pts.slice(1)) (editor as any)._pointerMove({ ...ev(x, y, over), target: (editor as any).canvas })
  const [xn, yn] = pts[pts.length - 1]
  ;(editor as any)._pointerUp({ ...ev(xn, yn, over), target: (editor as any).canvas })
}

let container: HTMLDivElement, editor: Editor

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  editor = new Editor({ container })
})

afterEach(() => {
  editor.destroy()
  container.remove()
})

describe('setup', () => {
  it('mounts canvases and starts on draw', () => {
    expect(container.querySelectorAll('canvas').length).toBe(2)
    expect(editor.tool).toBe('draw')
    expect(TOOLS).toContain('draw')
  })

  it('documentMode starts on select with page document layer active', () => {
    const docContainer = document.createElement('div')
    document.body.appendChild(docContainer)
    const docEditor = new Editor({ container: docContainer, documentMode: true })
    expect(docEditor.tool).toBe('select')
    expect(docContainer.classList.contains('ic-document-mode')).toBe(true)
    const wrap = docContainer.querySelector('.ic-page-doc-wrap')
    expect(wrap?.classList.contains('ic-page-doc-mode')).toBe(true)
    expect(wrap?.classList.contains('ic-page-doc-ink-pass')).toBe(false)
    docEditor.setTool('draw')
    expect(wrap?.classList.contains('ic-page-doc-ink-pass')).toBe(true)
    docEditor.destroy()
    docContainer.remove()
  })

  it('camera math round-trips', () => {
    editor.setCamera({ x: 50, y: -20, z: 2 })
    const p = editor.screenToPage(100, 100)
    const s = editor.pageToScreen(p.x, p.y)
    expect(s.x).toBeCloseTo(100)
    expect(s.y).toBeCloseTo(100)
  })

  it('zoomAt keeps the anchor point fixed', () => {
    const before = editor.screenToPage(80, 60)
    editor.zoomAt(80, 60, 2)
    const after = editor.screenToPage(80, 60)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
    expect(editor.camera.z).toBeCloseTo(2)
  })
})

describe('deferred fit', () => {
  it('fitContent before layout waits for real dimensions instead of clamping to min zoom', () => {
    editor.setTool('geo')
    drag(editor, [[10, 10], [110, 60]])
    editor.fitContent()
    expect(editor.camera.z).toBe(1)

    Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true })
    Object.defineProperty(container, 'clientHeight', { value: 600, configurable: true })
    editor.render()
    expect(editor.camera.z).toBeGreaterThan(0.5)
    const center = editor.pageToScreen(60, 35)
    expect(center.x).toBeGreaterThan(100)
    expect(center.x).toBeLessThan(700)
    expect(center.y).toBeGreaterThan(50)
    expect(center.y).toBeLessThan(500)
  })
})

describe('document mode drawing', () => {
  it('draw tool stores ink in page document, not canvas draw shapes', () => {
    const docContainer = document.createElement('div')
    document.body.appendChild(docContainer)
    const docEditor = new Editor({ container: docContainer, documentMode: true })
    docEditor.setTool('draw')
    drag(docEditor, [[100, 120], [160, 180], [220, 240]])
    const inkShapes = docEditor.store.shapes().filter((s) => s.type === 'draw' || s.type === 'highlight')
    expect(inkShapes.length).toBe(0)
    const page = docEditor.currentPage()!
    const blocks = docEditor.store.pageDocumentBlocks(page.id)
    const drawing = blocks.find((b) => b.type === 'drawing')
    expect(drawing).toBeDefined()
    if (drawing?.type === 'drawing') {
      expect(drawing.strokes.length).toBeGreaterThanOrEqual(1)
      expect(drawing.strokes[0]!.pts.length).toBeGreaterThanOrEqual(3)
    }
    docEditor.destroy()
    docContainer.remove()
  })

  it('repeated drags reuse one drawing block at document end', () => {
    const docContainer = document.createElement('div')
    document.body.appendChild(docContainer)
    Object.defineProperty(docContainer, 'clientWidth', { value: 900, configurable: true })
    Object.defineProperty(docContainer, 'clientHeight', { value: 700, configurable: true })
    const docEditor = new Editor({ container: docContainer, documentMode: true })
    docEditor.render()
    docEditor.setTool('draw')
    drag(docEditor, [[100, 120], [160, 180]])
    drag(docEditor, [[100, 120], [140, 200]])
    drag(docEditor, [[100, 130], [180, 220]])
    const page = docEditor.currentPage()!
    const blocks = docEditor.store.pageDocumentBlocks(page.id)
    const drawingBlocks = blocks.filter((b) => b.type === 'drawing')
    expect(drawingBlocks.length).toBe(1)
    expect(blocks[blocks.length - 1]?.type).toBe('drawing')
    docEditor.destroy()
    docContainer.remove()
  })

  it('documentMode ignores zoomAt', () => {
    const docContainer = document.createElement('div')
    document.body.appendChild(docContainer)
    const docEditor = new Editor({ container: docContainer, documentMode: true })
    docEditor.fitDocumentView()
    const z0 = docEditor.camera.z
    docEditor.zoomAt(100, 100, 2)
    expect(docEditor.camera.z).toBeCloseTo(z0)
    docEditor.destroy()
    docContainer.remove()
  })

  it('documentMode accepts custom background color', () => {
    const docContainer = document.createElement('div')
    document.body.appendChild(docContainer)
    const docEditor = new Editor({
      container: docContainer,
      documentMode: true,
      documentBackground: '#e8f4ff',
    })
    expect(docEditor.documentBackgroundColor()).toBe('#e8f4ff')
    expect(docContainer.style.getPropertyValue('--ic-doc-bg')).toBe('#e8f4ff')
    docEditor.setDocumentBackground('#1a1a2e')
    expect(docEditor.documentBackgroundColor()).toBe('#1a1a2e')
    docEditor.setDocumentBackground(null)
    expect(docEditor.documentBackgroundColor()).toBe('#ffffff')
    expect(() => docEditor.setDocumentBackground('bad-color')).toThrow()
    docEditor.destroy()
    docContainer.remove()
  })

  it('documentMode click on page focuses contenteditable with valid blocks', () => {
    const docContainer = document.createElement('div')
    Object.defineProperty(docContainer, 'clientWidth', { value: 900, configurable: true })
    Object.defineProperty(docContainer, 'clientHeight', { value: 700, configurable: true })
    document.body.appendChild(docContainer)
    const docEditor = new Editor({ container: docContainer, documentMode: true })
    docEditor.render()
    docEditor.setTool('select')
    const page = docEditor.currentPage()!
    const rect = notesPageContentRect(
      page,
      notesPaperHeight(page, docEditor.store.notebookDocumentBlocks(), docEditor.theme),
    )
    const pt = docEditor.pageToScreen(page.x + rect.x + 24, page.y + rect.y + 24)
    drag(docEditor, [[pt.x, pt.y]])
    const pageDoc = docContainer.querySelector('.ic-page-doc') as HTMLDivElement
    expect(pageDoc).toBeTruthy()
    expect(pageDoc.querySelector('[data-block="paragraph"]')).toBeTruthy()
    docEditor.destroy()
    docContainer.remove()
  })

  it('documentMode paste appends text to notebook document, not canvas shapes', async () => {
    const docContainer = document.createElement('div')
    document.body.appendChild(docContainer)
    const docEditor = new Editor({ container: docContainer, documentMode: true })
    const readText = vi.fn().mockResolvedValue('Pasted line')
    Object.assign(navigator, {
      clipboard: { readText, writeText: vi.fn() },
    })
    await docEditor.pasteFromClipboard()
    const blocks = docEditor.store.notebookDocumentBlocks()
    expect(blocks.some((b) => b.type === 'paragraph' && b.content[0]?.text?.includes('Pasted line'))).toBe(true)
    expect(docEditor.store.shapes().length).toBe(0)
    docEditor.destroy()
    docContainer.remove()
  })
})

describe('drawing', () => {
  it('a drag with the draw tool creates one stroke, undoable as one step', () => {
    editor.setTool('draw')
    drag(editor, [[10, 10], [20, 15], [40, 30], [60, 50]])
    const shapes = editor.store.shapes() as any[]
    expect(shapes.length).toBe(1)
    expect(shapes[0].type).toBe('draw')
    expect(shapes[0].props.done).toBe(true)
    expect(shapes[0].props.pts.length).toBeGreaterThanOrEqual(6)
    expect((editor.store as any).undos.length).toBe(1)
    editor.store.undo()
    expect(editor.store.shapes().length).toBe(0)
  })

  it('the highlighter makes highlight shapes that sort under ink', () => {
    editor.setTool('draw')
    drag(editor, [[10, 10], [60, 60]])
    editor.setTool('highlight')
    drag(editor, [[10, 20], [60, 70]])
    const sorted = editor.shapesSorted() as any[]
    expect(sorted[0].type).toBe('highlight')
    expect(sorted[1].type).toBe('draw')
  })
})

describe('geo / line / arrow', () => {
  it('dragging geo creates a rect of the dragged size and selects it', () => {
    editor.setTool('geo')
    drag(editor, [[10, 10], [110, 60]])
    const [s] = editor.store.shapes() as any[]
    expect(s.type).toBe('geo')
    expect(s.props.w).toBeCloseTo(100)
    expect(s.props.h).toBeCloseTo(50)
    expect(editor.tool).toBe('select')
    expect(editor.selection.has(s.id)).toBe(true)
  })

  it('a click (no drag) drops a ready-made 160x160 shape', () => {
    editor.setTool('geo')
    drag(editor, [[50, 50]])
    const [s] = editor.store.shapes() as any[]
    expect(s.props.w).toBe(160)
    expect(s.props.h).toBe(160)
  })

  it('arrow drag sets dx/dy; tiny arrows evaporate', () => {
    editor.setTool('arrow')
    drag(editor, [[10, 10], [110, 40]])
    const [s] = editor.store.shapes() as any[]
    expect(s.type).toBe('arrow')
    expect(s.props.dx).toBeCloseTo(100)
    expect(s.props.dy).toBeCloseTo(30)

    editor.setTool('arrow')
    drag(editor, [[200, 200], [200.5, 200.5]])
    expect(editor.store.shapes().length).toBe(1)
  })

  it('shift snaps lines to 15-degree steps', () => {
    editor.setTool('line')
    pid++
    ;(editor as any)._pointerDown({ ...ev(0, 0), target: (editor as any).canvas })
    ;(editor as any)._pointerMove({ ...ev(100, 8, { shiftKey: true }), target: (editor as any).canvas })
    const [s] = editor.store.shapes() as any[]
    expect(s.props.dy).toBeCloseTo(0)
    ;(editor as any)._pointerUp({ ...ev(100, 8, { shiftKey: true }), target: (editor as any).canvas })
  })
})

describe('selection & transforms', () => {
  const makeRect = (x: number, y: number, w = 60, h = 40): any => {
    editor.setTool('geo')
    drag(editor, [[x, y], [x + w, y + h]])
    return editor.store.shapes()[editor.store.shapes().length - 1]
  }

  it('click selects, click empty clears, shift-click toggles', () => {
    const a = makeRect(10, 10)
    const b = makeRect(200, 10)
    drag(editor, [[10, 10]])
    expect([...editor.selection]).toEqual([a.id])
    drag(editor, [[200, 10]], { shiftKey: true })
    expect(editor.selection.size).toBe(2)
    drag(editor, [[400, 400]])
    expect(editor.selection.size).toBe(0)
    expect(b.id).toBeTruthy()
  })

  it('marquee selects grazed shapes', () => {
    const a = makeRect(20, 20)
    makeRect(300, 300)
    drag(editor, [[0, 0], [120, 120]])
    expect([...editor.selection]).toEqual([a.id])
  })

  it('dragging a selected shape translates it (one undo step)', () => {
    const a = makeRect(10, 10)
    editor.setSelection([a.id])
    const undosBefore = (editor.store as any).undos.length
    drag(editor, [[30, 14], [70, 64]])
    const moved = editor.store.get(a.id) as any
    expect(moved.x).toBeCloseTo(a.x + 40)
    expect(moved.y).toBeCloseTo(a.y + 50)
    expect((editor.store as any).undos.length).toBe(undosBefore + 1)
  })

  it('deleteSelection / selectAll / duplicateSelection', () => {
    makeRect(10, 10)
    makeRect(100, 10)
    editor.selectAll()
    expect(editor.selection.size).toBe(2)
    editor.duplicateSelection()
    expect(editor.store.shapes().length).toBe(4)
    expect(editor.selection.size).toBe(2)
    editor.selectAll()
    editor.deleteSelection()
    expect(editor.store.shapes().length).toBe(0)
  })

  it('bringToFront / sendToBack reorder z', () => {
    const a = makeRect(10, 10)
    const b = makeRect(20, 20)
    expect(b.z).toBeGreaterThan(a.z)
    editor.setSelection([a.id])
    editor.bringToFront()
    expect((editor.store.get(a.id) as any).z).toBeGreaterThan((editor.store.get(b.id) as any).z)
    editor.sendToBack()
    expect((editor.store.get(a.id) as any).z).toBeLessThan((editor.store.get(b.id) as any).z)
  })

  it('eraser removes everything it swept over in one undo step', () => {
    makeRect(10, 10)
    makeRect(100, 100)
    editor.setTool('eraser')
    drag(editor, [[10, 10], [100, 100]])
    expect(editor.store.shapes().length).toBe(0)
    editor.store.undo()
    expect(editor.store.shapes().length).toBe(2)
  })
})

describe('text & notes', () => {
  it('text tool focuses page document; typing updates page.document.blocks', () => {
    editor.setTool('text')
    drag(editor, [[120, 120]])
    const pageDoc = container.querySelector('.ic-page-doc') as HTMLDivElement
    expect(pageDoc).toBeTruthy()
    pageDoc.innerHTML = '<div class="ic-rt-block ic-rt-paragraph" data-block="paragraph">hello page</div>'
    pageDoc.dispatchEvent(new window.Event('input'))
    pageDoc.dispatchEvent(new window.Event('blur'))
    const blocks = editor.store.notebookDocumentBlocks()
    expect(blocks[0]?.type).toBe('paragraph')
    if (blocks[0]?.type === 'paragraph') {
      expect(blocks[0].content[0]?.text).toContain('hello page')
    }
  })

  it('empty text tool click does not create text shapes', () => {
    const before = editor.store.shapes().filter((s: any) => s.type === 'text').length
    editor.setTool('text')
    drag(editor, [[200, 200]])
    const after = editor.store.shapes().filter((s: any) => s.type === 'text').length
    expect(after).toBe(before)
  })

  it('notes get the note default color when the pen is on the default ink', () => {
    editor.setTool('note')
    drag(editor, [[50, 50]])
    const note = editor.store.shapes().find((s: any) => s.type === 'note') as any
    expect(note.props.color).toBe('yellow')
    const edit = container.querySelector('.ic-rich-edit') as HTMLDivElement
    edit.innerHTML = blocksToHtml(textToBlocks('sticky'))
    edit.dispatchEvent(new window.Event('input'))
    ;(editor as any)._commitText()
    expect(blocksToPlainText((editor.store.get(note.id) as any).props.blocks)).toBe('sticky')
  })
})

describe('styles', () => {
  it('setStyle updates the pen and any applicable selection', () => {
    editor.setTool('geo')
    drag(editor, [[10, 10], [80, 80]])
    const [s] = editor.store.shapes() as any[]
    editor.setSelection([s.id])
    editor.setStyle('color', 'red')
    editor.setStyle('fill', 'solid')
    const after = editor.store.get(s.id) as any
    expect(after.props.color).toBe('red')
    expect(after.props.fill).toBe('solid')
    expect(editor.styles.color).toBe('red')
  })

  it('currentStyles reports mixed values as null', () => {
    editor.setTool('geo')
    drag(editor, [[10, 10], [80, 80]])
    editor.setTool('geo')
    drag(editor, [[100, 10], [180, 80]])
    const [a, b] = editor.store.shapes() as any[]
    editor.store.update(a.id, { props: { color: 'blue' } })
    editor.store.update(b.id, { props: { color: 'green' } })
    editor.setSelection([a.id, b.id])
    expect((editor.currentStyles() as any).color).toBeNull()
  })
})

describe('readonly & theme', () => {
  it('readonly blocks input', () => {
    editor.setReadonly(true)
    editor.setTool('draw')
    drag(editor, [[10, 10], [60, 60]])
    expect(editor.store.shapes().length).toBe(0)
  })

  it('theme switches live and reflects on the container', () => {
    editor.setTheme('dark')
    expect(editor.theme.id).toBe('dark')
    expect(container.dataset.icTheme).toBe('dark')
  })
})

function recordingCtx() {
  const calls: any[] = []
  const ctx: any = { globalAlpha: 1, lineWidth: 1, fillStyle: '', strokeStyle: '', calls }
  for (const fn of ['save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'arc', 'setTransform']) {
    ctx[fn] = (...a: any[]) => calls.push([fn, ...a])
  }
  ctx.stroke = () => calls.push(['stroke', ctx.strokeStyle, ctx.globalAlpha])
  ctx.fill = () => calls.push(['fill', ctx.fillStyle, ctx.globalAlpha])
  return ctx
}

describe('grid', () => {
  it('defaults to lines, switches, and emits', () => {
    const seen: string[] = []
    editor.on('grid', () => seen.push(editor.grid))
    expect(editor.grid).toBe('lines')
    editor.setGrid('none')
    editor.setGrid('none')
    editor.setGrid('nonsense' as any)
    editor.setGrid('dots')
    expect(editor.grid).toBe('dots')
    expect(seen).toEqual(['none', 'dots'])
  })

  it('draws nothing when off', () => {
    editor.setGrid('none')
    const ctx = recordingCtx()
    ;(editor as any)._drawGrid(ctx, { x: 0, y: 0, z: 1 }, 400, 300, 1)
    expect(ctx.calls.length).toBe(0)
  })

  it('rules the frame at the base step, majors every fifth', () => {
    editor.setGrid('lines')
    const ctx = recordingCtx()
    ;(editor as any)._drawGrid(ctx, { x: 0, y: 0, z: 1 }, 400, 200, 1)
    const verticals = ctx.calls.filter((c: any) => c[0] === 'moveTo' && c[2] === 0).map((c: any) => c[1])
    expect(verticals.sort((a: number, b: number) => a - b)).toEqual([0.5, 40.5, 80.5, 120.5, 160.5, 200.5, 240.5, 280.5, 320.5, 360.5, 400.5])
    const strokes = ctx.calls.filter((c: any) => c[0] === 'stroke')
    expect(strokes.length).toBe(2)
    expect(strokes[0][1]).toBe((editor.theme as any).grid.line.minor)
    expect(strokes[1][1]).toBe((editor.theme as any).grid.line.major)
  })

  it('doubles the step as you zoom out, halves it as you zoom in', () => {
    editor.setGrid('lines')
    const stepAt = (z: number) => {
      const ctx = recordingCtx()
      ;(editor as any)._drawGrid(ctx, { x: 0, y: 0, z }, 800, 400, 1)
      const xs = [...new Set(ctx.calls.filter((c: any) => c[0] === 'moveTo' && c[2] === 0).map((c: any) => c[1]))]
      xs.sort((a: number, b: number) => a - b)
      return ((xs as any)[1] - (xs as any)[0]) / z
    }
    expect(stepAt(1)).toBe(40)
    expect(stepAt(0.3)).toBe(80)
    expect(stepAt(3)).toBe(20)
  })

  it('dots mark intersections in one uniform weight and ink', () => {
    editor.setGrid('dots')
    const ctx = recordingCtx()
    ;(editor as any)._drawGrid(ctx, { x: 0, y: 0, z: 1 }, 400, 200, 1)
    const arcs = ctx.calls.filter((c: any) => c[0] === 'arc')
    expect(arcs.length).toBe(11 * 6)
    const radii = [...new Set(arcs.map((c: any) => c[3]))]
    expect(radii).toEqual([1.6])
    const fills = ctx.calls.filter((c: any) => c[0] === 'fill')
    expect(fills.length).toBe(1)
    expect(fills[0][1]).toBe((editor.theme as any).grid.dot.minor)
  })

  it('travels with the camera', () => {
    editor.setGrid('lines')
    const ctx = recordingCtx()
    ;(editor as any)._drawGrid(ctx, { x: 10, y: 0, z: 1 }, 100, 100, 1)
    const verticals = ctx.calls.filter((c: any) => c[0] === 'moveTo' && c[2] === 0).map((c: any) => c[1])
    expect(verticals.sort((a: number, b: number) => a - b)).toEqual([10.5, 50.5, 90.5])
  })
})

describe('clear board', () => {
  it('em&gt;⌘⌫ empties the board in one undoable step', () => {
    editor.setTool('draw')
    drag(editor, [[10, 10], [40, 40]])
    drag(editor, [[60, 10], [90, 40]])
    expect(editor.store.shapes().length).toBe(2)

    ;(editor as any)._keyDown({
      key: 'Backspace', metaKey: true, shiftKey: true, ctrlKey: false,
      preventDefault() {}, stopPropagation() {},
    })
    expect(editor.store.shapes().length).toBe(0)

    editor.store.undo()
    expect(editor.store.shapes().length).toBe(2)
  })

  it('plain ⌫ still only deletes the selection', () => {
    editor.setTool('draw')
    drag(editor, [[10, 10], [40, 40]])
    drag(editor, [[60, 10], [90, 40]])
    editor.setSelection([(editor.store.shapes()[0] as any).id])
    ;(editor as any)._keyDown({
      key: 'Backspace', metaKey: false, shiftKey: false, ctrlKey: false,
      preventDefault() {}, stopPropagation() {},
    })
    expect(editor.store.shapes().length).toBe(1)
  })

  it('clearBoard on an empty board is a no-op', () => {
    editor.clearBoard()
    expect(editor.store.canUndo).toBe(false)
  })
})

describe('laser', () => {
  it('scribbles are ephemeral (never in the store)', () => {
    editor.setTool('laser')
    drag(editor, [[10, 10], [50, 50], [90, 30]])
    expect(editor.store.shapes().length).toBe(0)
    expect(editor.getScribbles().length).toBe(1)
    expect(editor.getScribbles()[0].points.length).toBe(3)
  })
})

describe('export', () => {
  it('exportImage yields a blob for shapes and for an empty page', async () => {
    const empty = await editor.exportImage()
    expect(empty).toBeInstanceOf(Blob)
    editor.setTool('geo')
    drag(editor, [[10, 10], [80, 80]])
    const blob = await editor.exportImage({ background: true, scale: 2 })
    expect(blob).toBeInstanceOf(Blob)
    expect(blob!.type).toBe('image/png')
  })
})

describe('events & lifecycle', () => {
  it('emits change/selection/tool events and unsubscribes cleanly', () => {
    const changes = vi.fn(), sel = vi.fn(), tool = vi.fn()
    const off = editor.on('change', changes)
    editor.on('selection', sel)
    editor.on('tool', tool)
    editor.setTool('geo')
    drag(editor, [[10, 10], [80, 80]])
    expect(changes).toHaveBeenCalled()
    expect(sel).toHaveBeenCalled()
    expect(tool).toHaveBeenCalled()
    const n = changes.mock.calls.length
    off()
    editor.store.undo()
    expect(changes.mock.calls.length).toBe(n)
  })

  it('destroy removes canvases and stops listening', () => {
    const c2 = document.createElement('div')
    document.body.appendChild(c2)
    const board = createCanvas({ container: c2 } as any)
    expect(c2.querySelector('.ic-dock')).toBeTruthy()
    board.destroy()
    expect(c2.querySelector('canvas')).toBeNull()
    expect(c2.querySelector('.ic-dock')).toBeNull()
    c2.remove()
  })
})

describe('createCanvas UI', () => {
  it('builds the dock with tool buttons that switch tools', () => {
    const c2 = document.createElement('div')
    document.body.appendChild(c2)
    const board = createCanvas({ container: c2 } as any)
    const drawBtn = c2.querySelector('.ic-dock button[data-name="draw"]') as HTMLButtonElement
    expect(drawBtn).toBeTruthy()
    drawBtn.click()
    expect(board.editor.tool).toBe('draw')
    expect(drawBtn.classList.contains('on')).toBe(true)
    board.destroy()
    c2.remove()
  })

  it('shows the watermark by default, linked to the site', () => {
    const c2 = document.createElement('div')
    document.body.appendChild(c2)
    const board = createCanvas({ container: c2 } as any)
    const mark = c2.querySelector('.ic-watermark') as HTMLAnchorElement
    expect(mark).toBeTruthy()
    expect(mark.href).toBe('https://github.com/Incantly/canvas')
    board.destroy()
    expect(c2.querySelector('.ic-watermark')).toBeNull()
    c2.remove()
  })

  it('watermark: false removes it; hideUi keeps it', () => {
    const c2 = document.createElement('div')
    document.body.appendChild(c2)
    const bare = createCanvas({ container: c2, watermark: false } as any)
    expect(c2.querySelector('.ic-watermark')).toBeNull()
    bare.destroy()
    const headless = createCanvas({ container: c2, hideUi: true } as any)
    expect(c2.querySelector('.ic-watermark')).toBeTruthy()
    headless.destroy()
    c2.remove()
  })

  it('undo/redo buttons track history through full gestures', () => {
    const c2 = document.createElement('div')
    document.body.appendChild(c2)
    const board = createCanvas({ container: c2 } as any)
    const btn = (n: string) => c2.querySelector(`.ic-actions button[data-name="${n}"]`) as HTMLButtonElement
    expect(btn('undo').disabled).toBe(true)

    board.editor.setTool('draw')
    drag(board.editor, [[10, 10], [40, 40], [80, 60]])
    expect(btn('undo').disabled).toBe(false)
    expect(btn('redo').disabled).toBe(true)

    btn('undo').click()
    expect(board.editor.store.shapes().length).toBe(0)
    expect(btn('redo').disabled).toBe(false)
    btn('redo').click()
    expect(board.editor.store.shapes().length).toBe(1)
    expect(btn('undo').disabled).toBe(false)
    expect(btn('redo').disabled).toBe(true)
    board.destroy()
    c2.remove()
  })

  it('duplicate/delete light up with a selection and act on it', () => {
    const c2 = document.createElement('div')
    document.body.appendChild(c2)
    const board = createCanvas({ container: c2 } as any)
    const btn = (n: string) => c2.querySelector(`.ic-actions button[data-name="${n}"]`) as HTMLButtonElement
    expect(btn('duplicate').disabled).toBe(true)
    expect(btn('delete').disabled).toBe(true)

    board.editor.setTool('draw')
    drag(board.editor, [[10, 10], [40, 40], [80, 60]])
    const id = (board.editor.store.shapes()[0] as any).id
    board.editor.setSelection([id])
    expect(btn('duplicate').disabled).toBe(false)
    expect(btn('delete').disabled).toBe(false)

    btn('duplicate').click()
    expect(board.editor.store.shapes().length).toBe(2)
    btn('delete').click()
    expect(board.editor.store.shapes().length).toBe(1)
    expect(btn('duplicate').disabled).toBe(true)
    board.destroy()
    c2.remove()
  })

  it('the board menu switches theme and grid', () => {
    const c2 = document.createElement('div')
    document.body.appendChild(c2)
    const board = createCanvas({ container: c2 } as any)
    ;(c2.querySelector('.ic-dock button[data-name="menu"]') as HTMLButtonElement).click()
    const seg = (label: string) => [...c2.querySelectorAll('.ic-menu-row')]
      .find((r: any) => r.textContent.trim().startsWith(label)) as HTMLElement
    const btns = (label: string) => [...seg(label).querySelectorAll('.ic-seg-btn')] as HTMLElement[]

    expect((btns('Theme')[0] as any).classList.contains('on')).toBe(true)
    btns('Theme')[1].click()
    expect(board.editor.theme.id).toBe('dark')
    expect((btns('Theme')[1] as any).classList.contains('on')).toBe(true)

    expect(board.editor.grid).toBe('lines')
    const gridRow = c2.querySelector('.ic-has-sub') as HTMLElement
    expect(gridRow.textContent).toContain('Grid')
    expect(gridRow.textContent).toContain('Lines')
    expect(gridRow.classList.contains('sub-open')).toBe(false)
    gridRow.click()
    expect(gridRow.classList.contains('sub-open')).toBe(true)
    const options = [...gridRow.querySelectorAll('.ic-submenu .ic-menu-item')] as HTMLElement[]
    expect(options.length).toBe(6)
    expect((options[1].querySelector('.ic-mi-check') as HTMLElement).innerHTML).not.toBe('')
    options[0].click()
    expect(board.editor.grid).toBe('none')
    options[3].click()
    expect(board.editor.grid).toBe('dots')
    options[5].click()
    expect(board.editor.grid).toBe('iso')
    expect(gridRow.classList.contains('sub-open')).toBe(true)
    expect((options[5].querySelector('.ic-mi-check') as HTMLElement).innerHTML).not.toBe('')
    expect((options[1].querySelector('.ic-mi-check') as HTMLElement).innerHTML).toBe('')
    expect((gridRow.querySelector('.ic-mi-value') as HTMLElement).textContent).toBe('Isometric')
    gridRow.click()
    expect(gridRow.classList.contains('sub-open')).toBe(false)

    board.destroy()
    c2.remove()
  })

  it('a host can drop the theme/grid switches', () => {
    const c2 = document.createElement('div')
    document.body.appendChild(c2)
    const board = createCanvas({ container: c2, themeToggle: false, gridControl: false } as any)
    ;(c2.querySelector('.ic-dock button[data-name="menu"]') as HTMLButtonElement).click()
    expect(c2.querySelectorAll('.ic-menu-row').length).toBe(0)
    board.ui.setOptions({ gridControl: true })
    ;(c2.querySelector('.ic-dock button[data-name="menu"]') as HTMLButtonElement).click()
    const gridRow = [...c2.querySelectorAll('.ic-menu-item')]
      .find((r: any) => r.textContent.trim().startsWith('Grid'))
    expect(gridRow).toBeTruthy()
    expect(c2.querySelectorAll('.ic-menu-row').length).toBe(0)
    board.destroy()
    c2.remove()
  })

  it('the menu clears the board', () => {
    const c2 = document.createElement('div')
    document.body.appendChild(c2)
    const board = createCanvas({ container: c2 } as any)
    board.editor.setTool('draw')
    drag(board.editor, [[10, 10], [40, 40]])
    ;(c2.querySelector('.ic-dock button[data-name="menu"]') as HTMLButtonElement).click()
    const clear = [...c2.querySelectorAll('.ic-menu-item')]
      .find((b: any) => b.textContent.includes('Clear board')) as HTMLElement
    expect(clear.textContent).toContain('⇧⌘⌫')
    clear.click()
    expect(board.editor.store.shapes().length).toBe(0)
    board.destroy()
    c2.remove()
  })

  it('hideUi hides the chrome; readonly does too', () => {
    const c2 = document.createElement('div')
    document.body.appendChild(c2)
    const board = createCanvas({ container: c2, hideUi: true } as any)
    expect((c2.querySelector('.ic-ui') as HTMLElement).classList.contains('ic-hidden')).toBe(true)
    board.destroy()
    c2.remove()
  })
})

describe('pages', () => {
  it('starts with one page', () => {
    expect(editor.pages().length).toBe(1)
    expect(editor.currentPageId).toBe(editor.pages()[0].id)
  })

  it('scopes shapes to the active page', () => {
    const first = editor.currentPageId
    const second = editor.addPage().id
    expect(second).not.toBe(first)
    expect(editor.currentPageId).toBe(first)
    editor.setPage(second, { fit: false })
    editor.setTool('geo')
    drag(editor, [[30, 30], [130, 90]])
    expect(editor.store.shapesOnPage(second).length).toBe(1)
    editor.setPage(first, { fit: false })
    expect(editor.shapesSorted().length).toBe(0)
    editor.setPage(second, { fit: false })
    expect(editor.shapesSorted().length).toBe(1)
  })

  it('fitPage frames the page bounds', () => {
    Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true })
    Object.defineProperty(container, 'clientHeight', { value: 600, configurable: true })
    editor.fitPage({ animate: 0 })
    expect(editor.camera.z).toBeLessThanOrEqual(1)
    expect(editor.camera.z).toBeGreaterThan(0)
  })

  it('horizontal layout places new pages to the right of page 1', () => {
    editor.setPageLayout('horizontal')
    const pages = editor.pages()
    expect(pages.length).toBe(1)
    editor.addPage()
    const next = editor.pages()
    expect(next[0].x).toBe(0)
    expect(next[1].x).toBeGreaterThan(0)
    expect(next[1].y).toBe(0)
  })

  it('addPage does not move the camera or switch pages', () => {
    Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true })
    Object.defineProperty(container, 'clientHeight', { value: 600, configurable: true })
    editor.zoomAt(400, 300, 2.5, { animate: 0 })
    const first = editor.currentPageId
    const camBefore = { ...editor.camera }
    editor.addPage()
    expect(editor.pages().length).toBe(2)
    expect(editor.currentPageId).toBe(first)
    expect(editor.camera.z).toBeCloseTo(camBefore.z, 5)
    expect(editor.camera.x).toBeCloseTo(camBefore.x, 5)
    expect(editor.camera.y).toBeCloseTo(camBefore.y, 5)
  })

  it('setPageLayout does not change the camera', () => {
    Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true })
    Object.defineProperty(container, 'clientHeight', { value: 600, configurable: true })
    editor.addPage()
    editor.zoomAt(400, 300, 2.2, { animate: 0 })
    const camBefore = { ...editor.camera }
    editor.setPageLayout('horizontal')
    expect(editor.pageLayout()).toBe('horizontal')
    expect(editor.camera.z).toBeCloseTo(camBefore.z, 5)
    expect(editor.camera.x).toBeCloseTo(camBefore.x, 5)
    expect(editor.camera.y).toBeCloseTo(camBefore.y, 5)
    editor.setPageLayout('vertical')
    expect(editor.camera.z).toBeCloseTo(camBefore.z, 5)
    expect(editor.camera.x).toBeCloseTo(camBefore.x, 5)
    expect(editor.camera.y).toBeCloseTo(camBefore.y, 5)
  })
})
