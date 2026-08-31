import { FONT_IDS } from '../palette.js'
import { execFormat, applyInlineFontSize } from './dom.js'

export interface RichTextToolbar {
  el: HTMLDivElement
  show: (anchor?: DOMRect | null) => void
  hide: () => void
  destroy: () => void
}

function btn(label: string, title: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = 'ic-rt-toolbar-btn'
  b.title = title
  b.textContent = label
  b.addEventListener('mousedown', (e) => {
    e.preventDefault()
    onClick()
  })
  return b
}

export function createRichTextToolbar(
  container: HTMLElement,
  onChange: () => void
): RichTextToolbar {
  const el = document.createElement('div')
  el.className = 'ic-rt-toolbar'
  el.hidden = true

  const add = (label: string, tip: string, fn: () => void) => el.appendChild(btn(label, tip, fn))

  add('B', 'Bold — ⌘B', () => {
    execFormat('bold')
    onChange()
  })
  add('I', 'Italic — ⌘I', () => {
    execFormat('italic')
    onChange()
  })
  add('U', 'Underline — ⌘U', () => {
    execFormat('underline')
    onChange()
  })
  add('S', 'Strikethrough', () => {
    execFormat('strikeThrough')
    onChange()
  })
  add('`', 'Inline code', () => {
    execFormat('insertHTML', '<code></code>')
    onChange()
  })
  add('H1', 'Heading 1', () => {
    execFormat('formatBlock', 'div')
    onChange()
  })
  add('•', 'Bullet list', () => {
    execFormat('insertUnorderedList')
    onChange()
  })
  add('1.', 'Numbered list', () => {
    execFormat('insertOrderedList')
    onChange()
  })
  add('🔗', 'Link — ⌘K', () => {
    const url = window.prompt('Link URL', 'https://')
    if (url) {
      execFormat('createLink', url)
      onChange()
    }
  })

  const fontSel = document.createElement('select')
  fontSel.className = 'ic-rt-toolbar-select'
  fontSel.title = 'Font family'
  for (const id of FONT_IDS) {
    const o = document.createElement('option')
    o.value = id
    o.textContent = id
    fontSel.appendChild(o)
  }
  fontSel.addEventListener('change', () => {
    execFormat('fontName', fontSel.value)
    onChange()
  })
  el.appendChild(fontSel)

  const sizeSel = document.createElement('select')
  sizeSel.className = 'ic-rt-toolbar-select'
  sizeSel.title = 'Font size'
  for (const sz of [14, 16, 18, 20, 24, 32, 40, 48]) {
    const o = document.createElement('option')
    o.value = String(sz)
    o.textContent = `${sz}px`
    sizeSel.appendChild(o)
  }
  sizeSel.addEventListener('change', () => {
    applyInlineFontSize(Number(sizeSel.value))
    onChange()
  })
  el.appendChild(sizeSel)

  container.appendChild(el)

  return {
    el,
    show(anchor) {
      el.hidden = false
      if (anchor && anchor.width > 0) {
        const cr = container.getBoundingClientRect()
        el.style.left = `${anchor.left - cr.left + anchor.width / 2 - el.offsetWidth / 2}px`
        el.style.top = `${anchor.top - cr.top - el.offsetHeight - 8}px`
      } else {
        el.style.left = '50%'
        el.style.top = '72px'
        el.style.transform = 'translateX(-50%)'
      }
    },
    hide() {
      el.hidden = true
    },
    destroy() {
      el.remove()
    },
  }
}
