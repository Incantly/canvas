import type {
  BlockType,
  DocumentEditorApi,
  DocumentUiOptions,
  SelectionToolbarHandle,
  SlashCommand,
  SlashMenuRenderContext,
} from '@incantly/canvas'

type PlaygroundSlashCommand = SlashCommand & {
  section: 'basic' | 'advanced'
  shortcut?: string[]
  icon: 'text' | 'h1' | 'h2' | 'h3' | 'bullet' | 'numbered' | 'quote' | 'divider' | 'code'
}

const PLAYGROUND_SLASH_COMMANDS: PlaygroundSlashCommand[] = [
  { id: 'paragraph', label: 'Text', section: 'basic', shortcut: ['⌘', '⌥', '0'], icon: 'text' },
  { id: 'heading1', label: 'Heading 1', section: 'basic', shortcut: ['⌘', '⌥', '1'], icon: 'h1' },
  { id: 'heading2', label: 'Heading 2', section: 'basic', shortcut: ['⌘', '⌥', '2'], icon: 'h2' },
  { id: 'heading3', label: 'Heading 3', section: 'basic', shortcut: ['⌘', '⌥', '3'], icon: 'h3' },
  { id: 'bulletList', label: 'Bullet list', section: 'basic', shortcut: ['⌘', '⇧', '8'], icon: 'bullet' },
  { id: 'numberedList', label: 'Numbered list', section: 'basic', shortcut: ['⌘', '⇧', '7'], icon: 'numbered' },
  { id: 'quote', label: 'Quote', section: 'basic', shortcut: ['⌘', '⇧', 'B'], icon: 'quote' },
  { id: 'divider', label: 'Divider', section: 'basic', icon: 'divider' },
  { id: 'codeBlock', label: 'Code block', section: 'advanced', shortcut: ['⌘', '⌥', 'C'], icon: 'code' },
]

const FONT_SIZES = [14, 16, 18, 20] as const

const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  paragraph: 'Text',
  heading1: 'Heading 1',
  heading2: 'Heading 2',
  heading3: 'Heading 3',
  bulletList: 'Bullet list',
  numberedList: 'Numbered list',
  quote: 'Quote',
  codeBlock: 'Code block',
  divider: 'Divider',
}

function slashIconHtml(kind: PlaygroundSlashCommand['icon']): string {
  switch (kind) {
    case 'text':
      return '<span class="pg-slash-icon">T</span>'
    case 'h1':
      return '<span class="pg-slash-icon">H1</span>'
    case 'h2':
      return '<span class="pg-slash-icon">H2</span>'
    case 'h3':
      return '<span class="pg-slash-icon">H3</span>'
    case 'quote':
      return '<span class="pg-slash-icon">“</span>'
    case 'code':
      return '<span class="pg-slash-icon">&lt;/&gt;</span>'
    case 'divider':
      return '<span class="pg-slash-icon"><svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 8h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span>'
    case 'bullet':
      return `<span class="pg-slash-icon"><svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="3" cy="4" r="1.2" fill="currentColor"/><circle cx="3" cy="8" r="1.2" fill="currentColor"/><circle cx="3" cy="12" r="1.2" fill="currentColor"/><path d="M6 4h8M6 8h8M6 12h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg></span>`
    case 'numbered':
      return `<span class="pg-slash-icon"><svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><text x="1" y="5.5" fill="currentColor" font-size="4.5" font-family="system-ui,sans-serif">1</text><text x="1" y="11.5" fill="currentColor" font-size="4.5" font-family="system-ui,sans-serif">2</text><path d="M6 4h8M6 8h8M6 12h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg></span>`
  }
}

function shortcutHtml(keys?: string[]): string {
  if (!keys?.length) return ''
  return `<span class="pg-slash-shortcut">${keys.map((k) => `<span class="pg-slash-key">${k}</span>`).join('')}</span>`
}

