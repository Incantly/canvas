import { useEffect, useRef, useState } from 'react'
import { Canvas } from '@incantly/canvas-react'
import type { Editor, Store, TextBlock } from '@incantly/canvas'
import '@incantly/canvas/canvas.css'
import './playground-document-ui.css'
import { playgroundDocumentUi } from './playground-document-ui'

const PLAYGROUND_DOCUMENT_UI = playgroundDocumentUi()

function DocumentActionBar({ editor }: { editor: Editor | null }) {
  const [, refresh] = useState(0)

  useEffect(() => {
    if (!editor) return
    const bump = () => refresh((n) => n + 1)
    const offHistory = editor.store.listenHistory(bump)
    const offEdit = editor.on('edit', bump)
    const offSelection = editor.on('selection', bump)
    return () => {
      offHistory()
      offEdit()
      offSelection()
    }
  }, [editor])

  const canUndo = editor?.store.canUndo ?? false
  const canRedo = editor?.store.canRedo ?? false
  const canCopy = editor?.hasDocumentTextSelection() ?? false

  return (
    <div style={actionBarStyles.wrap} role="toolbar" aria-label="Document actions">
      <button
        type="button"
        style={{ ...actionBarStyles.btn, ...(!canUndo ? actionBarStyles.btnDisabled : {}) }}
        disabled={!canUndo}
        title="Undo — ⌘Z"
        onClick={() => editor?.undo()}
      >
        Undo
      </button>
      <button
        type="button"
        style={{ ...actionBarStyles.btn, ...(!canRedo ? actionBarStyles.btnDisabled : {}) }}
        disabled={!canRedo}
        title="Redo — ⇧⌘Z"
        onClick={() => editor?.redo()}
      >
        Redo
      </button>
      <span style={actionBarStyles.div} aria-hidden />
      <button
        type="button"
        style={{ ...actionBarStyles.btn, ...(!canCopy ? actionBarStyles.btnDisabled : {}) }}
        disabled={!canCopy}
        title="Copy selection — ⌘C"
        onClick={() => void editor?.copySelection()}
      >
        Copy
      </button>
      <button
        type="button"
        style={{ ...actionBarStyles.btn, ...(!canCopy ? actionBarStyles.btnDisabled : {}) }}
        disabled={!canCopy}
        title="Delete selection"
        onClick={() => editor?.deleteSelection()}
      >
        Delete
      </button>
    </div>
  )
}

const actionBarStyles: Record<string, React.CSSProperties> = {
  wrap: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  btn: {
    padding: '6px 10px',
    fontSize: 12,
    border: '1px solid #ccc',
    borderRadius: 6,
    background: '#fff',
    cursor: 'pointer',
  },
  btnDisabled: {
    opacity: 0.45,
    cursor: 'not-allowed',
  },
  div: {
    width: 1,
    height: 20,
    background: '#ddd',
    margin: '0 2px',
  },
}

const SAMPLE_BLOCKS: TextBlock[] = [
  { type: 'heading1', content: [{ text: 'Page document' }] },
  {
    type: 'paragraph',
    content: [
      { text: 'Click the page and type — like Apple Notes. ' },
      { text: 'Bold', bold: true },
      { text: ', ' },
      { text: 'italic', italic: true },
      { text: ', lists, and ' },
      { text: 'links', link: { href: 'https://incantly.com' }, underline: true },
      { text: '.' },
    ],
  },
  { type: 'bulletList', content: [{ text: 'Type / for block menu' }] },
  { type: 'bulletList', content: [{ text: 'Press D — draw anywhere on the page, including over text' }] },
  { type: 'divider', content: [{ text: '' }] },
  { type: 'paragraph', content: [{ text: 'Snapshot stores notebook.document.blocks[] — not HTML.' }] },
]

interface RichTextPanelProps {
  store: Store
  onEditorReady: (editor: Editor | null) => void
}

export function RichTextPanel({ store, onEditorReady }: RichTextPanelProps) {
  const editorRef = useRef<Editor | null>(null)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [documentBackground, setDocumentBackground] = useState('#e8e4dc')
  const [documentPaperColor, setDocumentPaperColor] = useState('#fff8e7')

  const insertSample = () => {
    const editor = editorRef.current
    if (!editor) return
    editor.store.setPageDocument(editor.currentPageId, SAMPLE_BLOCKS)
    editor.refreshPageDocument()
    editor.focusPageDocument()
  }

  const focusPage = () => {
    editorRef.current?.focusPageDocument()
  }

  return (
    <div className="pg-rich-text-panel" style={styles.wrap}>
      <header style={styles.header}>
        <div>
          <strong>03 — Rich text (page document)</strong>
          <p style={styles.hint}>
            One continuous note — scroll down as you type. No page 1 / page 2 chrome.
            Press <strong>/</strong> for headings, lists, divider, code.
            Select text for the formatting bubble (bold, italic, link…).
            Undo/redo in the header or left dock reverses text and pen strokes together.
            Draw (D) anywhere on the page — ink overlays text and images.
          </p>
        </div>
        <div style={styles.actions}>
          <DocumentActionBar editor={editor} />
          <label style={styles.colorLabel}>
            Canvas
            <input
              type="color"
              value={documentBackground.startsWith('#') && documentBackground.length >= 7 ? documentBackground.slice(0, 7) : '#e8e4dc'}
              onChange={(e) => {
                const next = e.target.value
                setDocumentBackground(next)
                editorRef.current?.setDocumentBackground(next)
              }}
              aria-label="Canvas background color"
            />
          </label>
          <label style={styles.colorLabel}>
            Paper
            <input
              type="color"
              value={documentPaperColor.startsWith('#') && documentPaperColor.length >= 7 ? documentPaperColor.slice(0, 7) : '#fff8e7'}
              onChange={(e) => {
                const next = e.target.value
                setDocumentPaperColor(next)
                editorRef.current?.setDocumentPaperColor(next)
              }}
              aria-label="Page paper color"
            />
          </label>
          <button type="button" style={styles.btn} onClick={insertSample}>
            Insert sample
          </button>
          <button type="button" style={styles.btn} onClick={focusPage}>
            Focus page
          </button>
        </div>
      </header>
      <div style={styles.canvas}>
        <Canvas
          store={store}
          documentMode
          touchUi={false}
          grid="none"
          documentBackground={documentBackground}
          documentPaperColor={documentPaperColor}
          documentUi={PLAYGROUND_DOCUMENT_UI}
          onMount={(ed) => {
            editorRef.current = ed
            setEditor(ed)
            onEditorReady(ed)
            ed.fitDocumentView({ animate: 0 })
          }}
        />
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', height: '100%' },
  header: {
    padding: '10px 16px',
    borderBottom: '1px solid #e0e0e0',
    background: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  hint: { margin: 0, fontSize: 12, color: '#555', maxWidth: 520 },
  actions: { display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' },
  colorLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    color: '#444',
  },
  btn: {
    padding: '6px 12px',
    fontSize: 12,
    border: '1px solid #ccc',
    borderRadius: 6,
    background: '#f5f5f5',
    cursor: 'pointer',
  },
  canvas: { flex: 1, minHeight: 0, position: 'relative' },
}
