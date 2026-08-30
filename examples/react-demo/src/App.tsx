import { useEffect, useRef, useState } from 'react'
import { Quickdraw, useQuickdrawStore } from '@quickdrawjs/react'
import type { QuickdrawRef } from '@quickdrawjs/react'
import type { Editor, GridId, ThemeId } from '@quickdrawjs/core'
import '@quickdrawjs/core/quickdraw.css'

const STORAGE_KEY = 'quickdraw-react-demo'

const load = (): Parameters<typeof useQuickdrawStore>[0] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
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
  const boardRef = useRef<QuickdrawRef>(null)
  const store = useQuickdrawStore(load())

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
      <Quickdraw
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
