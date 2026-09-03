import { Link } from 'expo-router'
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Incantly Mobile</Text>
        <Text style={styles.lead}>
          Expo demo for the native React Native renderer (roadmap doc 17). Each playground scene
          maps to a plan workstream.
        </Text>

        <Link href="/playground" asChild>
          <Pressable style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>Open Native RN Playground</Text>
          </Pressable>
        </Link>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Before you run</Text>
          <Text style={styles.cardBody}>
            1. Build packages: npm run build:packages{'\n'}
            2. Install: npm install{'\n'}
            3. Start: npm run dev:mobile (or cd examples/native-rn-demo && npx expo start)
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fafafa' },
  content: { padding: 20, gap: 16 },
  heading: { fontSize: 28, fontWeight: '700' },
  lead: { fontSize: 15, lineHeight: 22, color: '#444' },
  primaryBtn: {
    backgroundColor: '#1967d2',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
  },
  cardTitle: { fontSize: 15, fontWeight: '600', marginBottom: 8 },
  cardBody: { fontSize: 13, lineHeight: 20, color: '#555', fontFamily: 'Menlo' },
})
