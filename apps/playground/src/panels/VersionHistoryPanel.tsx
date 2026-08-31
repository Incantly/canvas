import { useCallback, useEffect, useRef, useState } from 'react'
import { Canvas } from '@incantly/canvas-react'
import type { DocumentVersion, Editor, Store, VersionKind, VersionManager } from '@incantly/canvas'
import { createVersionManager, MemoryVersionStorage } from '@incantly/canvas'
import '@incantly/canvas/canvas.css'

interface VersionHistoryPanelProps {
  store: Store
  onEditorReady: (editor: Editor | null) => void
}

const KIND_LABEL: Record<VersionKind, string> = {
  autosave: 'Autosave',
  manual: 'Manual',
  revert: 'Revert checkpoint',
  import: 'Import',
}

export function VersionHistoryPanel({ store, onEditorReady }: VersionHistoryPanelProps) {
  const editorRef = useRef<Editor | null>(null)
  const managerRef = useRef<VersionManager | null>(null)
  const [versions, setVersions] = useState<DocumentVersion[]>([])
  const [busy, setBusy] = useState(false)

  const refreshVersions = useCallback(async () => {
    const manager = managerRef.current
    if (!manager) return
    const list = await manager.list()
    setVersions(list)
  }, [])

  useEffect(() => {
    const storage = new MemoryVersionStorage()
    const manager = createVersionManager({
      storage,
      store,
      autosaveMs: 5000,
      onVersionsChange: () => {
        void refreshVersions()
      },
    })
    managerRef.current = manager
    void refreshVersions()

    return () => {
      manager.dispose()
      managerRef.current = null
    }
  }, [store, refreshVersions])

  const saveVersion = async () => {
    const manager = managerRef.current
    if (!manager || busy) return
    const label = window.prompt('Version label (optional):')
    if (label === null) return
    setBusy(true)
    try {
      await manager.checkpoint('manual', label.trim() || undefined)
      await refreshVersions()
    } finally {
      setBusy(false)
    }
  }

  const restoreVersion = async (version: DocumentVersion) => {
    const manager = managerRef.current
    if (!manager || busy) return
    const title = version.label ?? KIND_LABEL[version.kind]
    const when = formatTimestamp(version.createdAt)
    const ok = window.confirm(
      `Restore "${title}" from ${when}?\n\nCurrent edits will be replaced.`,
    )
    if (!ok) return
    setBusy(true)
    try {
      await manager.revert(version.id)
      editorRef.current?.refreshPageDocument()
      await refreshVersions()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={styles.wrap}>
      <header style={styles.header}>
        <div>
          <strong>16 — Snapshot versioning</strong>
          <p style={styles.hint}>
            Edit the document — autosave checkpoints appear after 5s of inactivity. Save named
            versions manually, then restore from the list.
          </p>
        </div>
      </header>
      <div style={styles.body}>
        <div style={styles.canvas}>
          <Canvas
            store={store}
            documentMode
            touchUi={false}
            grid="none"
            onMount={(editor) => {
              editorRef.current = editor
              onEditorReady(editor)
              editor.fitDocumentView({ animate: 0 })
            }}
          />
        </div>
        <aside style={styles.sidebar}>
          <div style={styles.sidebarHeader}>
            <strong>Version history</strong>
            <button
              type="button"
              style={{ ...styles.btn, ...(busy ? styles.btnDisabled : {}) }}
              disabled={busy}
              onClick={() => void saveVersion()}
            >
              Save version
            </button>
          </div>
          {versions.length === 0 ? (
            <p style={styles.empty}>No versions yet. Edit the document or save manually.</p>
          ) : (
            <ul style={styles.list}>
              {versions.map((version) => (
                <li key={version.id} style={styles.item}>
                  <div style={styles.itemMeta}>
                    <span style={styles.timestamp}>{formatTimestamp(version.createdAt)}</span>
                    <span style={styles.kindBadge}>{KIND_LABEL[version.kind]}</span>
                  </div>
                  {version.label ? (
                    <span style={styles.label}>{version.label}</span>
                  ) : null}
                  <button
                    type="button"
                    style={{ ...styles.restoreBtn, ...(busy ? styles.btnDisabled : {}) }}
                    disabled={busy}
                    onClick={() => void restoreVersion(version)}
                  >
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  )
}

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', height: '100%' },
  header: {
    padding: '10px 16px',
    borderBottom: '1px solid #e0e0e0',
    background: '#fff',
  },
  hint: { margin: 0, fontSize: 12, color: '#555', maxWidth: 640 },
  body: { display: 'flex', flex: 1, minHeight: 0 },
  canvas: { flex: 1, minWidth: 0, position: 'relative' },
  sidebar: {
    width: 280,
    flexShrink: 0,
    borderLeft: '1px solid #e0e0e0',
    background: '#fafafa',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  sidebarHeader: {
    padding: '12px 14px',
    borderBottom: '1px solid #e0e0e0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    background: '#fff',
  },
  btn: {
    padding: '6px 12px',
    fontSize: 12,
    border: '1px solid #ccc',
    borderRadius: 6,
    background: '#f5f5f5',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  btnDisabled: { opacity: 0.45, cursor: 'not-allowed' },
  empty: { margin: 0, padding: '16px 14px', fontSize: 12, color: '#666' },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: '8px 0',
    overflow: 'auto',
    flex: 1,
  },
  item: {
    padding: '10px 14px',
    borderBottom: '1px solid #eee',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  itemMeta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  timestamp: {
    fontSize: 11,
    color: '#444',
    fontVariantNumeric: 'tabular-nums',
  },
  kindBadge: {
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase',
    padding: '2px 6px',
    borderRadius: 4,
    background: '#e8f0fe',
    color: '#1967d2',
    flexShrink: 0,
  },
  label: {
    fontSize: 12,
    fontWeight: 500,
    color: '#1a1a1a',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  restoreBtn: {
    alignSelf: 'flex-start',
    padding: '4px 10px',
    fontSize: 11,
    border: '1px solid #ccc',
    borderRadius: 6,
    background: '#fff',
    cursor: 'pointer',
  },
}
