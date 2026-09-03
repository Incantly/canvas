import { useRef, useState } from 'react'
import { Text, StyleSheet } from 'react-native'
import type { CanvasRef } from '@incantly/canvas-react-native'
import { SceneShell } from '@/components/SceneShell'
import { CanvasScreen } from '@/components/CanvasScreen'
import { DemoToolbar } from '@/components/DemoToolbar'
import { DOCUMENT_DEMO_SNAPSHOT } from '@/lib/fixtures'

export default function StoreBridgeScene() {
  const ref = useRef<CanvasRef | null>(null)
  const [log, setLog] = useState('Ready.')

  const canvasRef = (api: CanvasRef) => {
    ref.current = api
  }

  return (
    <SceneShell
      title="CanvasRef / undo"
      subtitle="W3 — StoreBridge"
      status="ready"
      footer={
        <>
          <DemoToolbar
            actions={[
              {
                label: 'Draw tool',
                onPress: () => {
                  ref.current?.setTool('draw')
                  setLog('Tool: draw')
                },
              },
              {
                label: 'Select',
                onPress: () => {
                  ref.current?.setTool('select')
                  setLog('Tool: select')
                },
              },
              {
                label: 'Undo',
                onPress: () => {
                  ref.current?.undo()
                  setLog('undo()')
                },
              },
              {
                label: 'Redo',
                onPress: () => {
                  ref.current?.redo()
                  setLog('redo()')
                },
              },
              {
                label: 'Snapshot',
                onPress: async () => {
                  const snap = await ref.current?.getSnapshot()
                  const keys = Object.keys(snap?.document.store ?? {})
                  setLog(`getSnapshot: ${keys.length} records`)
                },
              },
            ]}
          />
          <Text style={styles.log}>{log}</Text>
        </>
      }
    >
      <CanvasScreen snapshot={DOCUMENT_DEMO_SNAPSHOT} onReady={canvasRef} />
    </SceneShell>
  )
}

const styles = StyleSheet.create({
  log: { fontSize: 12, color: '#555', fontFamily: 'Menlo' },
})
