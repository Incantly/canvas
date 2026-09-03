import { Text, StyleSheet, View } from 'react-native'
import { SceneShell } from '@/components/SceneShell'

export default function ShapesScene() {
  return (
    <SceneShell title="Shapes (line/arrow/geo)" subtitle="W5 — Phase 3" status="planned">
      <View style={styles.box}>
        <Text style={styles.title}>Coming in Phase 3</Text>
        <Text style={styles.body}>
          Skia ShapeLayer for line, arrow, and geo shapes parented to the page. Select tool +
          tap-drag to create.
        </Text>
      </View>
    </SceneShell>
  )
}

const styles = StyleSheet.create({
  box: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 12 },
  body: { fontSize: 15, lineHeight: 22, color: '#555' },
})
