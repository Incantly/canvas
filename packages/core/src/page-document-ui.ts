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
import type { DocumentBlock } from './rich-text/types.js'
import { isDrawingBlock, isTextBlock } from './rich-text/types.js'

export interface PageDocumentHost {
  readonly readonly: boolean
  currentPageId: string
  camera: Camera
  container: HTMLElement
  store: Store
  theme: Theme
  documentMode: boolean
  currentPage(): PageRecord | null
  pageToScreen(x: number, y: number): { x: number; y: number }
  requestRender(): void
  emitEdit(): void
}

export interface SlashCommand {
  id: BlockType | 'divider'
  label: string
  hint?: string
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { id: 'paragraph', label: 'Text', hint: 'Plain paragraph' },
  { id: 'heading1', label: 'Heading 1' },
  { id: 'heading2', label: 'Heading 2' },
  { id: 'heading3', label: 'Heading 3' },
  { id: 'bulletList', label: 'Bullet list' },
  { id: 'numberedList', label: 'Numbered list' },
  { id: 'quote', label: 'Quote' },
  { id: 'codeBlock', label: 'Code block' },
  { id: 'divider', label: 'Divider' },
]

export class PageDocumentUI {
  private host: PageDocumentHost
  wrap: HTMLDivElement
  el: HTMLDivElement
  slashMenu: HTMLDivElement
  focused = false
  private slashFilter = ''
  private slashIndex = 0
  private slashBlock: HTMLElement | null = null
  private hintBlockIndex: number | null = null
  private _renderedBlocks: DocumentBlock[] = []
  private _syncRaf: number | null = null

  private onSelectionChange = (): void => this.guardSelectionInDrawing()

  constructor(host: PageDocumentHost) {
    this.host = host
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
    host.container.appendChild(this.wrap)
    host.container.appendChild(this.slashMenu)
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
      this.clearDocHints()
      this.checkSlashTrigger()
      this.scheduleSyncToStore()
    })
    this.el.addEventListener('keydown', (e) => this.onKeyDown(e))
    this.el.addEventListener('focus', () => {
      this.focused = true
      this.wrap.classList.add('ic-page-doc-focused')
      this.host.emitEdit()
    })
    this.el.addEventListener('blur', () => {
      this.hideSlashMenu()
      this.focused = false
      this.wrap.classList.remove('ic-page-doc-focused')
      this.flushSyncToStore()
      this.host.emitEdit()
    })
    this.el.addEventListener('pointerdown', (e) => this.onPointerDown(e))
    this.el.addEventListener('mousedown', (e) => this.onPointerDown(e))
    this.el.addEventListener('paste', (e) => this.onPaste(e))
    this.slashMenu.addEventListener('mousedown', (e) => {
      e.preventDefault()
      const btn = (e.target as HTMLElement).closest('[data-slash-id]') as HTMLElement | null
      if (btn?.dataset.slashId) this.applySlashCommand(btn.dataset.slashId as BlockType | 'divider')
    })
    document.addEventListener('selectionchange', this.onSelectionChange)
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
    if (this._hintTimer) clearTimeout(this._hintTimer)
    document.removeEventListener('selectionchange', this.onSelectionChange)
    this.wrap.remove()
    this.slashMenu.remove()
  }

  /** Re-sync DOM from store after tab/panel return. */
  refresh(): void {
    this._renderedBlocks = []
    this.syncFromStore()
  }

  private onPaste(e: ClipboardEvent): void {
    if (!this.host.documentMode) return
    const text = e.clipboardData?.getData('text/plain') ?? ''
    if (!text) return
    try {
      const data = JSON.parse(text)
      if (data && (data.incantly || data.quickdraw) && Array.isArray(data.shapes)) {
        e.preventDefault()
        return
      }
    } catch {
      /* plain text */
    }
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
        if (parsed && !isDrawingBlock(parsed)) {
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
      isDrawingBlock(b) ? b : applyMarkdownToBlock(b),
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
        child.style.marginBottom = `${4 * z}px`
      }
    }
  }

  focusAtEnd(): void {
    for (let i = this.blocks().length - 1; i >= 0; i--) {
      if (!isDrawingBlock(this.blocks()[i]!)) {
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

  blur(): void {
    this.el.blur()
  }

  private _hintTimer: ReturnType<typeof setTimeout> | null = null;

  flashInkHint(textBlockIndex: number): void {
    this.showDocHint(textBlockIndex)
    if (this._hintTimer) clearTimeout(this._hintTimer)
    this._hintTimer = setTimeout(() => {
      this.clearDocHints()
      this._hintTimer = null
    }, 600)
  }

  private lastTextBlockIndex(before = this.blocks().length): number {
    const blocks = this.blocks()
    for (let i = Math.min(before, blocks.length) - 1; i >= 0; i--) {
      if (!isDrawingBlock(blocks[i]!)) return i
    }
    return 0
  }

  redirectTypingFromDrawing(_drawingIndex: number): void {
    const textIdx = this.lastTextBlockIndex()
    this.showDocHint(textIdx)
    this.focusTextBlock(textIdx, true)
  }

  private showDocHint(textBlockIndex: number): void {
    this.clearDocHints()
    this.hintBlockIndex = textBlockIndex
    const block = this.el.querySelector(
      `[data-doc-index="${textBlockIndex}"][data-block]`,
    )
    if (block instanceof HTMLElement) block.classList.add('ic-ink-hint')
  }

  private clearDocHints(): void {
    this.hintBlockIndex = null
    this.el.querySelectorAll('.ic-ink-hint').forEach((el) => el.classList.remove('ic-ink-hint'))
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
      const url = window.prompt('Link URL', 'https://')
      if (url) {
        document.execCommand('createLink', false, url)
        this.syncToStore()
      }
    } else if (this.slashMenu.hidden === false) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        this.slashIndex = (this.slashIndex + 1) % this.visibleSlashCommands().length
        this.renderSlashMenu()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        const n = this.visibleSlashCommands().length
        this.slashIndex = (this.slashIndex - 1 + n) % n
        this.renderSlashMenu()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const cmds = this.visibleSlashCommands()
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

  private visibleSlashCommands(): SlashCommand[] {
    if (!this.slashFilter) return SLASH_COMMANDS
    return SLASH_COMMANDS.filter((c) => c.label.toLowerCase().includes(this.slashFilter))
  }

  private showSlashMenu(): void {
    this.renderSlashMenu()
    this.slashMenu.hidden = false
    const sel = window.getSelection()
    if (!sel?.rangeCount) return
    const range = sel.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    const cr = this.host.container.getBoundingClientRect()
    this.slashMenu.style.left = `${rect.left - cr.left}px`
    this.slashMenu.style.top = `${rect.bottom - cr.top + 6}px`
  }

  private renderSlashMenu(): void {
    const cmds = this.visibleSlashCommands()
    this.slashMenu.innerHTML =
      `<div class="ic-slash-menu-title">Basic editing</div>` +
      cmds
        .map(
          (c, i) =>
            `<button type="button" class="ic-slash-item${i === this.slashIndex ? ' ic-slash-item-active' : ''}" data-slash-id="${c.id}">${c.label}</button>`,
        )
        .join('')
  }

  private hideSlashMenu(): void {
    this.slashMenu.hidden = true
    this.slashBlock = null
    this.slashFilter = ''
  }

  private applySlashCommand(id: BlockType | 'divider'): void {
    const block = this.slashBlock
    this.hideSlashMenu()
    if (!block) return
    const text = (block.textContent ?? '').replace(/\/\w*$/, '').trimEnd()
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
