import { SceneShell } from '@/components/SceneShell'
import { CanvasScreen, DEMO_FORMAT_BAR } from '@/components/CanvasScreen'
import { EMPTY_DOCUMENT_SNAPSHOT } from '@/lib/fixtures'

export default function DocumentScene() {
  return (
    <SceneShell
      title="Document mode"
      subtitle="formatBar — custom name + icon per item"
      status="ready"
    >
      <CanvasScreen snapshot={EMPTY_DOCUMENT_SNAPSHOT} formatBar={DEMO_FORMAT_BAR} />
    </SceneShell>
  )
}
