import type { BlockType } from './rich-text/types.js'
import type { Store } from './store.js'
import type { PageRecord } from './types/models.js'
import type { Camera } from './types/base.js'
import type { Theme } from './types/themes.js'
import {
  applyMarkdownToBlock,
  applyLineMarkdown,
} from './rich-text/index.js'
import { PAGE_DOC_FONT_SIZE, notesPageContentRect, appendPlainTextToDocument } from './page-document.js'
import { notesPaperHeight } from './notebook-document.js'
import {
  documentBlocksToDomHtml,
  documentBlockToDomHtml,
  parseDocumentBlocksFromDom,
  parseSingleBlockFromDom,
  layoutPageDocument,
  textBlocksFromDocument,
} from './page-document-blocks.js'
import { drawPageDocumentBlocks } from './page-document-blocks.js'
import type { DocumentBlock, ImageBlock } from './rich-text/types.js'
import { isDrawingBlock, isImageBlock, isTextBlock } from './rich-text/types.js'
import {
  type DocumentUiOptions,
  type SelectionToolbarHandle,
  DEFAULT_SLASH_COMMANDS,
  createDefaultSelectionToolbar,
  createDocumentEditorApi,
  defaultSlashMenuPosition,
} from './document-ui-config.js'

export type { SlashCommand } from './document-ui-config.js'
export { DEFAULT_SLASH_COMMANDS as SLASH_COMMANDS } from './document-ui-config.js'

export interface PageDocumentHost {
  readonly readonly: boolean
  currentPageId: string
  camera: Camera
  container: HTMLElement
  store: Store
  theme: Theme
  documentMode: boolean
  touchUi?: boolean
  documentUi?: DocumentUiOptions
  promptLink?: () => Promise<string | null>
  readClipboard?: () => Promise<string>
  currentPage(): PageRecord | null
  pageToScreen(x: number, y: number): { x: number; y: number }
  requestRender(): void
  emitEdit(): void
  undo(): void
  redo(): void
  copySelection?(): Promise<void>
  pasteFromClipboard?(): Promise<void>
}

function resolveTouchUi(hostTouchUi: boolean | undefined): boolean {
  if (hostTouchUi === true) return true
  if (hostTouchUi === false) return false
  return typeof window !== 'undefined' && 'ontouchstart' in window
}

export class PageDocumentUI {
  private host: PageDocumentHost
  wrap: HTMLDivElement
  el: HTMLDivElement
  slashMenu: HTMLDivElement
  formatBar: HTMLDivElement | null
  private overlayMount: HTMLElement
  private selectionToolbar: SelectionToolbarHandle | null = null
  private slashCommands = DEFAULT_SLASH_COMMANDS
  private customSlashRenderer: DocumentUiOptions['renderSlashMenu']
  focused = false
  private touchUi = false
  private slashFilter = ''
  private slashIndex = 0
  private slashBlock: HTMLElement | null = null
  private _renderedBlocks: DocumentBlock[] = []
  private _syncRaf: number | null = null

  private onSelectionChange = (): void => {
    this.guardSelectionInDrawing()
    this.updateSelectionToolbar()
  }

  constructor(host: PageDocumentHost) {
    this.host = host
    const docUi = host.documentUi
    if (docUi?.slashCommands?.length) this.slashCommands = docUi.slashCommands
    this.customSlashRenderer = docUi?.renderSlashMenu
    this.overlayMount = host.container.ownerDocument?.body ?? document.body
    this.wrap = document.createElement('div')
    this.wrap.className = 'ic-page-doc-wrap'
    this.el = document.createElement('div')
    this.el.className = 'ic-page-doc'
    this.el.contentEditable = 'true'
    this.el.spellcheck = true
    this.el.dataset.placeholder = 'Type on the page…'
    this.wrap.appendChild(this.el)
    this.slashMenu = document.createElement('div')
    this.slashMenu.className = 'ic-slash-menu'
    this.slashMenu.hidden = true
    this.touchUi = resolveTouchUi(host.touchUi)
    this.formatBar = null
    if (this.touchUi) {
      const bar = document.createElement('div')
      bar.className = 'ic-mobile-format-bar'
      bar.hidden = true
      bar.innerHTML =
        `<button type="button" data-fmt="bold" aria-label="Bold">B</button>` +
        `<button type="button" data-fmt="italic" aria-label="Italic">I</button>` +
        `<button type="button" data-fmt="underline" aria-label="Underline">U</button>` +
        `<button type="button" data-fmt="link" aria-label="Link">Link</button>` +
        `<button type="button" data-fmt="undo" aria-label="Undo">Undo</button>` +
        `<button type="button" data-fmt="redo" aria-label="Redo">Redo</button>`
      this.formatBar = bar
      host.container.appendChild(bar)
    }
    host.container.appendChild(this.wrap)
    this.overlayMount.appendChild(this.slashMenu)

    const editorApi = createDocumentEditorApi({
      promptLink: host.promptLink,
      sync: () => this.syncToStore(),
      undo: () => host.undo(),
      redo: () => host.redo(),
    })
    if (docUi?.selectionToolbar !== false) {
      const opts = docUi?.selectionToolbar ?? {}
      this.selectionToolbar = opts.create
        ? opts.create(editorApi)
        : createDefaultSelectionToolbar(opts, editorApi, this.overlayMount)
    }

    this.bind()
    this.syncFromStore()
  }

