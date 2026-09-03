import { useState } from 'react'
import { ScrollView, Text, StyleSheet } from 'react-native'
import {
  Store,
  safeParseSnapshot,
  snapshotFingerprint,
  documentBlocksFingerprint,
  migrateSnapshot,
} from '@incantly/canvas-react-native'
import { SceneShell } from '@/components/SceneShell'
import { DOCUMENT_DEMO_SNAPSHOT } from '@/lib/fixtures'

export default function HeadlessScene() {
  const [output, setOutput] = useState('Tap "Run checks" to exercise headless utils.')

  const runChecks = () => {
    const store = new Store()
    store.loadSnapshot(migrateSnapshot(DOCUMENT_DEMO_SNAPSHOT), 'remote')
    const snap = store.getSnapshot()
    const fp = snapshotFingerprint(snap)
    const blocks = store.notebookDocumentBlocks()
    const blockFp = documentBlocksFingerprint(blocks)
    const parsed = safeParseSnapshot(JSON.stringify(snap))
    const bad = safeParseSnapshot('{not json')

    setOutput(
      [
        `Store pages: ${store.pages().length}`,
        `Document blocks: ${blocks.length}`,
        `snapshotFingerprint length: ${fp.length}`,
        `documentBlocksFingerprint length: ${blockFp.length}`,
        `safeParseSnapshot OK: ${parsed.ok}`,
        `safeParseSnapshot bad JSON: ${bad.ok ? 'unexpected' : bad.code}`,
      ].join('\n'),
    )
  }

  return (
    <SceneShell
      title="Headless store + utils"
      subtitle="W1 — Phase 0"
      status="ready"
      footer={
        <Text onPress={runChecks} style={styles.link}>
          Run checks
        </Text>
      }
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.mono}>{output}</Text>
      </ScrollView>
    </SceneShell>
  )
}

const styles = StyleSheet.create({
  scroll: { padding: 16 },
  mono: { fontFamily: 'Menlo', fontSize: 13, lineHeight: 20 },
  link: { color: '#1967d2', fontWeight: '600', fontSize: 15, textAlign: 'center' },
})
