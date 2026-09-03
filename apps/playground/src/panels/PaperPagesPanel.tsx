import { useEffect, useRef, useState } from 'react'
import { Canvas } from '@incantly/canvas-react'
import type { Editor, Store } from '@incantly/canvas'
import '@incantly/canvas/canvas.css'

interface PaperPagesPanelProps {
  store: Store
  onEditorReady: (editor: Editor | null) => void
}

export function PaperPagesPanel({ store, onEditorReady }: PaperPagesPanelProps) {
  const editorRef = useRef<Editor | null>(null)
  const [pageLabel, setPageLabel] = useState('1 / 1')

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const sync = () => {
      const pages = editor.pages()
      const idx = pages.findIndex((p) => p.id === editor.currentPageId)
      setPageLabel(pages.length ? `${idx + 1} / ${pages.length}` : '—')
    }
    sync()
    return editor.on('page', sync)
  }, [editorRef.current, pageLabel])

  return (
    <div style={styles.wrap}>
      <header style={styles.header}>
        <div>
          <strong>18 — Document paper pages</strong>
          <p style={styles.hint}>
            Discrete sheets (Page 1, Page 2). Use the page bar to add / switch / delete.
            Cycle <strong>Letter / A4</strong> — overflow uses that paper’s content box.
            Typing past the bottom continues on the next sheet of the same size.
            Pinch, ⌘+/−, or ctrl+wheel to zoom; drag with Hand or space to pan.
          </p>
        </div>
        <div style={styles.meta}>{pageLabel}</div>
      </header>
      <div style={styles.canvas}>
        <Canvas
          store={store}
          documentMode
          touchUi={false}
          grid="none"
          documentBackground="#e8e4dc"
          documentPaperColor="#fffef8"
          hidePagesBar={false}
          onMount={(ed) => {
            editorRef.current = ed
            onEditorReady(ed)
            const pages = ed.pages()
            if (pages.length === 1) {
              ed.setPagePaper(pages[0]!.id, { paperStyle: 'ruled' })
            }
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
  },
  hint: { margin: 0, fontSize: 12, color: '#555', maxWidth: 560 },
  meta: { fontVariantNumeric: 'tabular-nums', color: '#555', fontSize: 13 },
  canvas: { flex: 1, minHeight: 0, position: 'relative' },
}
