import { Link } from 'expo-router'
import { View, Text, Pressable, StyleSheet, SafeAreaView, ScrollView } from 'react-native'
import { PLAYGROUND_SCENES, type SceneStatus } from '@/lib/playground-scenes'

const STATUS_COLOR: Record<SceneStatus, string> = {
  ready: '#1e7e34',
  partial: '#1967d2',
  planned: '#9aa0a6',
}

export default function PlaygroundIndex() {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Native RN Playground</Text>
        <Text style={styles.lead}>
          One scene per roadmap 17 workstream. Tap to open the demo screen.
        </Text>

        {PLAYGROUND_SCENES.map((scene) => (
          <Link key={scene.id} href={scene.route as never} asChild>
            <Pressable style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.ws}>{scene.workstream}</Text>
                <Text style={[styles.status, { color: STATUS_COLOR[scene.status] }]}>
                  {scene.status}
                </Text>
              </View>
              <Text style={styles.title}>{scene.title}</Text>
              <Text style={styles.desc}>{scene.description}</Text>
              <Text style={styles.phase}>{scene.phase}</Text>
            </Pressable>
          </Link>
        ))}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fafafa' },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  heading: { fontSize: 24, fontWeight: '700' },
  lead: { fontSize: 14, color: '#555', marginBottom: 4 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  ws: { fontSize: 12, fontWeight: '700', color: '#666' },
  status: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  title: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  desc: { fontSize: 13, color: '#555', lineHeight: 18 },
  phase: { fontSize: 11, color: '#888', marginTop: 8 },
})
