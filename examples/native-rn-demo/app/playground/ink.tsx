import { SceneShell } from '@/components/SceneShell'
import { CanvasScreen, DEMO_FORMAT_BAR, DEMO_INK_BAR, DEMO_INK_PENS } from '@/components/CanvasScreen'
import { INK_DEMO_SNAPSHOT } from '@/lib/fixtures'

export default function InkScene() {
  return (
    <SceneShell
      title="Ink overlay (SVG)"
      subtitle="Host icons + custom pens — Pencil uses pressure; strokes commit on lift"
      status="ready"
    >
      <CanvasScreen
        snapshot={INK_DEMO_SNAPSHOT}
        formatBar={DEMO_FORMAT_BAR}
        inkBar={DEMO_INK_BAR}
        inkPens={DEMO_INK_PENS}
      />
    </SceneShell>
  )
}
