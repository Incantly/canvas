import { useEffect, useRef, useState } from 'react'
import { Canvas } from '@incantly/canvas-react'
import type { Editor, PageGapPreset, PageLayout, Store } from '@incantly/canvas'
import '@incantly/canvas/canvas.css'

const PAGE_COLORS = ['blue', 'red', 'green'] as const

interface PageCanvasPanelProps {
  store: Store
  onEditorReady: (editor: Editor | null) => void
}

export function PageCanvasPanel({ store, onEditorReady }: PageCanvasPanelProps) {
  const editorRef = useRef<Editor | null>(null)
  const [pageId, setPageId] = useState<string | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [pageLayout, setPageLayoutState] = useState<PageLayout>('vertical')
  const [pageGap, setPageGapState] = useState(48)
  const [gapPreset, setGapPresetState] = useState<PageGapPreset | null>('normal')

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const sync = () => {
      setPageId(editor.currentPageId)
      setPageCount(editor.pages().length)
      setPageLayoutState(editor.pageLayout())
      setPageGapState(editor.pageGap())
      setGapPresetState(editor.pageGapPreset())
    }
    sync()
    const offPage = editor.on('page', sync)
    const offLayout = editor.on('pagelayout', sync)
    const offGap = editor.on('pagegap', sync)
    return () => {
      offPage()
      offLayout()
      offGap()
    }
  }, [editorRef.current, pageId])

  const ensureThreePages = () => {
    const editor = editorRef.current
    if (!editor) return
    while (editor.pages().length < 3) editor.addPage()
  }

  const drawSampleStroke = () => {
    const editor = editorRef.current
    if (!editor) return
    const pages = editor.pages()
    const idx = pages.findIndex((p) => p.id === editor.currentPageId)
    const color = PAGE_COLORS[idx] ?? 'black'
    const cx = 120 + idx * 40
    const cy = 120 + idx * 30
    editor.store.transact(() => {
      editor.store.put({
        id: `demo-${idx}-${Date.now()}`,
        typeName: 'shape',
        type: 'draw',
        parentId: editor.currentPageId,
        x: cx,
        y: cy,
        rot: 0,
        z: editor.store.maxZ() + 1,
        props: {
          pts: [0, 0, 0.5, 80, 20, 0.5, 160, -10, 0.5],
          color,
          size: 'm',
          dash: 'draw',
          done: true,
        },
      } as any)
    })
    editor.requestRender()
  }

  return (
    <div style={styles.wrap}>
      <header style={styles.header}>
        <div>
          <strong>02 — Page-based canvas</strong>
          <p style={styles.hint}>
            Page 1 always stays first. Vertical ↕ stacks 1, 2, 3 downward. Horizontal ↔
            places 1, 2, 3 in a row to the right. Press <strong>+</strong> to add a page — your
            view stays put. Use <strong>›</strong> to switch pages. Spacing: <strong>−</strong> /{' '}
            <strong>linked</strong> / <strong>+</strong> in the page bar (connected = no gap).
          </p>
        </div>
        <div style={styles.actions}>
          <button type="button" style={styles.btn} onClick={ensureThreePages}>
            Create 3 pages
          </button>
          <button type="button" style={styles.btn} onClick={drawSampleStroke}>
            Draw sample stroke
          </button>
          <button
            type="button"
            style={styles.btn}
            onClick={() => {
              const editor = editorRef.current
              if (!editor) return
              editor.setPageLayout(pageLayout === 'vertical' ? 'horizontal' : 'vertical')
            }}
          >
            Layout: {pageLayout === 'vertical' ? 'Vertical ↕' : 'Horizontal ↔'}
          </button>
          <button
            type="button"
            style={{ ...styles.btn, ...(pageCount <= 1 ? styles.btnDisabled : {}) }}
            disabled={pageCount <= 1}
            onClick={() => {
              const editor = editorRef.current
              if (!editor || editor.pages().length <= 1) return
              editor.removePage(editor.currentPageId)
            }}
          >
            Delete page
          </button>
          <button
            type="button"
            style={styles.btn}
            onClick={() => editorRef.current?.setPageGapPreset('connected')}
          >
            Connected pages
          </button>
          <button type="button" style={styles.btn} onClick={() => editorRef.current?.adjustPageGap(-16)}>
            Spacing −
          </button>
          <button type="button" style={styles.btn} onClick={() => editorRef.current?.adjustPageGap(16)}>
            Spacing +
          </button>
        </div>
        <p style={styles.meta}>
          Page {pageCount ? pagesLabel(editorRef.current) : '—'} · {pageCount} total · layout{' '}
          {pageLayout} · gap {gapPreset === 'connected' ? 'linked (0)' : `${pageGap}px`}
        </p>
      </header>
      <div style={styles.canvas}>
        <Canvas
          store={store}
          grid="lines"
          onMount={(editor) => {
            editorRef.current = editor
            onEditorReady(editor)
            editor.fitPage({ animate: 0 })
            setPageId(editor.currentPageId)
            setPageCount(editor.pages().length)
            setPageLayoutState(editor.pageLayout())
            setPageGapState(editor.pageGap())
            setGapPresetState(editor.pageGapPreset())
          }}
        />
      </div>
    </div>
  )
}

function pagesLabel(editor: Editor | null): string {
  if (!editor) return '—'
  const pages = editor.pages()
  const idx = pages.findIndex((p) => p.id === editor.currentPageId)
  return idx >= 0 ? `${idx + 1} / ${pages.length}` : '—'
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', height: '100%' },
  header: {
    padding: '12px 16px',
    borderBottom: '1px solid #e0e0e0',
    background: '#fff',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  hint: { margin: 0, fontSize: 12, color: '#555', maxWidth: 560 },
  meta: { margin: 0, fontSize: 12, color: '#333', fontVariantNumeric: 'tabular-nums' },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  btn: {
    padding: '6px 12px',
    fontSize: 12,
    border: '1px solid #ccc',
    borderRadius: 6,
    background: '#f5f5f5',
    cursor: 'pointer',
  },
  btnDisabled: { opacity: 0.45, cursor: 'not-allowed' },
  canvas: { flex: 1, minHeight: 0, position: 'relative' },
}
