import { useEffect, useRef, useState } from 'react'
import { Canvas, useCanvasStore } from '@incantly/canvas-react'
import type { CanvasRef } from '@incantly/canvas-react'
import type { Editor, GridId, ThemeId } from '@incantly/canvas'
import '@incantly/canvas/canvas.css'

const STORAGE_KEY = 'incantly-react-demo'
const LEGACY_STORAGE_KEY = 'quickdraw-react-demo'

const load = (): Parameters<typeof useCanvasStore>[0] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY)
    return raw ? JSON.parse(raw) : undefined
  } catch {
    return undefined
  }
}

declare global {
  interface Window {
    editor?: Editor
  }
}

export default function App() {
  const [theme, setTheme] = useState<ThemeId>('light')
  const [grid, setGrid] = useState<GridId>('lines')
  const boardRef = useRef<CanvasRef>(null)
  const store = useCanvasStore(load())

  useEffect(() => {
    let t = 0
    const unsub = store.listen(() => {
      clearTimeout(t)
      t = window.setTimeout(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store.getSnapshot()))
      }, 500)
    })
    return () => {
      clearTimeout(t)
      unsub()
    }
  }, [store])

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Canvas
        ref={boardRef}
        store={store}
        theme={theme}
        grid={grid}
        autoFit={false}
        onThemeChange={(t) => setTheme(t)}
        onGridChange={(g) => setGrid(g)}
        onMount={(editor) => {
          if (store.size) editor.fitContent()
          window.editor = editor
        }}
      />
      <button
        onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
        style={{
          position: 'fixed',
          top: 10,
          right: 10,
          zIndex: 50,
          font: '500 13px system-ui',
          padding: '6px 12px',
          borderRadius: 999,
          border: '1px solid rgba(0,0,0,0.15)',
          background: '#fff',
          cursor: 'pointer',
        }}
      >
        {theme === 'light' ? 'dark' : 'light'}
      </button>
    </div>
  )
}