function renderSlashSection(
  title: string,
  commands: PlaygroundSlashCommand[],
  activeIndex: number,
  allCommands: SlashCommand[],
): string {
  if (!commands.length) return ''
  const titleHtml = `<div class="pg-slash-section">${title}</div>`
  const items = commands
    .map((cmd) => {
      const globalIndex = allCommands.findIndex((c) => c.id === cmd.id)
      const active = globalIndex === activeIndex
      return (
        `<button type="button" class="pg-slash-item${active ? ' pg-slash-item-active' : ''}" data-slash-id="${cmd.id}">` +
        slashIconHtml(cmd.icon) +
        `<span class="pg-slash-label">${cmd.label}</span>` +
        shortcutHtml(cmd.shortcut) +
        `</button>`
      )
    })
    .join('')
  return titleHtml + items
}

export function renderPlaygroundSlashMenu(ctx: SlashMenuRenderContext): HTMLElement {
  const root = document.createElement('div')
  root.className = 'pg-slash-inner'
  const playground = PLAYGROUND_SLASH_COMMANDS.filter((c) =>
    ctx.commands.some((cmd) => cmd.id === c.id),
  )
  const basic = playground.filter((c) => c.section === 'basic')
  const advanced = playground.filter((c) => c.section === 'advanced')
  root.innerHTML =
    renderSlashSection('Basic editing', basic, ctx.activeIndex, ctx.commands) +
    renderSlashSection('Advanced editing', advanced, ctx.activeIndex, ctx.commands)
  return root
}

function chevronSvg(): string {
  return '<svg class="chevron" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>'
}

function commentSvg(): string {
  return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h7A1.5 1.5 0 0 1 13 4.5v5A1.5 1.5 0 0 1 11.5 11H7l-2.5 2v-2H4.5A1.5 1.5 0 0 1 3 9.5v-5Z" stroke="currentColor" stroke-width="1.2"/></svg>'
}

function linkSvg(): string {
  return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6.2 9.8a2.8 2.8 0 0 0 3.9 0l1.5-1.5a2.8 2.8 0 0 0-4-4L6.5 5.4M9.8 6.2a2.8 2.8 0 0 0-3.9 0L4.4 7.7a2.8 2.8 0 0 0 4 4l1.1-1.1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>'
}

function feedbackSvg(): string {
  return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.2"/><path d="M8 5v4M8 11h.01" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>'
}

function toolbarPosition(anchor: DOMRect, toolbar: HTMLElement): void {
  toolbar.style.position = 'fixed'
  toolbar.style.transform = 'none'
  const pad = 8
  const w = toolbar.offsetWidth || 420
  const h = toolbar.offsetHeight || 44
  let left = anchor.left + anchor.width / 2 - w / 2
  left = Math.max(pad, Math.min(left, window.innerWidth - w - pad))
  let top = anchor.bottom + pad
  if (top + h > window.innerHeight - pad) top = Math.max(pad, anchor.top - h - pad)
  toolbar.style.left = `${left}px`
  toolbar.style.top = `${top}px`
}

function blockFromSelection(): HTMLElement | null {
  const sel = window.getSelection()
  if (!sel?.anchorNode) return null
  let node: Node | null = sel.anchorNode
  while (node) {
    if (node instanceof HTMLElement && node.dataset.block) return node
    node = node.parentNode
  }
  return null
}

function setBlockType(block: HTMLElement, type: BlockType): void {
  block.setAttribute('data-block', type)
  block.className = `ic-rt-block ic-rt-${type}`
  if (type === 'codeBlock' && block.tagName !== 'PRE') {
    const pre = document.createElement('pre')
    pre.className = block.className
    pre.dataset.block = type
    pre.innerHTML = block.innerHTML
    block.replaceWith(pre)
  }
}

function queryCommandState(cmd: string): boolean {
  try {
    return document.queryCommandState(cmd)
  } catch {
    return false
  }
}

function closeMenus(...menus: (HTMLElement | null)[]): void {
  for (const menu of menus) {
    if (menu) menu.hidden = true
  }
}

