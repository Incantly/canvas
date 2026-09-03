import { SceneShell } from '@/components/SceneShell'
import { CanvasScreen, DEMO_FORMAT_BAR, DEMO_INK_BAR, DEMO_INK_PENS } from '@/components/CanvasScreen'
import { EMPTY_DOCUMENT_SNAPSHOT } from '@/lib/fixtures'

export default function ShapesScene() {
  return (
    <SceneShell
      title="Shapes (line/arrow/geo)"
      subtitle="On paper notes — Type to write in the column; Cursor to select, move, and resize shapes"
      status="ready"
    >
      <CanvasScreen
        snapshot={EMPTY_DOCUMENT_SNAPSHOT}
        formatBar={DEMO_FORMAT_BAR}
        inkBar={DEMO_INK_BAR}
        inkPens={DEMO_INK_PENS}
      />
    </SceneShell>
  )
}
