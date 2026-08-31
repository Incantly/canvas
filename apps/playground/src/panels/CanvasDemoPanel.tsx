import { useEffect } from 'react'
import { Canvas } from '@incantly/canvas-react'
import type { Store, Editor } from '@incantly/canvas'
import '@incantly/canvas/canvas.css'

interface CanvasDemoPanelProps {
  store: Store
  onEditorReady: (editor: Editor | null) => void
}

export function CanvasDemoPanel({ store, onEditorReady }: CanvasDemoPanelProps) {
  useEffect(() => {
    return () => onEditorReady(null)
  }, [onEditorReady])

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Canvas
        store={store}
        autoFit={false}
        onMount={(editor) => {
          onEditorReady(editor)
        }}
      />
    </div>
  )
}
