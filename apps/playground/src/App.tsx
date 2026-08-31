import { useState } from 'react'
import { useCanvasStore } from '@incantly/canvas-react'
import type { Editor } from '@incantly/canvas'
import { FeatureIndex } from './panels/FeatureIndex'
import { CanvasDemoPanel } from './panels/CanvasDemoPanel'
import { PageCanvasPanel } from './panels/PageCanvasPanel'
import { RichTextPanel } from './panels/RichTextPanel'
import { DebugPanel } from './components/DebugPanel'

export default function App() {
  const store = useCanvasStore()
  const [selectedPanel, setSelectedPanel] = useState('03')
  const [editor, setEditor] = useState<Editor | null>(null)

  return (
    <div style={styles.root}>
      <aside style={styles.sidebar}>
        <header style={styles.sidebarHeader}>
          <strong>Incantly Playground</strong>
        </header>
        <FeatureIndex selectedId={selectedPanel} onSelect={setSelectedPanel} />
      </aside>

      <main style={styles.main}>
        {selectedPanel === '01' ? (
          <CanvasDemoPanel store={store} onEditorReady={setEditor} />
        ) : selectedPanel === '02' ? (
          <PageCanvasPanel store={store} onEditorReady={setEditor} />
        ) : selectedPanel === '03' ? (
          <RichTextPanel store={store} onEditorReady={setEditor} />
        ) : (
          <div style={styles.placeholder}>
            <p style={styles.placeholderTitle}>Coming soon</p>
            <p style={styles.placeholderHint}>This feature demo will land with its roadmap merge.</p>
          </div>
        )}
      </main>

      <aside style={styles.debug}>
        <DebugPanel store={store} editor={editor} />
      </aside>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    height: '100vh',
    fontFamily: 'system-ui, sans-serif',
    fontSize: 13,
    color: '#1a1a1a',
  },
  sidebar: {
    width: 240,
    flexShrink: 0,
    borderRight: '1px solid #e0e0e0',
    display: 'flex',
    flexDirection: 'column',
    background: '#fafafa',
  },
  sidebarHeader: {
    padding: '12px 14px',
    borderBottom: '1px solid #e0e0e0',
    fontSize: 14,
  },
  main: {
    flex: 1,
    minWidth: 0,
    position: 'relative',
  },
  debug: {
    width: 320,
    flexShrink: 0,
    borderLeft: '1px solid #e0e0e0',
    background: '#fafafa',
    overflow: 'auto',
  },
  placeholder: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: '#666',
    gap: 8,
  },
  placeholderTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 600,
  },
  placeholderHint: {
    margin: 0,
    fontSize: 13,
  },
}
