import { SceneShell } from '@/components/SceneShell'
import { CanvasScreen, DEMO_FORMAT_BAR } from '@/components/CanvasScreen'
import { EMPTY_DOCUMENT_SNAPSHOT } from '@/lib/fixtures'

export default function PaperPagesScene() {
  return (
    <SceneShell
      title="Paper pages"
      subtitle="Discrete sheets — select across Enter, overflow continues on the next page"
      status="ready"
    >
      <CanvasScreen snapshot={EMPTY_DOCUMENT_SNAPSHOT} formatBar={DEMO_FORMAT_BAR} />
    </SceneShell>
  )
}
