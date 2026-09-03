import { useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, Text, StyleSheet, ActivityIndicator, View } from 'react-native'
import type { CanvasRef, VersionStorage, VersionSummary } from '@incantly/canvas-react-native'
import { SceneShell } from '@/components/SceneShell'
import { CanvasScreen } from '@/components/CanvasScreen'
import { DemoToolbar } from '@/components/DemoToolbar'
import { EMPTY_DOCUMENT_SNAPSHOT } from '@/lib/fixtures'
import { getDemoVersionStorage, VERSIONS_NOTEBOOK_ID } from '@/lib/version-storage'

export default function VersionsScene() {
  const ref = useRef<CanvasRef | null>(null)
  const [storage, setStorage] = useState<VersionStorage | null>(null)
  const [versions, setVersions] = useState<VersionSummary[]>([])
  const [log, setLog] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    getDemoVersionStorage()
      .then((s) => {
        if (!cancelled) setStorage(s)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const refresh = async () => {
    const list = await ref.current?.listVersions()
    setVersions(list ?? [])
    return list ?? []
  }

  if (error) {
    return (
      <SceneShell title="Version history" subtitle="SQLite failed to open" status="partial">
        <Text style={styles.banner}>{error}</Text>
      </SceneShell>
    )
  }

  if (!storage) {
    return (
      <SceneShell title="Version history" subtitle="Opening SQLite…" status="ready">
        <View style={styles.loading}>
          <ActivityIndicator />
          <Text style={styles.hint}>Opening incantly-versions.db</Text>
        </View>
      </SceneShell>
    )
  }

  return (
    <SceneShell
      title="Version history"
      subtitle="W6 — expo-sqlite · survives app restart"
      status="ready"
      footer={
        <>
          <DemoToolbar
            actions={[
              {
                label: 'Save version',
                onPress: async () => {
                  try {
                    const v = await ref.current?.saveVersion(
                      `Checkpoint ${new Date().toLocaleTimeString()}`,
                    )
                    setLog(v ? `Saved ${v.label ?? v.id}` : 'Save failed')
                    await refresh()
                  } catch (e) {
                    setLog(e instanceof Error ? e.message : String(e))
                  }
                },
              },
              {
                label: 'Refresh list',
                onPress: async () => {
                  const list = await refresh()
                  setLog(`${list.length} version${list.length === 1 ? '' : 's'}`)
                },
              },
            ]}
          />
          <Text style={styles.log}>{log}</Text>
        </>
      }
    >
      <Text style={styles.banner}>
        Type below, tap Save version, kill the app, reopen this scene — the list should still be
        there. Tap a row to revert.
      </Text>
      <CanvasScreen
        snapshot={EMPTY_DOCUMENT_SNAPSHOT}
        versionStorage={storage}
        notebookId={VERSIONS_NOTEBOOK_ID}
        onError={setLog}
        onReady={(api) => {
          ref.current = api
          void refresh()
        }}
      />
      <ScrollView style={styles.list}>
        {versions.length === 0 ? (
          <Text style={styles.empty}>No saved versions yet.</Text>
        ) : (
          versions.map((v) => (
            <Pressable
              key={v.id}
              style={styles.versionRow}
              onPress={async () => {
                try {
                  await ref.current?.revertVersion(v.id)
                  setLog(`Reverted to ${v.label ?? v.id}`)
                  await refresh()
                } catch (e) {
                  setLog(e instanceof Error ? e.message : String(e))
                }
              }}
            >
              <Text style={styles.versionTitle}>{v.label ?? v.id}</Text>
              <Text style={styles.versionMeta}>
                {v.kind} · {new Date(v.createdAt).toLocaleString()}
              </Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    </SceneShell>
  )
}

const styles = StyleSheet.create({
  banner: {
    fontSize: 13,
    color: '#444',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#f0f4ff',
    lineHeight: 18,
  },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  hint: { fontSize: 12, color: '#888' },
  log: { fontSize: 12, fontFamily: 'Menlo', color: '#333', paddingHorizontal: 8 },
  list: { maxHeight: 160, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#eee' },
  empty: { fontSize: 12, color: '#888', padding: 12 },
  versionRow: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f0f0f0' },
  versionTitle: { fontSize: 13, fontWeight: '600', color: '#111' },
  versionMeta: { fontSize: 11, color: '#666', marginTop: 2 },
})
