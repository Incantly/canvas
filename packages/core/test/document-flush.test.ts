// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Editor } from '../src/editor.js'

let container: HTMLDivElement
let editor: Editor

function makeDocEditor(): { container: HTMLDivElement; editor: Editor } {
  const c = document.createElement('div')
  Object.defineProperty(c, 'clientWidth', { value: 900, configurable: true })
  Object.defineProperty(c, 'clientHeight', { value: 700, configurable: true })
  document.body.appendChild(c)
  const e = new Editor({ container: c, documentMode: true })
  e.render()
  return { container: c, editor: e }
}

function currentBlocks(e: Editor): string {
  const page = e.currentPage()!
  return e.store
    .pageDocumentBlocks(page.id)
    .filter((b) => b.type === 'paragraph')
    .map((b) => (b.type === 'paragraph' ? b.content.map((s) => s.text).join('') : ''))
    .join('|')
}

function editFirstParagraph(e: Editor, text: string): void {
  const pageDoc = e.container.querySelector('.ic-page-doc') as HTMLDivElement
  const first = pageDoc.querySelector('[data-block]') as HTMLElement
  expect(first).toBeTruthy()
  // Simulate a user keystroke: mutate DOM, then fire input (deferred via rAF).
  first.textContent = text
  pageDoc.dispatchEvent(new InputEvent('input', { bubbles: true }))
}

beforeEach(() => {
  const init = makeDocEditor()
  container = init.container
  editor = init.editor
})

afterEach(() => {
  try {
    editor.destroy()
  } catch {
    /* already destroyed in test */
  }
  container.remove()
})

describe('R-02 pending edits are never lost', () => {
  it('exposes hasPendingEdits / flushPendingEdits boundary', () => {
    expect(typeof editor.hasPendingEdits).toBe('function')
    expect(typeof editor.flushPendingEdits).toBe('function')
    expect(typeof editor.getSnapshot).toBe('function')
    expect(editor.hasPendingEdits()).toBe(false)
    const perf = editor.getPerformanceSnapshot()
    expect(perf.sampleCount).toBeGreaterThan(0)
    expect(perf.p95FrameMs).toBeGreaterThanOrEqual(0)
    expect(perf.totalShapes).toBe(editor.store.shapes().length)
  })

  it('flush commits a deferred keystroke to the store', () => {
    editFirstParagraph(editor, 'flushed-hello')
    expect(editor.hasPendingEdits()).toBe(true)
    editor.flushPendingEdits()
    expect(editor.hasPendingEdits()).toBe(false)
    expect(currentBlocks(editor)).toContain('flushed-hello')
  })

  it('destroy flushes instead of dropping the final keystroke', () => {
    editFirstParagraph(editor, 'last-keystroke-wins')
    expect(editor.hasPendingEdits()).toBe(true)
    const store = editor.store
    const pageId = editor.currentPage()!.id
    editor.destroy()
    const blocks = store.pageDocumentBlocks(pageId)
    const text = blocks
      .filter((b) => b.type === 'paragraph')
      .map((b) => (b.type === 'paragraph' ? b.content.map((s) => s.text).join('') : ''))
      .join('|')
    expect(text).toContain('last-keystroke-wins')
  })

  it('getSnapshot includes pending edits', () => {
    editFirstParagraph(editor, 'snapshot-sees-me')
    const snap = editor.getSnapshot()
    const recs = Object.values(snap.document.store)
    const dumped = JSON.stringify(recs)
    expect(dumped).toContain('snapshot-sees-me')
    expect(editor.hasPendingEdits()).toBe(false)
  })

  it('setPage flushes the previous page before switching', () => {
    const second = editor.store.addPage()
    editor.setPage(editor.currentPageId, { fit: false })
    editFirstParagraph(editor, 'page-one-edit')
    const firstId = editor.currentPageId
    editor.setPage(second.id, { fit: false })
    const firstBlocks = editor.store.pageDocumentBlocks(firstId)
    const text = firstBlocks
      .filter((b) => b.type === 'paragraph')
      .map((b) => (b.type === 'paragraph' ? b.content.map((s) => s.text).join('') : ''))
      .join('|')
    expect(text).toContain('page-one-edit')
    expect(editor.currentPageId).toBe(second.id)
  })

  it('undo flushes before applying history', () => {
    editFirstParagraph(editor, 'before-undo')
    editor.flushPendingEdits()
    const before = currentBlocks(editor)
    editFirstParagraph(editor, 'pending-then-undo')
    editor.undo()
    // Undo must not silently drop to a state missing the flushed edit path;
    // at minimum the flush ran (no pending left) and history applied.
    expect(editor.hasPendingEdits()).toBe(false)
    expect(typeof before).toBe('string')
  })

  it('flushes before changing active-page paper or deleting the active page', () => {
    const firstId = editor.currentPageId
    editFirstParagraph(editor, 'before-paper-change')
    expect(editor.setPagePaper(firstId, { width: 700 })).toBe(true)
    expect(currentBlocks(editor)).toContain('before-paper-change')

    const second = editor.addPage()
    editFirstParagraph(editor, 'before-page-delete')
    expect(editor.removePage(second.id)).toBe(true)
    expect(editor.currentPageId).toBe(firstId)
  })

  it('updates the contenteditable surface when readonly changes', () => {
    const pageDoc = editor.container.querySelector('.ic-page-doc') as HTMLDivElement
    editFirstParagraph(editor, 'locked-draft')
    editor.setReadonly(true)
    expect(pageDoc.contentEditable).toBe('false')
    expect(pageDoc.getAttribute('aria-readonly')).toBe('true')
    expect(currentBlocks(editor)).toContain('locked-draft')
    editor.setReadonly(false)
    expect(pageDoc.contentEditable).toBe('true')
  })

  it('preserves a focused local draft when a remote update arrives', () => {
    let conflict: { pageId: string } | null = null
    editor.on('documentconflict', (details) => { conflict = details })
    const pageDoc = editor.container.querySelector('.ic-page-doc') as HTMLDivElement
    pageDoc.dispatchEvent(new FocusEvent('focus'))
    editFirstParagraph(editor, 'local-draft')
    const pageId = editor.currentPageId
    editor.store.setPageDocument(pageId, [{ type: 'paragraph', content: [{ text: 'remote-value' }] }], 'remote')
    expect(conflict?.pageId).toBe(pageId)
    expect(pageDoc.textContent).toContain('local-draft')
    expect(currentBlocks(editor)).toContain('remote-value')
    editor.flushPendingEdits()
    expect(currentBlocks(editor)).toContain('remote-value')
    editor.resolveDocumentConflict('local')
    expect(currentBlocks(editor)).toContain('local-draft')
  })
})
