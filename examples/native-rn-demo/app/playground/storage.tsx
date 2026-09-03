import { useState } from 'react'
import { Text, StyleSheet } from 'react-native'
import { migrateSnapshot } from '@incantly/canvas-react-native'
import { SceneShell } from '@/components/SceneShell'
import { CanvasScreen } from '@/components/CanvasScreen'
import { DemoToolbar } from '@/components/DemoToolbar'
import { DOCUMENT_DEMO_SNAPSHOT } from '@/lib/fixtures'
import { demoPersistence, DEMO_NOTEBOOK_ID } from '@/lib/persistence'

export default function StorageScene() {
  const [log, setLog] = useState('Load or save the demo notebook.')

  return (
    <SceneShell
      title="Persistence"
      subtitle="W6 — AsyncStorage"
      status="ready"
      footer={
        <>
          <DemoToolbar
            actions={[
              {
                label: 'Save',
                onPress: async () => {
                  const snap = migrateSnapshot(DOCUMENT_DEMO_SNAPSHOT)
                  await demoPersistence.save(DEMO_NOTEBOOK_ID, snap)
                  setLog(`Saved notebook ${DEMO_NOTEBOOK_ID}`)
                },
              },
              {
                label: 'Load',
                onPress: async () => {
                  const loaded = await demoPersistence.load(DEMO_NOTEBOOK_ID)
                  setLog(loaded ? `Loaded ${Object.keys(loaded.document.store).length} records` : 'No saved data')
                },
              },
              {
                label: 'Clear',
                onPress: async () => {
                  await demoPersistence.delete(DEMO_NOTEBOOK_ID)
                  setLog('Deleted saved notebook')
                },
              },
            ]}
          />
          <Text style={styles.log}>{log}</Text>
          <Text style={styles.hint}>Kill and reopen the app after Save, then tap Load.</Text>
        </>
      }
    >
      <CanvasScreen snapshot={DOCUMENT_DEMO_SNAPSHOT} />
    </SceneShell>
  )
}

const styles = StyleSheet.create({
  log: { fontSize: 12, color: '#333', fontFamily: 'Menlo' },
  hint: { fontSize: 11, color: '#888' },
})
