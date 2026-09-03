import { SceneShell } from '@/components/SceneShell'
import { CanvasScreen, DEMO_INK_BAR, DEMO_INK_PENS } from '@/components/CanvasScreen'
import { EMPTY_DOCUMENT_SNAPSHOT } from '@/lib/fixtures'

export default function OpenCanvasScene() {
  return (
    <SceneShell
      title="Open canvas"
      subtitle="Infinite board — Hand to pan, Cursor to move/resize, Text for boxes (transparent fill by default)"
      status="ready"
    >
      <CanvasScreen
        documentMode={false}
        snapshot={EMPTY_DOCUMENT_SNAPSHOT}
        inkBar={DEMO_INK_BAR}
        inkPens={DEMO_INK_PENS}
      />
    </SceneShell>
  )
}