export function createPlaygroundSelectionToolbar(api: DocumentEditorApi): SelectionToolbarHandle {
  const mount = document.body
  let fontSize = 16
  let blockLabel = 'Text'
  let colorBar: HTMLElement | null = null

  const toolbar = document.createElement('div')
  toolbar.className = 'pg-selection-toolbar'
  toolbar.hidden = true

  const fontMenu = document.createElement('div')
  fontMenu.className = 'pg-sel-menu'
  fontMenu.hidden = true

  const typeMenu = document.createElement('div')
  typeMenu.className = 'pg-sel-menu'
  typeMenu.hidden = true

  const fontBtn = document.createElement('button')
  fontBtn.type = 'button'
  fontBtn.className = 'pg-sel-dropdown'
  fontBtn.innerHTML = `<span data-role="font-label">${fontSize}px</span>${chevronSvg()}`

  const typeBtn = document.createElement('button')
  typeBtn.type = 'button'
  typeBtn.className = 'pg-sel-dropdown'
  typeBtn.innerHTML = `<span>T</span><span data-role="type-label">${blockLabel}</span>${chevronSvg()}`

  for (const px of FONT_SIZES) {
    const item = document.createElement('button')
    item.type = 'button'
    item.className = 'pg-sel-menu-item'
    item.textContent = `${px}px`
    item.addEventListener('mousedown', (e) => {
      e.preventDefault()
      fontSize = px
      fontBtn.querySelector('[data-role="font-label"]')!.textContent = `${px}px`
      api.applyFontSize(px)
      api.sync()
      closeMenus(fontMenu, typeMenu)
      refreshFormatState()
    })
    fontMenu.appendChild(item)
  }

  for (const [type, label] of Object.entries(BLOCK_TYPE_LABELS)) {
    if (type === 'divider') continue
    const item = document.createElement('button')
    item.type = 'button'
    item.className = 'pg-sel-menu-item'
    item.textContent = label
    item.addEventListener('mousedown', (e) => {
      e.preventDefault()
      const block = blockFromSelection()
      if (block) {
        setBlockType(block, type as BlockType)
        blockLabel = label
        typeBtn.querySelector('[data-role="type-label"]')!.textContent = label
        api.sync()
      }
      closeMenus(fontMenu, typeMenu)
    })
    typeMenu.appendChild(item)
  }

  const formatGroup = document.createElement('div')
  formatGroup.className = 'pg-sel-group'
  const formatBtns: Record<string, HTMLButtonElement> = {}

  for (const [id, label, cmd] of [
    ['bold', '<b>B</b>', 'bold'],
    ['italic', '<i>I</i>', 'italic'],
    ['underline', '<u>U</u>', 'underline'],
    ['strike', '<s>S</s>', 'strikeThrough'],
  ] as const) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'pg-sel-btn'
    btn.dataset.fmt = id
    btn.innerHTML = label
    btn.title = id.charAt(0).toUpperCase() + id.slice(1)
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      api.execFormat(cmd)
      api.sync()
      refreshFormatState()
    })
    formatGroup.appendChild(btn)
    formatBtns[id] = btn
  }

  const linkBtn = document.createElement('button')
  linkBtn.type = 'button'
  linkBtn.className = 'pg-sel-btn pg-sel-icon-only'
  linkBtn.title = 'Link'
  linkBtn.innerHTML = linkSvg()
  linkBtn.addEventListener('mousedown', (e) => {
    e.preventDefault()
    void (async () => {
      const url = await api.promptLink()
      if (url) {
        api.execFormat('createLink', url)
        api.sync()
      }
    })()
  })

  const colorWrap = document.createElement('span')
  colorWrap.className = 'pg-sel-color-wrap'
  const colorBtn = document.createElement('button')
  colorBtn.type = 'button'
  colorBtn.className = 'pg-sel-dropdown'
  colorBtn.innerHTML = `<span style="font-weight:600">A</span><span class="pg-sel-color-bar"></span>${chevronSvg()}`
  colorBar = colorBtn.querySelector('.pg-sel-color-bar')
  const colorInput = document.createElement('input')
  colorInput.type = 'color'
  colorInput.className = 'pg-sel-color-input'
  colorInput.value = '#e8e8e8'
  colorInput.addEventListener('input', () => {
    if (colorBar) colorBar.style.background = colorInput.value
    api.execFormat('foreColor', colorInput.value)
    api.sync()
  })
  colorWrap.appendChild(colorBtn)
  colorWrap.appendChild(colorInput)

  const feedbackBtn = document.createElement('button')
  feedbackBtn.type = 'button'
  feedbackBtn.className = 'pg-sel-btn pg-sel-icon-only pg-sel-green'
  feedbackBtn.title = 'Feedback'
  feedbackBtn.innerHTML = feedbackSvg()

  const commentBtn = document.createElement('button')
  commentBtn.type = 'button'
  commentBtn.className = 'pg-sel-btn'
  commentBtn.innerHTML = `${commentSvg()} Comment`

  toolbar.append(
    feedbackBtn,
    commentBtn,
    mkDivider(),
    fontBtn,
    typeBtn,
    mkDivider(),
    formatGroup,
    linkBtn,
    colorWrap,
  )

  mount.append(toolbar, fontMenu, typeMenu)

  function mkDivider(): HTMLElement {
    const d = document.createElement('span')
    d.className = 'pg-sel-divider'
    d.setAttribute('aria-hidden', 'true')
    return d
  }

  function refreshFormatState(): void {
    formatBtns.bold.dataset.active = String(queryCommandState('bold'))
    formatBtns.italic.dataset.active = String(queryCommandState('italic'))
    formatBtns.underline.dataset.active = String(queryCommandState('underline'))
    formatBtns.strike.dataset.active = String(queryCommandState('strikeThrough'))
    const block = blockFromSelection()
    if (block) {
      const type = (block.dataset.block || 'paragraph') as BlockType
      blockLabel = BLOCK_TYPE_LABELS[type] ?? 'Text'
      typeBtn.querySelector('[data-role="type-label"]')!.textContent = blockLabel
    }
  }

  function openMenu(menu: HTMLElement, anchor: HTMLElement): void {
    closeMenus(fontMenu, typeMenu)
    const rect = anchor.getBoundingClientRect()
    menu.hidden = false
    menu.style.left = `${rect.left}px`
    menu.style.top = `${rect.bottom + 4}px`
  }

  fontBtn.addEventListener('mousedown', (e) => {
    e.preventDefault()
    if (fontMenu.hidden) openMenu(fontMenu, fontBtn)
    else fontMenu.hidden = true
  })

  typeBtn.addEventListener('mousedown', (e) => {
    e.preventDefault()
    if (typeMenu.hidden) openMenu(typeMenu, typeBtn)
    else typeMenu.hidden = true
  })

  const onDocDown = (e: MouseEvent) => {
    const t = e.target as Node
    if (
      !toolbar.contains(t) &&
      !fontMenu.contains(t) &&
      !typeMenu.contains(t)
    ) {
      closeMenus(fontMenu, typeMenu)
    }
  }
  document.addEventListener('mousedown', onDocDown)

  return {
    show(anchor) {
      if (!anchor || (anchor.width === 0 && anchor.height === 0)) {
        toolbar.hidden = true
        closeMenus(fontMenu, typeMenu)
        return
      }
      refreshFormatState()
      toolbar.hidden = false
      toolbarPosition(anchor, toolbar)
    },
    hide() {
      toolbar.hidden = true
      closeMenus(fontMenu, typeMenu)
    },
    destroy() {
      document.removeEventListener('mousedown', onDocDown)
      toolbar.remove()
      fontMenu.remove()
      typeMenu.remove()
    },
  }
}

export function playgroundDocumentUi(): DocumentUiOptions {
  return {
    slashCommands: PLAYGROUND_SLASH_COMMANDS,
    renderSlashMenu: renderPlaygroundSlashMenu,
    selectionToolbar: {
      create: createPlaygroundSelectionToolbar,
    },
  }
}
