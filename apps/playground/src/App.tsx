import { useState } from 'react'
import { useCanvasStore } from '@incantly/canvas-react'
import type { Editor } from '@incantly/canvas'
import { FeatureIndex } from './panels/FeatureIndex'
import { CanvasDemoPanel } from './panels/CanvasDemoPanel'
import { PageCanvasPanel } from './panels/PageCanvasPanel'
import { RichTextPanel } from './panels/RichTextPanel'
import { VersionHistoryPanel } from './panels/VersionHistoryPanel'
import { PaperPagesPanel } from './panels/PaperPagesPanel'
import { DebugPanel } from './components/DebugPanel'
import './app.css'

export default function App() {
  const store = useCanvasStore()
  const [selectedPanel, setSelectedPanel] = useState('03')
  const [editor, setEditor] = useState<Editor | null>(null)
  const [mobilePanel, setMobilePanel] = useState<'features' | 'debug' | null>(null)

  return (
    <div className="playground-shell">
      {mobilePanel && <button className="playground-scrim" aria-label="Close panel" onClick={() => setMobilePanel(null)} />}
      <aside className={`playground-sidebar ${mobilePanel === 'features' ? 'is-open' : ''}`}>
        <header className="playground-sidebar-header">
          <strong>Incantly Playground</strong>
          <button className="playground-close" onClick={() => setMobilePanel(null)} aria-label="Close features">×</button>
        </header>
        <FeatureIndex selectedId={selectedPanel} onSelect={(id) => { setSelectedPanel(id); setMobilePanel(null) }} />
      </aside>

      <main className="playground-main">
        <nav className="playground-mobile-nav" aria-label="Playground panels">
          <button onClick={() => setMobilePanel('features')}>Features</button>
          <button onClick={() => setMobilePanel('debug')}>Debug</button>
        </nav>
        {selectedPanel === '01' ? (
          <CanvasDemoPanel store={store} onEditorReady={setEditor} />
        ) : selectedPanel === '02' ? (
          <PageCanvasPanel store={store} onEditorReady={setEditor} />
        ) : selectedPanel === '03' ? (
          <RichTextPanel store={store} onEditorReady={setEditor} />
        ) : selectedPanel === '16' ? (
          <VersionHistoryPanel store={store} onEditorReady={setEditor} />
        ) : selectedPanel === '18' ? (
          <PaperPagesPanel store={store} onEditorReady={setEditor} />
        ) : (
          <div style={styles.placeholder}>
            <p style={styles.placeholderTitle}>Coming soon</p>
            <p style={styles.placeholderHint}>This feature demo will land with its roadmap merge.</p>
          </div>
        )}
      </main>

      <aside className={`playground-debug ${mobilePanel === 'debug' ? 'is-open' : ''}`}>
        <button className="playground-close playground-debug-close" onClick={() => setMobilePanel(null)} aria-label="Close debug panel">×</button>
        <DebugPanel store={store} editor={editor} />
      </aside>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
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
