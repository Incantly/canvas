import { useEffect, useState } from 'react'
import type { Editor, Store } from '@incantly/canvas'
import emptyFixture from '../fixtures/empty.json'

interface DebugPanelProps {
  store: Store
  editor: Editor | null
}

export function DebugPanel({ store, editor }: DebugPanelProps) {
  const [snapshotOpen, setSnapshotOpen] = useState(true)
  const [, tick] = useState(0)

  useEffect(() => {
    const bump = () => tick((n) => n + 1)
    const unsubStore = store.listen(bump)
    const unsubCamera = editor?.on('camera', bump)
    return () => {
      unsubStore()
      unsubCamera?.()
    }
  }, [store, editor])

  const snapshot = store.getSnapshot()
  const camera = editor?.camera

  const handleReset = () => {
    store.clear()
    editor?.setCamera({ x: 0, y: 0, z: 1 })
  }

  const handleLoadEmpty = () => {
    store.loadSnapshot(emptyFixture, 'remote')
    editor?.setCamera({ x: 0, y: 0, z: 1 })
  }

  return (
    <div style={styles.panel}>
      <header style={styles.header}>
        <strong>Debug</strong>
      </header>

      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>Store</h3>
        <dl style={styles.dl}>
          <dt>store.size</dt>
          <dd>{store.size}</dd>
        </dl>
      </section>

      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>Camera</h3>
        {camera ? (
          <dl style={styles.dl}>
            <dt>z</dt>
            <dd>{camera.z.toFixed(4)}</dd>
            <dt>x</dt>
            <dd>{camera.x.toFixed(2)}</dd>
            <dt>y</dt>
            <dd>{camera.y.toFixed(2)}</dd>
          </dl>
        ) : (
          <p style={styles.muted}>Mount a canvas panel to inspect camera state.</p>
        )}
      </section>

      <section style={styles.section}>
        <button type="button" style={styles.toggle} onClick={() => setSnapshotOpen((o) => !o)}>
          Snapshot JSON {snapshotOpen ? '▾' : '▸'}
        </button>
        {snapshotOpen && (
          <pre style={styles.pre}>{JSON.stringify(snapshot, null, 2)}</pre>
        )}
      </section>

      <section style={styles.actions}>
        <button type="button" style={styles.button} onClick={handleReset}>
          Reset
        </button>
        <button type="button" style={styles.buttonSecondary} onClick={handleLoadEmpty}>
          Load empty fixture
        </button>
      </section>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  header: {
    fontSize: 14,
    paddingBottom: 8,
    borderBottom: '1px solid #e0e0e0',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: '#666',
  },
  dl: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    gap: '4px 12px',
    margin: 0,
    fontVariantNumeric: 'tabular-nums',
  },
  muted: {
    margin: 0,
    color: '#888',
    fontSize: 12,
  },
  toggle: {
    alignSelf: 'flex-start',
    padding: 0,
    border: 'none',
    background: 'none',
    font: 'inherit',
    fontWeight: 600,
    cursor: 'pointer',
    color: '#1967d2',
  },
  pre: {
    margin: 0,
    padding: 10,
    background: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: 6,
    fontSize: 11,
    lineHeight: 1.45,
    overflow: 'auto',
    maxHeight: 280,
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    paddingTop: 4,
  },
  button: {
    padding: '8px 12px',
    border: '1px solid #d93025',
    borderRadius: 6,
    background: '#fff',
    color: '#d93025',
    font: 'inherit',
    fontWeight: 500,
    cursor: 'pointer',
  },
  buttonSecondary: {
    padding: '8px 12px',
    border: '1px solid #dadce0',
    borderRadius: 6,
    background: '#fff',
    font: 'inherit',
    fontWeight: 500,
    cursor: 'pointer',
  },
}