  private blocks() {
    return this.host.store.notebookDocumentBlocks()
  }

  private paperHeight(): number {
    const page = this.host.currentPage()
    if (!page) return 1056
    return notesPaperHeight(page, this.blocks(), this.host.theme)
  }

  private bind(): void {
    this.el.addEventListener('input', () => {
      this.checkSlashTrigger()
      this.scheduleSyncToStore()
    })
    this.el.addEventListener('keydown', (e) => this.onKeyDown(e))
    this.el.addEventListener('focus', () => {
      this.focused = true
      this.wrap.classList.add('ic-page-doc-focused')
      this.updateFormatBarVisibility()
      this.host.emitEdit()
    })
    this.el.addEventListener('blur', () => {
      this.hideSlashMenu()
      this.focused = false
      this.wrap.classList.remove('ic-page-doc-focused')
      this.selectionToolbar?.hide()
      this.formatBar && (this.formatBar.hidden = true)
      this.flushSyncToStore()
      this.host.emitEdit()
    })
    this.el.addEventListener('pointerdown', (e) => this.onPointerDown(e))
    this.el.addEventListener('mousedown', (e) => this.onPointerDown(e))
    this.el.addEventListener('paste', (e) => void this.onPaste(e))
    this.el.addEventListener('keyup', () => {
      this.checkSlashTrigger()
      this.updateSelectionToolbar()
    })
    this.el.addEventListener('mouseup', () => this.updateSelectionToolbar())
    if (this.formatBar) {
      this.formatBar.addEventListener('mousedown', (e) => e.preventDefault())
      this.formatBar.addEventListener('click', (e) => void this.onFormatBarClick(e))
    }
    this.slashMenu.addEventListener('mousedown', (e) => {
      e.preventDefault()
      const btn = (e.target as HTMLElement).closest('[data-slash-id]') as HTMLElement | null
      if (btn?.dataset.slashId) this.applySlashCommand(btn.dataset.slashId as BlockType | 'divider')
    })
    document.addEventListener('selectionchange', this.onSelectionChange)
    if (typeof window !== 'undefined' && window.visualViewport) {
      window.visualViewport.addEventListener('resize', this._onViewportResize)
      window.visualViewport.addEventListener('scroll', this._onViewportResize)
    }
  }

  private _onViewportResize = (): void => {
    this.layoutFormatBar()
    if (!this.slashMenu.hidden) this.positionSlashMenu()
  }

  private onPointerDown(e: Event): void {
    const slot = (e.target as HTMLElement).closest('.ic-drawing-slot')
    if (!slot) return
    e.preventDefault()
    e.stopPropagation()
    const drawIdx = Number((slot as HTMLElement).dataset.docIndex)
    this.redirectTypingFromDrawing(drawIdx)
  }

  private guardSelectionInDrawing(): void {
    if (!this.focused || this.host.readonly) return
    const sel = window.getSelection()
    if (!sel?.anchorNode) return
    let node: Node | null = sel.anchorNode
    while (node && node !== this.el) {
      if (node instanceof HTMLElement && node.classList.contains('ic-drawing-slot')) {
        const drawIdx = Number(node.dataset.docIndex)
        this.redirectTypingFromDrawing(drawIdx)
        return
      }
      node = node.parentNode
    }
  }

