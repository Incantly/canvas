import { createQuickdraw } from '@quickdrawjs/core'
import type { QuickdrawInstance } from '@quickdrawjs/core'
import '@quickdrawjs/core/quickdraw.css'
import type { FileIndex, FileRecord } from './types/index.js'

const LEGACY_DOC_KEY = 'quickdraw-app-doc'
const THEME_KEY = 'quickdraw-app-theme'
const INDEX_KEY = 'quickdraw-files'
const fileKey = (id: string) => `quickdraw-file:${id}`

const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
const theme = localStorage.getItem(THEME_KEY) || (prefersDark ? 'dark' : 'light')

const board: QuickdrawInstance = createQuickdraw({
  container: document.getElementById('board') as HTMLElement,
  theme,
  grid: 'lines',
})

const { editor } = board
const { store } = editor

const newId = (): string =>
  `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

function loadIndex(): FileIndex | null {
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    if (!raw) return null
    const idx = JSON.parse(raw) as FileIndex
    if (idx && Array.isArray(idx.files) && idx.files.length) return idx
  } catch {}
  return null
}

function saveIndex(): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index))
  } catch {}
}

let index: FileIndex = loadIndex() as FileIndex
if (!index) {
  const id = newId()
  index = { current: id, files: [{ id, name: 'Untitled', updatedAt: Date.now() }] }
  const legacy = localStorage.getItem(LEGACY_DOC_KEY)
  if (legacy) {
    try { localStorage.setItem(fileKey(id), legacy) } catch {}
    localStorage.removeItem(LEGACY_DOC_KEY)
  }
  saveIndex()
}

const currentFile = (): FileRecord =>
  index.files.find((f) => f.id === index.current) || index.files[0]

let saveTimer: ReturnType<typeof setTimeout>

function saveNow(): void {
  clearTimeout(saveTimer)
  const file = currentFile()
  try {
    localStorage.setItem(fileKey(file.id), JSON.stringify(store.getSnapshot()))
    file.updatedAt = Date.now()
    saveIndex()
  } catch {}
}

function openFile(id: string, { fit = true }: { fit?: boolean } = {}): void {
  const file = index.files.find((f) => f.id === id)
  if (!file) return
  index.current = file.id
  saveIndex()
  let snap: any = null
  try {
    const raw = localStorage.getItem(fileKey(file.id))
    if (raw) snap = JSON.parse(raw)
  } catch {
    localStorage.removeItem(fileKey(file.id))
  }
  store.loadSnapshot(snap || { document: { store: {} } }, 'remote')
  store.undos.length = 0
  store.redos.length = 0
  if (fit && snap) editor.fitContent()
  nameInput.value = file.name
}

store.listen(() => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(saveNow, 400)
})

const filebar = document.getElementById('filebar') as HTMLElement
void filebar
const filesBtn = document.getElementById('files-btn') as HTMLButtonElement
const newBtn = document.getElementById('new-file-btn') as HTMLButtonElement
const nameInput = document.getElementById('file-name') as HTMLInputElement
const menu = document.getElementById('files-menu') as HTMLElement
void filebar

function sizeNameInput(): void {
  nameInput.style.width = `${Math.min(20, Math.max(4, nameInput.value.length + 1))}ch`
}

function renderMenu(): void {
  menu.textContent = ''
  const files = [...index.files].sort((a, b) => b.updatedAt - a.updatedAt)
  for (const file of files) {
    const row = document.createElement('div')
    row.className = `qd-file-row${file.id === index.current ? ' current' : ''}`
    row.setAttribute('role', 'menuitem')

    const dot = document.createElement('span')
    dot.className = 'dot'
    const name = document.createElement('span')
    name.className = 'name'
    name.textContent = file.name
    row.append(dot, name)

    if (index.files.length > 1) {
      const del = document.createElement('button')
      del.className = 'del'
      del.type = 'button'
      del.textContent = '×'
      del.title = `Delete "${file.name}"`
      del.setAttribute('aria-label', `Delete ${file.name}`)
      del.addEventListener('click', (e) => {
        e.stopPropagation()
        deleteFile(file.id)
      })
      row.append(del)
    }

    row.addEventListener('click', () => {
      closeMenu()
      if (file.id !== index.current) {
        saveNow()
        openFile(file.id)
      }
    })
    menu.append(row)
  }
}

function openMenu(): void {
  renderMenu()
  menu.hidden = false
  filesBtn.setAttribute('aria-expanded', 'true')
}

function closeMenu(): void {
  menu.hidden = true
  filesBtn.setAttribute('aria-expanded', 'false')
}

filesBtn.addEventListener('click', (e) => {
  e.stopPropagation()
  menu.hidden ? openMenu() : closeMenu()
})

document.addEventListener('pointerdown', (e: PointerEvent) => {
  if (!menu.hidden && !menu.contains(e.target as Node) && e.target !== filesBtn) closeMenu()
})
document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape' && !menu.hidden) closeMenu()
})

function createFile(): void {
  saveNow()
  const id = newId()
  const n = index.files.length + 1
  index.files.push({ id, name: `Untitled ${n}`, updatedAt: Date.now() })
  openFile(id)
  closeMenu()
  nameInput.focus()
  nameInput.select()
}

newBtn.addEventListener('click', createFile)

function deleteFile(id: string): void {
  const file = index.files.find((f) => f.id === id)
  if (!file || index.files.length <= 1) return
  if (!window.confirm(`Delete "${file.name}"? This can't be undone.`)) return
  index.files = index.files.filter((f) => f.id !== id)
  localStorage.removeItem(fileKey(id))
  if (index.current === id) {
    const next = [...index.files].sort((a, b) => b.updatedAt - a.updatedAt)[0]
    openFile(next.id)
  } else {
    saveIndex()
  }
  renderMenu()
}

nameInput.addEventListener('input', sizeNameInput)
nameInput.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Enter') nameInput.blur()
  if (e.key === 'Escape') {
    nameInput.value = currentFile().name
    nameInput.blur()
  }
  e.stopPropagation()
})
nameInput.addEventListener('blur', () => {
  const name = nameInput.value.trim()
  const file = currentFile()
  if (name) {
    file.name = name
  }
  nameInput.value = file.name
  sizeNameInput()
  file.updatedAt = Date.now()
  saveIndex()
})

openFile(currentFile().id, { fit: false })
sizeNameInput()

const syncTheme = (): void => {
  const dark = editor.theme.id === 'dark'
  localStorage.setItem(THEME_KEY, editor.theme.id)
  document.documentElement.classList.toggle('dark', dark)
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#1e1e1c' : '#faf8f4')
}
syncTheme()
editor.on('theme', syncTheme)

window.addEventListener('beforeunload', saveNow)
;(window as any).board = board
