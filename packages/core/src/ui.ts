import type { Editor, BuildUIOptions, BoardUI, ToolId, GeoId, GridId, ThemeId, ColorId } from './types/index.js'
import { PAGE_GAP_STEP } from './pages.js'
import { COLOR_IDS, SIZE_IDS, DASH_IDS, FILL_IDS, GEO_IDS, GRID_IDS, THEMES } from './palette.js'

const SVG = (inner: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`

type IconName =
  | ToolId
  | GeoId
  | 'undo'
  | 'redo'
  | 'menu'
  | 'more'
  | 'download'
  | 'transparent'
  | 'copy'
  | 'fit'
  | 'trash'
  | 'check'
  | 'chevronRight'
  | 'chevronLeft'
  | 'sun'
  | 'moon'
  | 'duplicate'
  | 'delete'
  | 'tools'
  | 'styles'

const ICONS: Record<IconName, string> = {
  select: SVG(
    '<path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z"/>'
  ),
  hand: SVG(
    '<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>'
  ),
  draw: SVG(
    '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>'
  ),
  highlight: SVG(
    '<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4l8 8Z"/>'
  ),
  eraser: SVG(
    '<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>'
  ),
  laser: SVG(
    '<path d="m3 21 9-9"/><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h-2"/><path d="M17.8 11.8 19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2 19 5"/><path d="M12.2 6.2 11 5"/>'
  ),
  line: SVG('<path d="M19 5 5 19"/>'),
  arrow: SVG('<path d="M7 7h10v10"/><path d="M7 17 17 7"/>'),
  geo: '',
  text: SVG(
    '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>'
  ),
  note: SVG(
    '<path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z"/><path d="M15 3v4a2 2 0 0 0 2 2h4"/>'
  ),
  image: SVG(
    '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>'
  ),
  undo: SVG(
    '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>'
  ),
  redo: SVG(
    '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"/>'
  ),
  menu: SVG(
    '<circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none"/>'
  ),
  more: SVG('<path d="m7 12.5 5-5 5 5"/><path d="m7 18.5 5-5 5 5"/>'),
  rectangle: SVG('<rect width="18" height="18" x="3" y="3" rx="2"/>'),
  ellipse: SVG('<circle cx="12" cy="12" r="9"/>'),
  triangle: SVG(
    '<path d="M13.73 4a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z"/>'
  ),
  diamond: SVG(
    '<path d="M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41l-7.59-7.59a2.41 2.41 0 0 0-3.41 0Z"/>'
  ),
  hexagon: SVG(
    '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>'
  ),
  star: SVG(
    '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'
  ),
  cloud: SVG(`<path d="M7 17h10a4 4 0 0 0 .5-8A5.5 5.5 0 0 0 7 10a3.5 3.5 0 0 0 0 7z"/>`),
  download: SVG(
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>'
  ),
  transparent: SVG(
    '<rect width="18" height="18" x="3" y="3" rx="2"/><rect x="4" y="4" width="8" height="8" fill="currentColor" fill-opacity=".22" stroke="none"/><rect x="12" y="12" width="8" height="8" fill="currentColor" fill-opacity=".22" stroke="none"/>'
  ),
  copy: SVG('<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2"/>'),
  fit: SVG(
    '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>'
  ),
  trash: SVG(
    '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>'
  ),
  check: SVG('<path d="M20 6 9 17l-5-5"/>'),
  chevronRight: SVG('<path d="m9 18 6-6-6-6"/>'),
  chevronLeft: SVG('<path d="m15 18-6-6 6-6"/>'),
  sun: SVG(
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>'
  ),
  moon: SVG('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>'),
  duplicate: '',
  delete: '',
  tools: '',
  styles: '',
}
ICONS.duplicate = ICONS.copy
ICONS.delete = ICONS.trash

const GRID_ICONS: Record<GridId, string> = {
  none: SVG('<rect width="18" height="18" x="3" y="3" rx="2"/>'),
  lines: SVG(
    '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18" stroke-width="1.4"/>'
  ),
  ruled: SVG(
    '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 8.5h18M3 13h18M3 17.5h18" stroke-width="1.4"/>'
  ),
  dots: SVG(
    '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" stroke-width="2.2"/>'
  ),
  crosses: SVG(
    '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 6.5v3M6.5 8h3M16 6.5v3M14.5 8h3M12 10.5v3M10.5 12h3M8 14.5v3M6.5 16h3M16 14.5v3M14.5 16h3" stroke-width="1.3"/>'
  ),
  iso: SVG(
    '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="m3 7 10.4 14M8.6 3 19 17M21 7 10.6 21M15.4 3 5 17" stroke-width="1.2"/>'
  ),
}
const GRID_TIPS: Record<GridId, string> = {
  none: 'No grid',
  lines: 'Grid lines',
  ruled: 'Ruled paper',
  dots: 'Grid dots',
  crosses: 'Crosses',
  iso: 'Isometric',
}
const GRID_LABELS: Record<GridId, string> = {
  none: 'None',
  lines: 'Lines',
  ruled: 'Ruled',
  dots: 'Dots',
  crosses: 'Crosses',
  iso: 'Isometric',
}

const DASH_ICONS: Record<string, string> = {
  draw: SVG('<path d="M4 15c3.2-4.5 6-5.5 8-3.5s5 1.5 8-4.5"/>'),
  solid: SVG('<path d="M4 12h16"/>'),
  dashed: SVG('<path d="M4 12h3.2M10.4 12h3.2M16.8 12h3.2"/>'),
  dotted: SVG('<path d="M4.5 12h.01M9.5 12h.01M14.5 12h.01M19.5 12h.01" stroke-width="3"/>'),
}
const FILL_ICONS: Record<string, string> = {
  none: SVG('<rect x="5" y="5" width="14" height="14" rx="2"/>'),
  semi: SVG('<rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" fill-opacity="0.18"/>'),
  solid: SVG(
    '<rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" fill-opacity="0.45" stroke="none"/><rect x="5" y="5" width="14" height="14" rx="2"/>'
  ),
  pattern: SVG(
    '<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M6 15 15 6M9 18l9-9" stroke-width="1.3"/>'
  ),
}

type TipName =
  | ToolId
  | 'undo'
  | 'redo'
  | 'menu'
  | 'more'
  | 'tools'
  | 'duplicate'
  | 'delete'

const TIPS: Record<TipName, string> = {
  select: 'Select — V',
  hand: 'Hand — H',
  draw: 'Draw — D',
  highlight: 'Highlight — I',
  eraser: 'Eraser — E',
  laser: 'Laser — K',
  line: 'Line — L',
  arrow: 'Arrow — A',
  geo: 'Shape — G',
  text: 'Text — T',
  note: 'Sticky note — N',
  image: 'Insert image',
  undo: 'Undo — ⌘Z',
  redo: 'Redo — ⇧⌘Z',
  menu: 'Board menu',
  more: 'More tools',
  tools: 'Tools',
  duplicate: 'Duplicate — ⌘D',
  delete: 'Delete — ⌫',
}

const DOCK_NAMES: readonly ToolId[] = [
  'select',
  'hand',
  'draw',
  'highlight',
  'eraser',
  'laser',
  'line',
  'arrow',
  'geo',
  'text',
  'note',
  'image',
]
const DROP_ORDER: readonly ToolId[] = [
  'hand',
  'laser',
  'line',
  'note',
  'image',
  'highlight',
  'text',
  'arrow',
  'eraser',
  'geo',
]

type UIMode = 'full' | 'compact' | 'mini' | null

interface Popover {
  name: string
  el: HTMLDivElement
}

type BuildUIArgs = [Editor, BuildUIOptions?]

export function buildUI(...[editor, { hidden = false, onSave, themeToggle = true, gridControl = true } = {}]: BuildUIArgs): BoardUI {
  const root = editor.container
  const opts = { themeToggle: themeToggle !== false, gridControl: gridControl !== false }
  const ui = el<HTMLDivElement>('div', 'ic-ui')
  root.appendChild(ui)

  let popover: Popover | null = null
  const closePopover = (): void => {
    if (popover) {
      popover.el.remove()
      popover = null
      refresh()
    }
  }
  const openPopover = (name: string, build: (p: HTMLDivElement) => void, anchor: HTMLElement): void => {
    if (popover?.name === name) return closePopover()
    closePopover()
    const p = el<HTMLDivElement>('div', 'ic-popover')
    build(p)
    ui.appendChild(p)
    popover = { name, el: p }
    requestAnimationFrame(() => {
      const ar = anchor.getBoundingClientRect()
      const rr = root.getBoundingClientRect()
      const pw = p.offsetWidth
      let left = ar.left - rr.left + ar.width / 2 - pw / 2
      left = Math.max(8, Math.min(left, rr.width - pw - 8))
      p.style.left = left + 'px'
    })
    refresh()
  }

  const run = (name: string, b: HTMLButtonElement): void => {
    if (name === 'image') {
      closePopover()
      return editor.pickImage()
    }
    if (name === 'geo') return geoTap(b)
    closePopover()
    editor.setTool(name as ToolId)
  }
  const geoTap = (b: HTMLButtonElement): void => {
    editor.setTool('geo')
    openPopover('geo', (p) => {
      p.classList.add('ic-geo-pop')
      for (const g of GEO_IDS) {
        const gb = el<HTMLButtonElement>('button', 'ic-tool' + (editor.geoKind === g ? ' on' : ''))
        gb.innerHTML = ICONS[g] || ''
        gb.title = g
        gb.addEventListener('click', (ev) => {
          ev.stopPropagation()
          editor.setGeoKind(g)
          editor.setTool('geo')
          closePopover()
        })
        p.appendChild(gb)
      }
    }, b)
  }

  const makeBtn = (name: string, onClick: (e: Event, b: HTMLButtonElement) => void, cls: string = 'ic-tool'): HTMLButtonElement => {
    const b = el<HTMLButtonElement>('button', cls)
    b.dataset.name = name
    b.innerHTML = (ICONS as any)[name] || ''
    b.title = (TIPS as any)[name] || name
    b.addEventListener('pointerdown', (e) => e.stopPropagation())
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      onClick(e, b)
    })
    return b
  }

  const dock = el<HTMLDivElement>('div', 'ic-dock')
  ui.appendChild(dock)

  const dockBtns = new Map<string, HTMLButtonElement>()
  const dividers: HTMLElement[] = []
  const addBtn = (name: string): HTMLButtonElement => {
    const b = makeBtn(name, (e, b2) => run(name, b2))
    dock.appendChild(b)
    dockBtns.set(name, b)
    return b
  }
  const divider = (): void => {
    const d = el<HTMLElement>('i', 'ic-div')
    dock.appendChild(d)
    dividers.push(d)
  }

  addBtn('select')
  addBtn('hand')
  divider()
  addBtn('draw')
  addBtn('highlight')
  addBtn('eraser')
  addBtn('laser')
  divider()
  addBtn('line')
  addBtn('arrow')
  addBtn('geo').classList.add('ic-geo-btn')
  addBtn('text')
  addBtn('note')
  addBtn('image')
  divider()

  const toolsBtn = makeBtn('tools', (e, b) => openPopover('tools', (p) => buildGrid(p, [...DOCK_NAMES]), b))
  dock.appendChild(toolsBtn)

  const styleBtn = makeBtn('styles', (e, b) => openPopover('styles', buildStyles, b))
  styleBtn.classList.add('ic-style-btn')
  styleBtn.title = 'Color & style'
  const styleDot = el<HTMLSpanElement>('span', 'ic-style-dot')
  styleBtn.appendChild(styleDot)
  dock.appendChild(styleBtn)

  const moreBtn = makeBtn('more', (e, b) => openPopover('more', (p) => buildGrid(p, hiddenNames), b))
  dock.appendChild(moreBtn)

  const menuBtn = makeBtn('menu', (e, b) => openPopover('menu', buildMenu, b))
  dock.appendChild(menuBtn)

  const actionBar = el<HTMLDivElement>('div', 'ic-actions')
  ui.appendChild(actionBar)
  const actBtns = new Map<string, HTMLButtonElement>()
  const addAction = (name: string, fn: () => void): HTMLButtonElement => {
    const b = makeBtn(name, fn)
    actionBar.appendChild(b)
    actBtns.set(name, b)
    return b
  }
  addAction('undo', () => editor.store.undo())
  addAction('redo', () => editor.store.redo())
  actionBar.appendChild(el('i', 'ic-div'))
  addAction('duplicate', () => editor.duplicateSelection())
  addAction('delete', () => editor.deleteSelection())

  const pagesBar = el<HTMLDivElement>('div', 'ic-pages')
  ui.appendChild(pagesBar)
  const prevPageBtn = makeBtn('chevronLeft', () => {
    const pages = editor.pages()
    const idx = pages.findIndex((p) => p.id === editor.currentPageId)
    if (idx > 0) editor.setPage(pages[idx - 1].id)
  }, 'ic-page-btn')
  pagesBar.appendChild(prevPageBtn)
  const pageLabel = el<HTMLSpanElement>('span', 'ic-page-label')
  pagesBar.appendChild(pageLabel)
  const nextPageBtn = makeBtn('chevronRight', () => {
    const pages = editor.pages()
    const idx = pages.findIndex((p) => p.id === editor.currentPageId)
    if (idx >= 0 && idx < pages.length - 1) editor.setPage(pages[idx + 1].id)
  }, 'ic-page-btn')
  pagesBar.appendChild(nextPageBtn)
  const addPageBtn = el<HTMLButtonElement>('button', 'ic-page-btn ic-page-add')
  addPageBtn.type = 'button'
  addPageBtn.title = 'Add page (stay on current view)'
  addPageBtn.textContent = '+'
  addPageBtn.addEventListener('pointerdown', (e) => e.stopPropagation())
  addPageBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    editor.addPage()
  })
  pagesBar.appendChild(addPageBtn)

  const removePageBtn = makeBtn(
    'trash',
    () => {
      if (editor.pages().length <= 1) return
      editor.removePage(editor.currentPageId)
    },
    'ic-page-btn ic-page-remove',
  )
  removePageBtn.title = 'Delete page'
  pagesBar.appendChild(removePageBtn)

  const layoutBtn = el<HTMLButtonElement>('button', 'ic-page-btn ic-page-layout')
  layoutBtn.type = 'button'
  layoutBtn.addEventListener('pointerdown', (e) => e.stopPropagation())
  layoutBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    editor.setPageLayout(editor.pageLayout() === 'vertical' ? 'horizontal' : 'vertical')
  })
  pagesBar.appendChild(layoutBtn)

  const gapDownBtn = el<HTMLButtonElement>('button', 'ic-page-btn ic-page-gap')
  gapDownBtn.type = 'button'
  gapDownBtn.textContent = '−'
  gapDownBtn.title = 'Decrease page spacing'
  gapDownBtn.addEventListener('pointerdown', (e) => e.stopPropagation())
  gapDownBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    editor.adjustPageGap(-PAGE_GAP_STEP)
  })
  pagesBar.appendChild(gapDownBtn)

  const gapLabel = el<HTMLSpanElement>('span', 'ic-page-gap-label')
  gapLabel.title = 'Click for connected pages (no gap)'
  gapLabel.addEventListener('pointerdown', (e) => e.stopPropagation())
  gapLabel.addEventListener('click', (e) => {
    e.stopPropagation()
    editor.setPageGapPreset('connected')
  })
  pagesBar.appendChild(gapLabel)

  const gapUpBtn = el<HTMLButtonElement>('button', 'ic-page-btn ic-page-gap')
  gapUpBtn.type = 'button'
  gapUpBtn.textContent = '+'
  gapUpBtn.title = 'Increase page spacing'
  gapUpBtn.addEventListener('pointerdown', (e) => e.stopPropagation())
  gapUpBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    editor.adjustPageGap(PAGE_GAP_STEP)
  })
  pagesBar.appendChild(gapUpBtn)

  const refreshPages = (): void => {
    const pages = editor.pages()
    const idx = pages.findIndex((p) => p.id === editor.currentPageId)
    pageLabel.textContent = pages.length ? `${idx + 1} / ${pages.length}` : '—'
    prevPageBtn.disabled = idx <= 0
    nextPageBtn.disabled = idx < 0 || idx >= pages.length - 1
    removePageBtn.disabled = pages.length <= 1
  }
  const refreshLayout = (): void => {
    const layout = editor.pageLayout()
    layoutBtn.textContent = layout === 'vertical' ? '↕' : '↔'
    layoutBtn.title =
      layout === 'vertical'
        ? 'Vertical — new pages below. Click for horizontal.'
        : 'Horizontal — pages in a row (1, 2, 3…). Click for vertical.'
  }
  const refreshGap = (): void => {
    const gap = editor.pageGap()
    const preset = editor.pageGapPreset()
    gapLabel.textContent =
      preset === 'connected' ? 'linked' : preset === 'wide' ? `${gap}` : `${gap}`
    gapLabel.title =
      preset === 'connected'
        ? 'Connected — pages touch. Click to keep; use −/+ to adjust.'
        : `Spacing ${gap}px — click for connected (0), use −/+ to adjust`
  }

  function buildGrid(p: HTMLDivElement, names: string[]): void {
    p.classList.add('ic-grid-pop')
    for (const name of names) {
      const isTool = name !== 'image'
      const b = makeBtn(name, (e, b2) => run(name, b2))
      if (name === 'geo') b.innerHTML = (ICONS as any)[editor.geoKind] || ''
      if (isTool && editor.tool === (name as ToolId)) b.classList.add('on')
      p.appendChild(b)
    }
  }

  const theme = () => THEMES[editor.theme.id as ThemeId]
  function buildStyles(p: HTMLDivElement): void {
    p.classList.add('ic-style-pop')
    const cur = editor.currentStyles() as Record<string, string | null>
    const row = (cls: string): HTMLDivElement => {
      const r = el<HTMLDivElement>('div', 'ic-row ' + cls)
      p.appendChild(r)
      return r
    }

    const colors = row('ic-colors')
    for (const c of COLOR_IDS) {
      const b = el<HTMLButtonElement>('button', 'ic-dot' + (cur.color === c ? ' on' : ''))
      b.style.setProperty('--dot', theme().colors[c].stroke)
      b.title = c
      b.addEventListener('click', (e) => {
        e.stopPropagation()
        editor.setStyle('color', c)
        restyle()
      })
      colors.appendChild(b)
    }
    const sizes = row('ic-sizes')
    SIZE_IDS.forEach((s, i) => {
      const b = el<HTMLButtonElement>('button', 'ic-opt' + (cur.size === s ? ' on' : ''))
      b.title = 'Size ' + s.toUpperCase()
      b.innerHTML = `<span class="ic-size-pip" style="--pip:${4 + i * 3}px"></span>`
      b.addEventListener('click', (e) => {
        e.stopPropagation()
        editor.setStyle('size', s)
        restyle()
      })
      sizes.appendChild(b)
    })
    const dashes = row('ic-dashes')
    for (const d of DASH_IDS) {
      const b = el<HTMLButtonElement>('button', 'ic-opt' + (cur.dash === d ? ' on' : ''))
      b.title = d === 'draw' ? 'hand-drawn' : d
      b.innerHTML = DASH_ICONS[d] || ''
      b.addEventListener('click', (e) => {
        e.stopPropagation()
        editor.setStyle('dash', d)
        restyle()
      })
      dashes.appendChild(b)
    }
    const fills = row('ic-fills')
    for (const f of FILL_IDS) {
      const b = el<HTMLButtonElement>('button', 'ic-opt' + (cur.fill === f ? ' on' : ''))
      b.title = 'fill: ' + f
      b.innerHTML = FILL_ICONS[f] || ''
      b.addEventListener('click', (e) => {
        e.stopPropagation()
        editor.setStyle('fill', f)
        restyle()
      })
      fills.appendChild(b)
    }
    function restyle(): void {
      const c2 = editor.currentStyles() as Record<string, string | null>
      colors.querySelectorAll('.ic-dot').forEach((b, i) => b.classList.toggle('on', COLOR_IDS[i] === c2.color))
      sizes.querySelectorAll('.ic-opt').forEach((b, i) => b.classList.toggle('on', SIZE_IDS[i] === c2.size))
      dashes.querySelectorAll('.ic-opt').forEach((b, i) => b.classList.toggle('on', DASH_IDS[i] === c2.dash))
      fills.querySelectorAll('.ic-opt').forEach((b, i) => b.classList.toggle('on', FILL_IDS[i] === c2.fill))
      refresh()
    }
  }

  function buildMenu(p: HTMLDivElement): void {
    p.classList.add('ic-menu-pop')
    const item = (
      icon: string,
      label: string,
      key: string | null,
      fn: () => Promise<void> | void
    ): HTMLButtonElement => {
      const b = el<HTMLButtonElement>('button', 'ic-menu-item')
      b.innerHTML = `<span class="ic-mi-ico">${(ICONS as any)[icon] || ''}</span><span class="ic-mi-label"></span>`
      ;(b.querySelector('.ic-mi-label') as HTMLElement).textContent = label
      if (key) {
        const k = el<HTMLSpanElement>('span', 'ic-mi-key')
        k.textContent = key
        b.appendChild(k)
      }
      b.addEventListener('click', async (e) => {
        e.stopPropagation()
        closePopover()
        try {
          await fn()
        } catch (err) {
          console.warn('board menu action failed', err)
        }
      })
      p.appendChild(b)
      return b
    }
    const segment = <T extends string>(
      label: string,
      ids: readonly T[],
      {
        icons,
        tips,
        current,
        onPick,
      }: {
        icons: Record<T, string>
        tips: Record<T, string>
        current: string
        onPick: (id: T) => void
      }
    ): HTMLDivElement => {
      const row = el<HTMLDivElement>('div', 'ic-menu-row')
      const cap = el<HTMLSpanElement>('span', 'ic-mi-label')
      cap.textContent = label
      row.appendChild(cap)
      const seg = el<HTMLDivElement>('div', 'ic-seg')
      for (const id of ids) {
        const b = el<HTMLButtonElement>('button', 'ic-seg-btn' + (current === id ? ' on' : ''))
        b.innerHTML = icons[id]
        b.title = tips[id]
        b.setAttribute('aria-label', tips[id])
        b.addEventListener('click', (e) => {
          e.stopPropagation()
          onPick(id)
          seg.querySelectorAll('.ic-seg-btn').forEach((x, i) => x.classList.toggle('on', ids[i] === id))
        })
        seg.appendChild(b)
      }
      row.appendChild(seg)
      p.appendChild(row)
      return row
    }

    const hasSel = editor.selection.size > 0
    item('download', 'Export as PNG', null, () => saveImage(true, null))
    item('transparent', 'Export — transparent', null, () => saveImage(false, null))
    if (hasSel)
      item('image', 'Export selection', null, () => saveImage(true, new Set(editor.selection)))
    item('copy', hasSel ? 'Copy selection as image' : 'Copy as image', null, async () => {
      const blob = await editor.exportImage({
        background: true,
        ids: hasSel ? new Set(editor.selection) : null,
      })
      if (blob) await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    })
    p.appendChild(el('i', 'ic-menu-div'))
    if (hasSel) item('trash', 'Delete selection', '⌫', () => editor.deleteSelection())
    item('fit', 'Zoom to fit page', '⇧1', () => editor.fitPage({ animate: 220 }))
    item('trash', 'Clear board', '⇧⌘⌫', () => editor.clearBoard())

    if (opts.gridControl || opts.themeToggle) p.appendChild(el('i', 'ic-menu-div'))
    if (opts.gridControl) {
      const row = el<HTMLDivElement>('div', 'ic-menu-item ic-has-sub')
      row.setAttribute('role', 'button')
      ;(row as any).tabIndex = 0
      row.innerHTML =
        `<span class="ic-mi-ico">${GRID_ICONS[editor.grid]}</span>` +
        '<span class="ic-mi-label">Grid</span>' +
        '<span class="ic-mi-value"></span>' +
        `<span class="ic-mi-chev">${ICONS.chevronRight}</span>`
      ;(row.querySelector('.ic-mi-value') as HTMLElement).textContent = GRID_LABELS[editor.grid]

      const sub = el<HTMLDivElement>('div', 'ic-submenu')
      for (const id of GRID_IDS) {
        const b = el<HTMLButtonElement>('button', 'ic-menu-item')
        b.innerHTML =
          `<span class="ic-mi-ico">${GRID_ICONS[id]}</span>` +
          '<span class="ic-mi-label"></span>' +
          `<span class="ic-mi-check">${editor.grid === id ? ICONS.check : ''}</span>`
        ;(b.querySelector('.ic-mi-label') as HTMLElement).textContent = GRID_LABELS[id]
        b.title = GRID_TIPS[id]
        b.addEventListener('click', (e) => {
          e.stopPropagation()
          editor.setGrid(id)
          sub.querySelectorAll('.ic-mi-check').forEach((c, i) => {
            ;(c as HTMLElement).innerHTML = GRID_IDS[i] === id ? ICONS.check : ''
          })
          ;(row.querySelector('.ic-mi-ico') as HTMLElement).innerHTML = GRID_ICONS[id]
          ;(row.querySelector('.ic-mi-value') as HTMLElement).textContent = GRID_LABELS[id]
        })
        sub.appendChild(b)
      }
      row.appendChild(sub)

      const openSub = (): void => {
        row.classList.add('sub-open')
        const rr = root.getBoundingClientRect()
        const br = row.getBoundingClientRect()
        const fitsRight = br.right + sub.offsetWidth + 12 <= rr.right
        sub.classList.toggle('ic-sub-left', !fitsRight)
        const fitsDown = br.top - 7 + sub.offsetHeight <= rr.bottom - 8
        sub.style.top = fitsDown ? '' : 'auto'
        sub.style.bottom = fitsDown ? '' : '-7px'
      }
      const closeSub = (): void => row.classList.remove('sub-open')
      let subT: any
      row.addEventListener('mouseenter', () => {
        clearTimeout(subT)
        openSub()
      })
      row.addEventListener('mouseleave', () => {
        subT = setTimeout(closeSub, 180)
      })
      row.addEventListener('click', (e) => {
        e.stopPropagation()
        row.classList.contains('sub-open') ? closeSub() : openSub()
      })
      p.appendChild(row)
    }
    if (opts.themeToggle) {
      segment<ThemeId>('Theme', ['light', 'dark'], {
        icons: { light: ICONS.sun, dark: ICONS.moon },
        tips: { light: 'Light theme', dark: 'Dark theme' },
        current: editor.theme.id,
        onPick: (id) => editor.setTheme(id),
      })
    }
  }
  async function saveImage(background: boolean, ids: Set<string> | null): Promise<void> {
    const blob = await editor.exportImage({ background, ids })
    if (!blob) return
    if (onSave) return onSave(blob, background)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download =
      'incantly-' + new Date().toISOString().slice(0, 19).replaceAll(':', '.') + '.png'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  }

  const BTN = 34
  const PAD = 16
  let hiddenNames: string[] = []
  let mode: UIMode = null
  const fit = (): void => {
    const avail = (root.clientWidth || 600) - 16
    const fullW = PAD + (DOCK_NAMES.length + 2) * BTN + dividers.length * 7
    const slots = Math.floor((avail - PAD) / BTN)
    let m: Exclude<UIMode, null>
    let hid: string[]
    if (avail >= fullW) {
      m = 'full'
      hid = []
    } else if (slots < 5) {
      m = 'mini'
      hid = [...DOCK_NAMES]
    } else {
      m = 'compact'
      const extra = Math.max(0, slots - 5)
      const keep = new Set<string>(['select', 'draw'])
      for (let i = DROP_ORDER.length - 1, n = extra; i >= 0 && n > 0; i--, n--)
        keep.add(DROP_ORDER[i])
      hid = DOCK_NAMES.filter((n2) => !keep.has(n2))
    }
    const changed = m !== mode || hid.join() !== hiddenNames.join()
    mode = m
    hiddenNames = hid
    if (!changed) return
    const hideSet = new Set(hid)
    for (const [n, b] of dockBtns) b.style.display = hideSet.has(n) ? 'none' : ''
    for (const d of dividers) d.style.display = m === 'full' ? '' : 'none'
    toolsBtn.style.display = m === 'mini' ? '' : 'none'
    moreBtn.style.display = m === 'compact' ? '' : 'none'
    dock.classList.toggle('ic-compact', m !== 'full')
    if (popover && ['more', 'tools', 'geo'].includes(popover.name)) closePopover()
    refresh()
  }
  const ro = new ResizeObserver(fit)
  ro.observe(root)
  fit()

  function refresh(): void {
    for (const n of DOCK_NAMES) {
      const b = dockBtns.get(n)
      if (!b) continue
      if (n === 'image') continue
      b.classList.toggle('on', editor.tool === n)
    }
    const geoBtn = dockBtns.get('geo')!
    geoBtn.innerHTML = (ICONS as any)[editor.geoKind] || ''
    actBtns.get('undo')!.disabled = !editor.store.canUndo
    actBtns.get('redo')!.disabled = !editor.store.canRedo
    const hasSel = editor.selection.size > 0
    actBtns.get('duplicate')!.disabled = !hasSel
    actBtns.get('delete')!.disabled = !hasSel
    toolsBtn.innerHTML =
      (ICONS as any)[editor.tool === 'geo' ? editor.geoKind : editor.tool] || ICONS.select
    toolsBtn.classList.toggle('on', popover?.name === 'tools')
    const curStyles = editor.currentStyles()
    styleDot.style.background =
      editor.theme.colors[((curStyles.color || 'blue') as ColorId)].stroke
    menuBtn.classList.toggle('on', popover?.name === 'menu')
    styleBtn.classList.toggle('on', popover?.name === 'styles')
    moreBtn.classList.toggle('on', popover?.name === 'more')
  }
  const offs: Array<() => void> = [
    editor.on('tool', refresh),
    editor.on('styles', refresh),
    editor.on('history', refresh),
    editor.on('selection', refresh),
    editor.on('theme', refresh),
    editor.on('grid', refresh),
    editor.on('page', refreshPages),
    editor.on('pagelayout', refreshLayout),
    editor.on('pagegap', refreshGap),
  ]
  refreshPages()
  refreshLayout()
  refreshGap()

  const closeOnCanvas = (e: Event): void => {
    if (!ui.contains(e.target as Node)) closePopover()
  }
  root.addEventListener('pointerdown', closeOnCanvas, { capture: true })

  const setHidden = (h: boolean): void => { ui.classList.toggle('ic-hidden', !!h) }
  setHidden(hidden)
  refresh()

  return {
    setHidden,
    setOptions(next: { themeToggle?: boolean; gridControl?: boolean } = {}): void {
      if ('themeToggle' in next) opts.themeToggle = next.themeToggle !== false
      if ('gridControl' in next) opts.gridControl = next.gridControl !== false
      if (popover?.name === 'menu') closePopover()
    },
    destroy(): void {
      offs.forEach((f) => f())
      ro.disconnect()
      root.removeEventListener('pointerdown', closeOnCanvas, { capture: true })
      ui.remove()
    },
  }
}

function el<T extends HTMLElement>(tag: string, cls?: string): T {
  const e = document.createElement(tag) as T
  if (cls) e.className = cls
  return e
}
