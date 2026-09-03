import { useMemo } from 'react'
import { StyleSheet, TextInput, View } from 'react-native'
import type { Camera, ShapeRecord, TextBlock } from '@incantly/canvas/headless'
import {
  blocksToPlainText,
  clampTextPlain,
  localBounds,
  pageToScreen,
  textToBlocks,
} from '@incantly/canvas/headless'

const FONT: Record<string, number> = { s: 18, m: 22, l: 28, xl: 36 }

export function TextBoxLayer({
  shapes,
  camera,
  selectedId,
  editingId,
  readonly,
  onChange,
}: {
  shapes: readonly ShapeRecord[]
  camera: Camera
  selectedId: string | null
  editingId?: string | null
  readonly?: boolean
  onChange: (id: string, blocks: TextBlock[]) => void
}) {
  const texts = useMemo(
    () => shapes.filter((s) => s.type === 'text'),
    [shapes],
  )
  return (
    <View style={styles.layer} pointerEvents="box-none">
      {texts.map((s) => {
        const screen = pageToScreen(s.x, s.y, camera)
        const b = localBounds(s)
        const w = Math.max(80, b.w * camera.z)
        const h = Math.max(36, b.h * camera.z)
        const editing = !readonly && s.id === editingId
        const selected = s.id === selectedId
        const p = s.props as { blocks?: TextBlock[]; size?: string }
        const value = blocksToPlainText(p.blocks ?? [])
        const fontSize = (FONT[p.size ?? 'm'] ?? 22) * camera.z
        return (
          <TextInput
            key={s.id}
            value={value}
            editable={editing}
            pointerEvents={editing ? 'auto' : 'none'}
            accessibilityState={{ selected }}
            onChangeText={(text) => onChange(s.id, textToBlocks(clampTextPlain(text)))}
            multiline
            style={{
              position: 'absolute',
              left: screen.x,
              top: screen.y,
              width: w,
              height: h,
              paddingHorizontal: 8,
              paddingVertical: 6,
              fontSize,
              color: '#1d1d1d',
              backgroundColor: 'transparent',
              borderWidth: 0,
              textAlignVertical: 'top',
            }}
          />
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFillObject, zIndex: 5 },
})
