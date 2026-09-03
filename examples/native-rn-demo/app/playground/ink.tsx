import { Text, StyleSheet, View } from 'react-native'
import { SceneShell } from '@/components/SceneShell'

export default function InkScene() {
  return (
    <SceneShell title="Ink overlay (Skia)" subtitle="W4 — Phase 2" status="planned">
      <View style={styles.box}>
        <Text style={styles.title}>Coming in Phase 2</Text>
        <Text style={styles.body}>
          Skia InkOverlay with draw, highlighter, and eraser. Strokes commit to the trailing
          drawing block on pointer up.
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
