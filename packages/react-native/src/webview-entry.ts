import type { CanvasInstance, DocumentVersion, VersionManager } from '@incantly/canvas'
import { createCanvas, createVersionManager, MemoryVersionStorage } from '@incantly/canvas'
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
let versionManager: VersionManager | null = null
let hideUi = false

const versionSummary = (v: DocumentVersion) => ({
  id: v.id,
  createdAt: v.createdAt,
  label: v.label,
  kind: v.kind,
})

const disposeVersionManager = (): void => {
  versionManager?.dispose()
  versionManager = null
}
let pendingLink: ((url: string | null) => void) | null = null
const pendingClipboard = new Map<string, (text: string) => void>()

const applySafeAreaInsets = (insets?: {
  top?: number
  right?: number
  bottom?: number
  left?: number
}): void => {
  if (!insets) return
  const root = document.documentElement
  if (typeof insets.top === 'number') root.style.setProperty('--ic-safe-top', `${insets.top}px`)
  if (typeof insets.right === 'number') root.style.setProperty('--ic-safe-right', `${insets.right}px`)
  if (typeof insets.bottom === 'number') root.style.setProperty('--ic-safe-bottom', `${insets.bottom}px`)
  if (typeof insets.left === 'number') root.style.setProperty('--ic-safe-left', `${insets.left}px`)
}

const bindKeyboardReporter = (): void => {
  const report = (): void => {
    const viewportH = window.visualViewport?.height ?? window.innerHeight
    const keyboardH = Math.max(0, window.innerHeight - viewportH)
    post({ type: 'keyboard', height: keyboardH })
  }
  window.visualViewport?.addEventListener('resize', report)
  window.visualViewport?.addEventListener('scroll', report)
  report()
}