  setDocumentMode(on: boolean): void {
    if (on) this.wrap.classList.add('ic-page-doc-mode')
    else this.wrap.classList.remove('ic-page-doc-mode')
  }

  setInkPassThrough(on: boolean): void {
    this.wrap.classList.toggle('ic-page-doc-ink-pass', on)
  }

  destroy(): void {
    if (this._syncRaf !== null) cancelAnimationFrame(this._syncRaf)
    document.removeEventListener('selectionchange', this.onSelectionChange)
    if (typeof window !== 'undefined' && window.visualViewport) {
      window.visualViewport.removeEventListener('resize', this._onViewportResize)
      window.visualViewport.removeEventListener('scroll', this._onViewportResize)
    }
    this.wrap.remove()
    this.slashMenu.remove()
    this.selectionToolbar?.destroy()
    this.selectionToolbar = null
    this.formatBar?.remove()
  }

  /** Re-sync DOM from store after tab/panel return. */
  refresh(): void {
    this._renderedBlocks = []
    this.syncFromStore()
  }

  private async onPaste(e: ClipboardEvent): Promise<void> {
    if (!this.host.documentMode || this.host.readonly) return
    const items = e.clipboardData?.items
    if (items) {
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const file = item.getAsFile()
          if (!file) return
          const src = await this._fileToDataUrl(file)
          if (src) void this.insertImageBlock(src)
          return
        }
      }
    }
    const text = e.clipboardData?.getData('text/plain') ?? ''
    if (!text) return
    try {
      const data = JSON.parse(text)
      if (data && (data.incantly || data.quickdraw) && Array.isArray(data.shapes)) {
        e.preventDefault()
        return
      }
    } catch {
      /* plain text — let contentEditable handle it */
    }
  }

  private _fileToDataUrl(file: Blob): Promise<string | null> {
    return new Promise((resolve) => {
      const fr = new FileReader()
      fr.onload = () => resolve(typeof fr.result === 'string' ? fr.result : null)
      fr.onerror = () => resolve(null)
      fr.readAsDataURL(file)
    })
  }

  async insertImageBlock(src: string, width?: number, height?: number): Promise<void> {
    if (!src || this.host.readonly) return
    if (!width || !height) {
      const dims = await this._imageDimensions(src)
      width = dims.width
      height = dims.height
    }
    const caretIdx = this._caretBlockIndex()
    const blocks = this.blocks().slice()
    const insertAt = caretIdx !== null ? caretIdx + 1 : blocks.length
    const imageBlock: ImageBlock = { type: 'image', src, width, height }
    blocks.splice(insertAt, 0, imageBlock)
    this.host.store.setNotebookDocument(blocks)
    this.syncFromStore()
    this.host.requestRender()
  }

  private _imageDimensions(src: string): Promise<{ width?: number; height?: number }> {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = () => resolve({})
      img.src = src
    })
  }

  pasteText(text: string): void {
    if (!text || this.host.readonly) return
    this.el.focus({ preventScroll: true })
    if (!this.focused) this.focusAtEnd()
    let usedNative = false
    if (typeof document.execCommand === 'function') {
      usedNative = document.execCommand('insertText', false, text)
    }
    if (usedNative) {
      this.syncToStore()
      return
    }
    const blocks = appendPlainTextToDocument(this.blocks(), text)
    this.host.store.setNotebookDocument(blocks)
    this._renderBlocksRange(this.blocks(), blocks.length - text.split('\n').length, blocks.length)
    this.focusAtEnd()
  }

  private _renderBlocksRange(blocks: DocumentBlock[], from: number, to: number): void {
    const html = documentBlocksToDomHtml(blocks.slice(from, to))
    const frag = document.createRange().createContextualFragment(html)
    this.el.appendChild(frag)
    this._renderedBlocks = blocks
  }

  syncFromStore(): void {
    const page = this.host.currentPage()
    if (!page) return
    const blocks = this.blocks()
    if (blocks.length === 0) {
      const fallback: DocumentBlock[] = [{ type: 'paragraph', content: [{ text: '' }] }]
      this.el.innerHTML = documentBlocksToDomHtml(fallback)
      this._renderedBlocks = fallback
      this.layout()
      return
    }
    const prev = this._renderedBlocks
    if (prev === blocks || (prev.length === blocks.length && prev.every((b, i) => b === blocks[i]))) {
      this.layout()
      return
    }
    const maxLen = Math.max(prev.length, blocks.length)
    const children = Array.from(this.el.children) as HTMLElement[]
    for (let i = 0; i < maxLen; i++) {
      const oldBlock = i < prev.length ? prev[i] : undefined
      const newBlock = i < blocks.length ? blocks[i] : undefined
      if (!newBlock) {
        if (children[i] && this.el.contains(children[i])) children[i].remove()
        continue
      }
      if (oldBlock === newBlock && children[i]) continue
      const html = documentBlockToDomHtml(newBlock, i)
      const frag = document.createRange().createContextualFragment(html)
      const newEl = frag.firstElementChild as HTMLElement
      if (children[i] && this.el.contains(children[i])) {
        this.el.replaceChild(newEl, children[i])
      } else {
        this.el.appendChild(newEl)
      }
    }
    while (this.el.children.length > blocks.length) {
      this.el.lastElementChild?.remove()
    }
    if (!this.el.querySelector('[data-block]')) {
      const fallback: DocumentBlock[] = [{ type: 'paragraph', content: [{ text: '' }] }]
      this.el.innerHTML = documentBlocksToDomHtml(fallback)
      this._renderedBlocks = fallback
      this.layout()
      return
    }
    this._renderedBlocks = blocks
    this.layout()
  }

  private scheduleSyncToStore(): void {
    if (!this.slashMenu.hidden) return
    if (this._syncRaf !== null) return
    this._syncRaf = requestAnimationFrame(() => {
      this._syncRaf = null
      this.syncToStore()
    })
  }

  private flushSyncToStore(): void {
    if (this._syncRaf !== null) {
      cancelAnimationFrame(this._syncRaf)
      this._syncRaf = null
    }
    this.syncToStore()
  }

  private _caretBlockIndex(): number | null {
    const sel = window.getSelection()
    if (!sel?.anchorNode) return null
    let node: Node | null = sel.anchorNode
    while (node && node !== this.el) {
      if (node instanceof HTMLElement && node.dataset.docIndex !== undefined) {
        return Number(node.dataset.docIndex)
      }
      node = node.parentNode
    }
    return null
  }

  syncToStore(): void {
    const existing = this.blocks()
    const caretIdx = this._caretBlockIndex()
    if (caretIdx !== null && caretIdx < this.el.children.length) {
      const child = this.el.children[caretIdx]
      if (child instanceof HTMLElement) {
        const parsed = parseSingleBlockFromDom(child, existing)
        if (parsed && !isDrawingBlock(parsed) && !isImageBlock(parsed)) {
          const patched = existing.slice()
          patched[caretIdx] = applyMarkdownToBlock(parsed)
          this.host.store.setNotebookDocument(patched)
          this._renderedBlocks = this.blocks()
          this.layout()
          this.host.requestRender()
          return
        }
      }
    }
    const blocks = parseDocumentBlocksFromDom(this.el, existing).map((b) =>
      isDrawingBlock(b) || isImageBlock(b) ? b : applyMarkdownToBlock(b),
    )
    this.host.store.setNotebookDocument(blocks)
    this._renderedBlocks = this.blocks()
    this.layout()
    this.host.requestRender()
  }

  layout(): void {
    const page = this.host.currentPage()
    if (!page || this.host.readonly) {
      this.wrap.hidden = true
      return
    }
    this.wrap.hidden = false
    const z = this.host.camera.z
    const paperH = this.paperHeight()
    const rect = notesPageContentRect(page, paperH)
    const tl = this.host.pageToScreen(page.x + rect.x, page.y + rect.y)
    this.wrap.style.left = `${tl.x}px`
    this.wrap.style.top = `${tl.y}px`
    this.wrap.style.width = `${rect.w * z}px`
    this.wrap.style.minHeight = `${rect.h * z}px`
    this.el.style.minHeight = `${rect.h * z}px`
    this.el.style.fontSize = `${PAGE_DOC_FONT_SIZE * z}px`
    this.el.style.lineHeight = `${PAGE_DOC_FONT_SIZE * 1.45 * z}px`
    const layout = layoutPageDocument(this.blocks(), rect.w, this.host.theme)
    for (const child of Array.from(this.el.children)) {
      if (!(child instanceof HTMLElement) || !child.classList.contains('ic-drawing-slot')) continue
      const idx = Number(child.dataset.docIndex)
      const entry = layout.entries.find((e) => e.index === idx)
      if (entry && isDrawingBlock(entry.block)) {
        child.style.height = `${entry.h * z}px`
        child.style.marginTop = '0'
        child.style.marginBottom = `${4 * z}px`
      }
    }
  }

  focusAtEnd(): void {
    for (let i = this.blocks().length - 1; i >= 0; i--) {
      if (!isDrawingBlock(this.blocks()[i]!) && !isImageBlock(this.blocks()[i]!)) {
        this.focusTextBlock(i, true)
        return
      }
    }
    this.focusTextBlock(0, true)
  }

  focus(): void {
    this.syncFromStore()
    this.focusAtEnd()
  }

  focusAtPagePoint(lx: number, ly: number): void {
    const page = this.host.currentPage()
    if (!page) return
    this.syncFromStore()
    const rect = notesPageContentRect(page, this.paperHeight())
    const layout = layoutPageDocument(this.blocks(), rect.w, this.host.theme)
    const cy = ly - rect.y
    const cx = lx - rect.x
    for (const entry of layout.entries) {
      if (!isTextBlock(entry.block)) continue
      if (cy >= entry.y && cy < entry.y + entry.h && cx >= 0 && cx <= entry.w) {
        this.focusTextBlock(entry.index, false)
        return
      }
    }
    this.focusAtEnd()
  }

  private _lastTextSelection = false

  hasTextSelection(): boolean {
    const sel = window.getSelection()
    if (!sel?.rangeCount || sel.isCollapsed) return false
    const range = sel.getRangeAt(0)
    return this.el.contains(range.commonAncestorContainer) && !!sel.toString()
  }

  async copySelectedText(): Promise<boolean> {
    if (!this.hasTextSelection()) return false
    const text = window.getSelection()?.toString() ?? ''
    if (!text) return false
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      return false
    }
  }

  deleteSelectedText(): boolean {
    if (!this.hasTextSelection()) return false
    this.el.focus({ preventScroll: true })
    document.execCommand('delete')
    this.syncToStore()
    return true
  }

  blur(): void {
    this.el.blur()
    if (!this.focused) return
    this.focused = false
    this.wrap.classList.remove('ic-page-doc-focused')
    this.hideSlashMenu()
    this.selectionToolbar?.hide()
    if (this.formatBar) this.formatBar.hidden = true
  }

  private lastTextBlockIndex(before = this.blocks().length): number {
    const blocks = this.blocks()
    for (let i = Math.min(before, blocks.length) - 1; i >= 0; i--) {
      if (isTextBlock(blocks[i]!)) return i
    }
    return 0
  }

  redirectTypingFromDrawing(_drawingIndex: number): void {
    const textIdx = this.lastTextBlockIndex()
    this.focusTextBlock(textIdx, true)
  }

  private focusTextBlock(docIndex: number, atEnd: boolean): void {
    const block = this.el.querySelector(
      `[data-doc-index="${docIndex}"][data-block]`,
    ) as HTMLElement | null
    this.el.focus({ preventScroll: true })
    const sel = window.getSelection()
    const range = document.createRange()
    if (block) {
      if (atEnd) {
        range.selectNodeContents(block)
        range.collapse(false)
      } else {
        range.setStart(block, 0)
        range.collapse(true)
      }
    } else {
      range.selectNodeContents(this.el)
      range.collapse(false)
    }
    sel?.removeAllRanges()
    sel?.addRange(range)
  }

  private onKeyDown(e: KeyboardEvent): void {
    e.stopPropagation()
    const meta = e.metaKey || e.ctrlKey
    if (meta && e.key === 'b') {
      e.preventDefault()
      document.execCommand('bold')
      this.syncToStore()
    } else if (meta && e.key === 'i') {
      e.preventDefault()
      document.execCommand('italic')
      this.syncToStore()
    } else if (meta && e.key === 'u') {
      e.preventDefault()
      document.execCommand('underline')
      this.syncToStore()
    } else if (meta && e.key === 'k') {
      e.preventDefault()
      void this.applyLink()
    } else if (meta && e.key === 'z') {
      e.preventDefault()
      if (e.shiftKey) this.host.redo()
      else this.host.undo()
    } else if (meta && e.key === 'c') {
      e.preventDefault()
      void this.host.copySelection?.()
    } else if (this.slashMenu.hidden === false) {
      const cmds = this.visibleSlashCommands()
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (!cmds.length) return
        this.slashIndex = (this.slashIndex + 1) % cmds.length
        this.renderSlashMenu()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        const n = cmds.length
        if (!n) return
        this.slashIndex = (this.slashIndex - 1 + n) % n
        this.renderSlashMenu()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (cmds[this.slashIndex]) this.applySlashCommand(cmds[this.slashIndex].id)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        this.hideSlashMenu()
      }
    } else if (e.key === ' ') {
      this.applyLineMarkdownToBlock()
      this.syncToStore()
    } else if (e.key.length === 1 && !meta && !e.ctrlKey && !e.altKey) {
      this.guardSelectionInDrawing()
    }
  }

  private applyLineMarkdownToBlock(): void {
    const sel = window.getSelection()
    if (!sel?.focusNode) return
    let node: Node | null = sel.focusNode
    while (node && node !== this.el) {
      if (node instanceof HTMLElement && node.dataset.block) {
        const text = (node.textContent ?? '').trim()
        const md = applyLineMarkdown(text)
        if (md) {
          node.setAttribute('data-block', md.type)
          node.className = `ic-rt-block ic-rt-${md.type}`
          node.textContent = md.text
        }
        break
      }
      node = node.parentNode
    }
  }

  private checkSlashTrigger(): void {
    const sel = window.getSelection()
    if (!sel?.focusNode || !sel.isCollapsed) {
      this.hideSlashMenu()
      return
    }
    let node: Node | null = sel.focusNode
    let block: HTMLElement | null = null
    while (node && node !== this.el) {
      if (node instanceof HTMLElement && node.dataset.block) {
        block = node
        break
      }
      node = node.parentNode
    }
    if (!block) {
      this.hideSlashMenu()
      return
    }
    const text = block.textContent ?? ''
    const m = text.match(/(?:^|\s)\/(\w*)$/)
    if (!m) {
      this.hideSlashMenu()
      return
    }
    this.slashBlock = block
    this.slashFilter = (m[1] ?? '').toLowerCase()
    this.slashIndex = 0
    this.showSlashMenu()
  }

  private visibleSlashCommands() {
    if (!this.slashFilter) return this.slashCommands
    return this.slashCommands.filter((c) =>
      c.label.toLowerCase().includes(this.slashFilter) ||
      c.id.toLowerCase().includes(this.slashFilter),
    )
  }

  private showSlashMenu(): void {
    this.selectionToolbar?.hide()
    const cmds = this.visibleSlashCommands()
    if (!cmds.length) {
      this.slashMenu.hidden = true
      return
    }
    this.renderSlashMenu()
    this.slashMenu.hidden = false
    this.positionSlashMenu()
  }

  private positionSlashMenu(): void {
    const sel = window.getSelection()
    if (!sel?.rangeCount) return
    const range = sel.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    defaultSlashMenuPosition(rect, this.slashMenu)
  }

  private updateSelectionToolbar(): void {
    if (
      !this.selectionToolbar ||
      !this.focused ||
      this.host.readonly ||
      !this.slashMenu.hidden
    ) {
      this.selectionToolbar?.hide()
      this.notifyTextSelectionChange()
      return
    }
    const sel = window.getSelection()
    if (!sel?.rangeCount || sel.isCollapsed) {
      this.selectionToolbar.hide()
      this.notifyTextSelectionChange()
      return
    }
    const range = sel.getRangeAt(0)
    if (!this.el.contains(range.commonAncestorContainer)) {
      this.selectionToolbar.hide()
      this.notifyTextSelectionChange()
      return
    }
    const rect = range.getBoundingClientRect()
    this.selectionToolbar.show(rect)
    this.notifyTextSelectionChange()
  }

  private notifyTextSelectionChange(): void {
    const hasSel = this.hasTextSelection()
    if (hasSel !== this._lastTextSelection) {
      this._lastTextSelection = hasSel
      this.host.emitEdit()
    }
  }

  private updateFormatBarVisibility(): void {
    if (!this.formatBar || !this.touchUi || this.host.readonly) return
    this.formatBar.hidden = false
    this.layoutFormatBar()
  }

  private layoutFormatBar(): void {
    const bar = this.formatBar
    if (!bar || bar.hidden) return
    const cr = this.host.container.getBoundingClientRect()
    const viewportH = window.visualViewport?.height ?? window.innerHeight
    const bottomInset = Math.max(0, window.innerHeight - viewportH)
    bar.style.left = `${cr.left}px`
    bar.style.width = `${cr.width}px`
    bar.style.bottom = `${bottomInset}px`
    bar.style.top = 'auto'
  }

  private async onFormatBarClick(e: Event): Promise<void> {
    const btn = (e.target as HTMLElement).closest('[data-fmt]') as HTMLElement | null
    if (!btn?.dataset.fmt) return
    this.el.focus({ preventScroll: true })
    switch (btn.dataset.fmt) {
      case 'bold':
        document.execCommand('bold')
        this.syncToStore()
        break
      case 'italic':
        document.execCommand('italic')
        this.syncToStore()
        break
      case 'underline':
        document.execCommand('underline')
        this.syncToStore()
        break
      case 'link':
        await this.applyLink()
        break
      case 'undo':
        this.host.undo()
        break
      case 'redo':
        this.host.redo()
        break
    }
  }

  private async applyLink(): Promise<void> {
    let url: string | null = null
    if (this.host.promptLink) {
      url = await this.host.promptLink()
    } else if (typeof window.prompt === 'function') {
      url = window.prompt('Link URL', 'https://')
    }
    if (url) {
      document.execCommand('createLink', false, url)
      this.syncToStore()
    }
  }

  private renderSlashMenu(): void {
    const cmds = this.visibleSlashCommands()
    if (this.customSlashRenderer) {
      const custom = this.customSlashRenderer({
        commands: cmds,
        activeIndex: this.slashIndex,
        filter: this.slashFilter,
        select: (id) => this.applySlashCommand(id),
      })
      if (custom) {
        this.slashMenu.replaceChildren(custom)
        return
      }
    }
    this.slashMenu.innerHTML =
      `<div class="ic-slash-menu-title">Turn into</div>` +
      cmds
        .map(
          (c, i) =>
            `<button type="button" class="ic-slash-item${i === this.slashIndex ? ' ic-slash-item-active' : ''}" data-slash-id="${c.id}">${c.label}${c.hint ? `<span class="ic-slash-hint">${c.hint}</span>` : ''}</button>`,
        )
        .join('')
  }

  private hideSlashMenu(): void {
    const wasOpen = !this.slashMenu.hidden
    this.slashMenu.hidden = true
    this.slashBlock = null
    this.slashFilter = ''
    if (wasOpen) this.flushSyncToStore()
  }

  private applySlashCommand(id: BlockType | 'divider'): void {
    const block = this.slashBlock
    this.hideSlashMenu()
    if (!block) return
    const text = (block.textContent ?? '').replace(/(^|\s)\/\w*$/, '$1').trimEnd()
    if (id === 'divider') {
      block.setAttribute('data-block', 'divider')
      block.className = 'ic-rt-block ic-rt-divider'
      block.innerHTML = '<hr>'
      const next = document.createElement('div')
      next.className = 'ic-rt-block ic-rt-paragraph'
      next.dataset.block = 'paragraph'
      next.innerHTML = '<br>'
      block.after(next)
      this.placeCaretIn(next)
    } else {
      block.setAttribute('data-block', id)
      block.className = `ic-rt-block ic-rt-${id}`
      block.textContent = text
      this.placeCaretIn(block)
    }
    this.syncToStore()
  }

  private placeCaretIn(el: HTMLElement): void {
    el.focus()
    const sel = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    sel?.removeAllRanges()
    sel?.addRange(range)
  }
}

export function drawPageDocument(
  ctx: CanvasRenderingContext2D,
  page: PageRecord,
  blocks: import('./rich-text/types.js').DocumentBlock[],
  theme: Theme,
  paperHeight?: number,
): void {
  drawPageDocumentBlocks(ctx, page, blocks, theme, {
    paperHeight,
  })
}
