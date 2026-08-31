import type { CanvasInstance } from '@incantly/canvas'
import { createCanvas } from '@incantly/canvas'
import '@incantly/canvas/canvas.css'

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage(data: string): void }
    __icDispatch?: (m: any) => Promise<void>
    /** @deprecated Use {@link __icDispatch} */
    __qdDispatch?: (m: any) => Promise<void>
  }
}

const post = (msg: object): void => {
  try {
    window.ReactNativeWebView?.postMessage(JSON.stringify(msg))
  } catch (e: any) {
    console.warn('incantly canvas post failed', e)
  }
}

const blobToDataUrl = (blob: Blob): Promise<string | null> =>
  new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result as string | null)
    fr.onerror = reject
    fr.readAsDataURL(blob)
  })

const host = document.getElementById('board') as HTMLElement
let board: CanvasInstance | null = null
let hideUi = false

const handlers: Record<string, (m: any) => any> = {
  init(m: any) {
    if (board) board.destroy()
    hideUi = !!m.hideUi
    board = createCanvas({
      container: host,
      theme: m.theme || 'light',
      grid: m.grid || 'none',
      readonly: !!m.readonly,
      hideUi,
      themeToggle: m.themeToggle !== false,
      gridControl: m.gridControl !== false,
      watermark: m.watermark !== false,
      styles: m.styles || undefined,
      onSave: async (blob: Blob, background: boolean) => {
        post({ type: 'save', dataUrl: await blobToDataUrl(blob), background })
      },
    })
    if (m.snapshot) {
      board.editor.store.loadSnapshot(m.snapshot, 'remote')
      board.editor.fitContent()
    }
    board.editor.store.listen((diff: any, source: any) => post({ type: 'change', diff, source }))
    board.editor.on('selection', () => post({ type: 'selection', ids: [...board!.editor.selection] }))
    board.editor.on('theme', () => {
      host.dataset.icTheme = board!.editor.theme.id
      post({ type: 'theme', theme: board!.editor.theme.id })
    })
    board.editor.on('grid', () => post({ type: 'grid', grid: board!.editor.grid }))
    post({ type: 'mounted' })
  },
  loadSnapshot(m: any) {
    board!.editor.store.loadSnapshot(m.snapshot, 'remote')
    if (m.fit !== false) board!.editor.fitContent()
  },
  applyDiff(m: any) { board!.editor.store.applyDiff(m.diff, 'remote') },
  setTheme(m: any) {
    board!.editor.setTheme(m.theme)
    host.dataset.icTheme = board!.editor.theme.id
  },
  setReadonly(m: any) {
    board!.editor.setReadonly(!!m.readonly)
    board!.ui.setHidden(!!m.readonly || hideUi)
  },
  setGrid(m: any) { board!.editor.setGrid(m.grid) },
  setTool(m: any) { board!.editor.setTool(m.tool) },
  setStyle(m: any) { board!.editor.setStyle(m.key, m.value) },
  undo() { board!.editor.store.undo() },
  redo() { board!.editor.store.redo() },
  clear() { board!.editor.clearBoard() },
  fitContent(m: any) { board!.editor.fitContent({ animate: m.animate || 0 }) },
  getSnapshot(m: any) { post({ type: 'snapshot', id: m.id, snapshot: board!.editor.store.getSnapshot() }) },
  async exportPng(m: any) {
    const blob = await board!.editor.exportImage(m.opts || {})
    post({ type: 'export', id: m.id, dataUrl: blob ? await blobToDataUrl(blob) : null })
  },
}

const dispatch = async (m: any): Promise<void> => {
  try {
    if (!m || !handlers[m.type]) return
    if (!board && m.type !== 'init') return
    await handlers[m.type](m)
  } catch (e: any) {
    post({ type: 'error', message: String((e && e.message) || e) })
  }
}

window.__icDispatch = dispatch
window.__qdDispatch = dispatch

post({ type: 'ready' })
