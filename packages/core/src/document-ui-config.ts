import type { BlockType } from './rich-text/types.js'
import { execFormat, getSelectionRect, applyInlineFontSize } from './rich-text/dom.js'

export interface SlashCommand {
  id: BlockType | 'divider'
  label: string
  hint?: string
}

export const DEFAULT_SLASH_COMMANDS: SlashCommand[] = [
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

/** Host-facing API passed to custom document UI factories. */
export interface DocumentEditorApi {
  execFormat(cmd: string, value?: string): void
  /** Set font size in px on the current text selection. */
  applyFontSize(px: number): void
  sync(): void
  getSelectionRect(): DOMRect | null
  promptLink(): Promise<string | null>
  undo(): void
  redo(): void
}

export interface SelectionToolbarAction {
  id: string
  label: string
  title?: string
  run(api: DocumentEditorApi): void | Promise<void>
}

export interface SelectionToolbarHandle {
  show(anchor: DOMRect | null): void
  hide(): void
  destroy(): void
}

export type SelectionToolbarPosition = (
  anchor: DOMRect,
  toolbar: HTMLElement,
) => void

export interface SelectionToolbarOptions {
  /** Full control: build toolbar DOM and wire actions. */
  create?: (api: DocumentEditorApi) => SelectionToolbarHandle
  /** Preset actions when `create` is omitted. */
  actions?: SelectionToolbarAction[]
  /** Position the toolbar (default: centered above selection, fixed to viewport). */
  position?: SelectionToolbarPosition
  /** Extra class names on the root toolbar element. */
  className?: string
}

export interface SlashMenuRenderContext {
  commands: SlashCommand[]
  activeIndex: number
  filter: string
  select: (id: BlockType | 'divider') => void
}

export interface DocumentUiOptions {
  /** Slash commands after typing `/`. Defaults to built-in list. */
  slashCommands?: SlashCommand[]
  /** Custom slash menu element. Return `null` to use the default menu. */
  renderSlashMenu?: (ctx: SlashMenuRenderContext) => HTMLElement | null
  /** Floating toolbar on text selection. Set `false` to disable. */
  selectionToolbar?: SelectionToolbarOptions | false
}

export const DEFAULT_SELECTION_ACTIONS: SelectionToolbarAction[] = [
  {
    id: 'bold',
    label: 'B',
    title: 'Bold',
    run: (api) => {
      api.execFormat('bold')
      api.sync()
    },
  },
  {
    id: 'italic',
    label: 'I',
    title: 'Italic',
    run: (api) => {
      api.execFormat('italic')
      api.sync()
    },
  },
  {
    id: 'underline',
    label: 'U',
    title: 'Underline',
    run: (api) => {
      api.execFormat('underline')
      api.sync()
    },
  },
  {
    id: 'strike',
    label: 'S',
    title: 'Strikethrough',
    run: (api) => {
      api.execFormat('strikeThrough')
      api.sync()
    },
  },
  {
    id: 'link',
    label: 'Link',
    title: 'Insert link',
    run: async (api) => {
      const url = await api.promptLink()
      if (url) {
        api.execFormat('createLink', url)
        api.sync()
      }
    },
  },
]

export function defaultSelectionToolbarPosition(anchor: DOMRect, toolbar: HTMLElement): void {
  toolbar.style.position = 'fixed'
  toolbar.style.transform = 'none'
  const pad = 8
  const w = toolbar.offsetWidth || 200
  const h = toolbar.offsetHeight || 36
  let left = anchor.left + anchor.width / 2 - w / 2
  left = Math.max(pad, Math.min(left, window.innerWidth - w - pad))
  let top = anchor.top - h - pad
  if (top < pad) top = anchor.bottom + pad
  toolbar.style.left = `${left}px`
  toolbar.style.top = `${top}px`
}

export function defaultSlashMenuPosition(anchor: DOMRect, menu: HTMLElement): void {
  menu.style.position = 'fixed'
  menu.style.transform = 'none'
  const pad = 8
  const menuH = menu.offsetHeight || 200
  const viewportH = window.visualViewport?.height ?? window.innerHeight
  const topBelow = anchor.bottom + 6
  const maxTop = viewportH - menuH - pad
  menu.style.left = `${Math.max(pad, anchor.left)}px`
  menu.style.top = `${Math.min(topBelow, maxTop)}px`
}

export function createDefaultSelectionToolbar(
  opts: SelectionToolbarOptions,
  api: DocumentEditorApi,
  mount: HTMLElement,
): SelectionToolbarHandle {
  const position = opts.position ?? defaultSelectionToolbarPosition
  const actions = opts.actions ?? DEFAULT_SELECTION_ACTIONS
  const el = document.createElement('div')
  el.className = ['ic-doc-selection-toolbar', opts.className].filter(Boolean).join(' ')
  el.hidden = true
  for (const action of actions) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'ic-doc-selection-btn'
    btn.dataset.actionId = action.id
    btn.title = action.title ?? action.label
    btn.textContent = action.label
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      void action.run(api)
    })
    el.appendChild(btn)
  }
  mount.appendChild(el)
  return {
    show(anchor) {
      if (!anchor || (anchor.width === 0 && anchor.height === 0)) {
        el.hidden = true
        return
      }
      el.hidden = false
      position(anchor, el)
    },
    hide() {
      el.hidden = true
    },
    destroy() {
      el.remove()
    },
  }
}

export function createDocumentEditorApi(host: {
  promptLink?: () => Promise<string | null>
  sync: () => void
  undo: () => void
  redo: () => void
}): DocumentEditorApi {
  return {
    execFormat(cmd, value) {
      execFormat(cmd, value)
    },
    applyFontSize(px) {
      applyInlineFontSize(px)
    },
    sync: () => host.sync(),
    getSelectionRect,
    async promptLink() {
      if (host.promptLink) return host.promptLink()
      if (typeof window.prompt === 'function') return window.prompt('Link URL', 'https://')
      return null
    },
    undo: () => host.undo(),
    redo: () => host.redo(),
  }
}