const handlers: Record<string, (m: any) => any> = {
  init(m: any) {
    if (board) board.destroy()
    disposeVersionManager()
    hideUi = !!m.hideUi
    applySafeAreaInsets(m.safeAreaInsets)
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
      documentMode: !!m.documentMode,
      documentBackground: m.documentBackground ?? undefined,
      uiTools: m.uiTools,
      uiIcons: m.uiIcons,
      hidePagesBar: m.hidePagesBar,
      touchUi: m.touchUi !== false,
      promptLink: () =>
        new Promise((resolve) => {
          pendingLink = resolve
          post({ type: 'promptLink' })
        }),
      readClipboard: () =>
        new Promise((resolve, reject) => {
          const id = 'clip' + Date.now()
          pendingClipboard.set(id, resolve)
          post({ type: 'readClipboard', id })
          setTimeout(() => {
            if (pendingClipboard.delete(id)) reject(new Error('clipboard timeout'))
          }, 10000)
        }),
      onSave: async (blob: Blob, background: boolean) => {
        post({ type: 'save', dataUrl: await blobToDataUrl(blob), background })
      },
    })
    if (m.snapshot) {
      board.editor.store.loadSnapshot(m.snapshot, 'remote')
      board.editor.setPage(board.editor.pages()[0]?.id ?? board.editor.currentPageId, { fit: true })
    }
    versionManager = createVersionManager({
      storage: new MemoryVersionStorage(),
      store: board.editor.store,
    })
    board.editor.store.listen((diff: any, source: any) => post({ type: 'change', diff, source }))
    board.editor.on('selection', () => post({ type: 'selection', ids: [...board!.editor.selection] }))
    board.editor.on('page', () =>
      post({
        type: 'page',
        pageId: board!.editor.currentPageId,
        pages: board!.editor.pages().map((p) => ({ id: p.id, name: p.name, index: p.index })),
      }),
    )
    board.editor.on('pagelayout', () => post({ type: 'pagelayout', layout: board!.editor.pageLayout() }))
    board.editor.on('pagegap', () => post({ type: 'pagegap', gap: board!.editor.pageGap() }))
    board.editor.on('edit', () => post({ type: 'edit' }))
    board.editor.on('theme', () => {
      host.dataset.icTheme = board!.editor.theme.id
      post({ type: 'theme', theme: board!.editor.theme.id })
    })
    board.editor.on('grid', () => post({ type: 'grid', grid: board!.editor.grid }))
    bindKeyboardReporter()
    post({ type: 'mounted' })
  },
  promptLinkResult(m: any) {
    pendingLink?.(typeof m.url === 'string' ? m.url : null)
    pendingLink = null
  },
  clipboardResult(m: any) {
    const fn = pendingClipboard.get(m.id)
    if (!fn) return
    pendingClipboard.delete(m.id)
    fn(typeof m.text === 'string' ? m.text : '')
  },
  loadSnapshot(m: any) {
    board!.editor.store.loadSnapshot(m.snapshot, 'remote')
    if (m.fit !== false) board!.editor.fitPage({ animate: m.animate || 0 })
  },
  applyDiff(m: any) {
    board!.editor.store.applyDiff(m.diff, 'remote')
  },
  setTheme(m: any) {
    board!.editor.setTheme(m.theme)
    host.dataset.icTheme = board!.editor.theme.id
  },
  setReadonly(m: any) {
    board!.editor.setReadonly(!!m.readonly)
    board!.ui.setHidden(!!m.readonly || hideUi)
  },
  setGrid(m: any) {
    board!.editor.setGrid(m.grid)
  },
  setTool(m: any) {
    board!.editor.setTool(m.tool)
  },
  setStyle(m: any) {
    board!.editor.setStyle(m.key, m.value)
  },
  setDocumentBackground(m: any) {
    board!.editor.setDocumentBackground(m.color ?? null)
  },
  focusPageDocument() {
    board!.editor.focusPageDocument()
  },
  refreshPageDocument() {
    board!.editor.refreshPageDocument()
  },
  undo() {
    board!.editor.undo()
  },
  redo() {
    board!.editor.redo()
  },
  clear() {
    board!.editor.clearBoard()
  },
  fitContent(m: any) {
    board!.editor.fitPage({ animate: m.animate || 0 })
  },
  setPage(m: any) {
    board!.editor.setPage(m.pageId, { fit: m.fit !== false, animate: m.animate || 0 })
  },
  addPage(m: any) {
    const page = board!.editor.addPage(m.opts || {})
    post({
      type: 'page',
      pageId: board!.editor.currentPageId,
      pages: board!.editor.pages().map((p) => ({ id: p.id, name: p.name, index: p.index })),
    })
    return page
  },
  removePage(m: any) {
    const id = m.pageId || board!.editor.currentPageId
    if (!board!.editor.removePage(id)) {
      throw new Error('Cannot remove page')
    }
    post({
      type: 'page',
      pageId: board!.editor.currentPageId,
      pages: board!.editor.pages().map((p) => ({ id: p.id, name: p.name, index: p.index })),
    })
  },
  setPageLayout(m: any) {
    const layout = m.layout
    if (layout !== 'vertical' && layout !== 'horizontal') {
      throw new Error('Invalid page layout: ' + layout)
    }
    board!.editor.setPageLayout(layout)
    post({ type: 'pagelayout', layout: board!.editor.pageLayout() })
  },
  setPageGap(m: any) {
    if (typeof m.gap === 'number') board!.editor.setPageGap(m.gap)
    else if (m.preset) board!.editor.setPageGapPreset(m.preset)
    else if (typeof m.delta === 'number') board!.editor.adjustPageGap(m.delta)
    else throw new Error('setPageGap requires gap, preset, or delta')
    post({ type: 'pagegap', gap: board!.editor.pageGap() })
  },
  getSnapshot(m: any) {
    post({ type: 'snapshot', id: m.id, snapshot: board!.editor.store.getSnapshot() })
  },
  async exportPng(m: any) {
    const blob = await board!.editor.exportImage(m.opts || {})
    post({ type: 'export', id: m.id, dataUrl: blob ? await blobToDataUrl(blob) : null })
  },
  async listVersions(m: any) {
    const versions = await versionManager!.list()
    post({
      type: 'versions',
      id: m.id,
      versions: versions.map(versionSummary),
    })
  },
  async revertVersion(m: any) {
    await versionManager!.revert(m.versionId)
    post({ type: 'reverted', id: m.id, versionId: m.versionId })
  },
  async saveVersion(m: any) {
    const saved = await versionManager!.checkpoint('manual', m.label)
    post({
      type: 'versionSaved',
      id: m.id,
      versionId: saved.id,
      createdAt: saved.createdAt,
      label: saved.label,
      kind: saved.kind,
    })
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
