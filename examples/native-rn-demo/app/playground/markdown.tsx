import { ScrollView, Text, StyleSheet, View } from 'react-native'
import { textBlockToMarkdown, markdownToTextBlock } from '@incantly/canvas-react-native'
import { SceneShell } from '@/components/SceneShell'

const SAMPLES = [
  { type: 'paragraph' as const, content: [{ text: 'Plain text' }] },
  { type: 'heading1' as const, content: [{ text: 'Heading' }] },
  { type: 'paragraph' as const, content: [{ text: 'bold', bold: true }] },
  { type: 'bulletList' as const, content: [{ text: 'List item' }] },
]

export default function MarkdownScene() {
  return (
    <SceneShell title="Markdown serialize" subtitle="W2 — Phase 0" status="ready">
      <ScrollView contentContainerStyle={styles.scroll}>
        {SAMPLES.map((block, i) => {
          const md = textBlockToMarkdown(block)
          const roundTrip = markdownToTextBlock(md, block.type)
          return (
            <View key={i} style={styles.card}>
              <Text style={styles.label}>Block → markdown</Text>
              <Text style={styles.mono}>{md}</Text>
              <Text style={styles.label}>Round-trip type</Text>
              <Text style={styles.mono}>{roundTrip.type}</Text>
            </View>
          )
        })}
      </ScrollView>
    </SceneShell>
  )
}

const styles = StyleSheet.create({
  scroll: { padding: 16, gap: 12 },
  card: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  label: { fontSize: 11, color: '#666', marginBottom: 4, fontWeight: '600' },
  mono: { fontFamily: 'Menlo', fontSize: 13 },
})
