import { useRef, useState } from 'react'
import { Canvas } from '@incantly/canvas-react'
import type { Editor, Store, TextBlock } from '@incantly/canvas'
import '@incantly/canvas/canvas.css'

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
  { type: 'bulletList', content: [{ text: 'Press D — ink goes in a drawing block below text' }] },
  { type: 'divider', content: [{ text: '' }] },
  { type: 'paragraph', content: [{ text: 'Snapshot stores notebook.document.blocks[] — not HTML.' }] },
]

interface RichTextPanelProps {
  store: Store
  onEditorReady: (editor: Editor | null) => void
}

export function RichTextPanel({ store, onEditorReady }: RichTextPanelProps) {
  const editorRef = useRef<Editor | null>(null)
  const [documentBackground, setDocumentBackground] = useState('#fff8e7')

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
    <div style={styles.wrap}>
      <header style={styles.header}>
        <div>
          <strong>03 — Rich text (page document)</strong>
          <p style={styles.hint}>
            One continuous note — scroll down as you type. No page 1 / page 2 chrome.
            Press <strong>/</strong> for headings, lists, divider, code.
            Draw (D) only at the <strong>bottom</strong> ink zone — not on text or between paragraphs.
          </p>
        </div>
        <div style={styles.actions}>
          <label style={styles.colorLabel}>
            Canvas
            <input
              type="color"
              value={documentBackground.startsWith('#') && documentBackground.length >= 7 ? documentBackground.slice(0, 7) : '#fff8e7'}
              onChange={(e) => {
                const next = e.target.value
                setDocumentBackground(next)
                editorRef.current?.setDocumentBackground(next)
              }}
              aria-label="Document background color"
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
          grid="none"
          documentBackground={documentBackground}
            onMount={(editor) => {
              editorRef.current = editor
              onEditorReady(editor)
              editor.fitDocumentView({ animate: 0 })
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
