/**
 * Reference Expo screen — copy into apps/mobile when the shell lands.
 * RN document mode smoke test: notes typing + draw tool.
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
        onReady={() => {
          ref.current?.setTool('select')
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  canvas: { flex: 1 },
})
