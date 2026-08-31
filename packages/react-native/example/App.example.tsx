/**
 * Reference Expo screen — copy into apps/mobile when the shell lands.
 * RN document mode smoke test: notes typing + draw tool.
 * Version history is session-scoped (MemoryVersionStorage inside the WebView).
 */
import { useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import { Canvas, type CanvasRef } from '@incantly/canvas-react-native'

export default function PlaygroundScreen() {
  const ref = useRef<CanvasRef>(null)

  return (
    <View style={styles.root}>
      <Canvas
        ref={ref}
        style={styles.canvas}
        documentMode
        hidePagesBar
        touchUi
        onReady={async () => {
          ref.current?.setTool('select')
          // Session-scoped version smoke: save a checkpoint and list metadata.
          await ref.current?.saveVersion('Example checkpoint')
          await ref.current?.listVersions()
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  canvas: { flex: 1 },
})
