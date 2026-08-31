/**
 * Reference Expo screen — copy into apps/mobile when the shell lands.
 * rn: full Canvas in WebView; draw + undo smoke test.
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
        onMount={() => {
          ref.current?.setTool('draw')
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  canvas: { flex: 1 },
})
