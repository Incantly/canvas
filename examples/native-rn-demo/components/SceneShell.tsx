import { ReactNode } from 'react'
import { View, Text, Pressable, StyleSheet, SafeAreaView } from 'react-native'
import { useRouter } from 'expo-router'
import type { SceneStatus } from '@/lib/playground-scenes'

interface SceneShellProps {
  title: string
  subtitle?: string
  status?: SceneStatus
  children: ReactNode
  footer?: ReactNode
}

const STATUS_LABEL: Record<SceneStatus, string> = {
  ready: 'Ready',
  partial: 'Partial',
  planned: 'Planned',
}

const STATUS_COLOR: Record<SceneStatus, string> = {
  ready: '#1e7e34',
  partial: '#1967d2',
  planned: '#5f6368',
}

export function SceneShell({ title, subtitle, status, children, footer }: SceneShellProps) {
  const router = useRouter()

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {status ? (
          <View style={[styles.badge, { backgroundColor: STATUS_COLOR[status] + '22' }]}>
            <Text style={[styles.badgeText, { color: STATUS_COLOR[status] }]}>
              {STATUS_LABEL[status]}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.body}>{children}</View>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  back: { paddingVertical: 4, paddingRight: 8 },
  backText: { fontSize: 16, color: '#1967d2' },
  headerText: { flex: 1 },
  title: { fontSize: 17, fontWeight: '600' },
  subtitle: { fontSize: 13, color: '#666', marginTop: 2 },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  body: { flex: 1 },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e0e0e0',
    padding: 12,
    gap: 8,
  },
})
