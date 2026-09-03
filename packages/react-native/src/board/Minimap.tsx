import { useMemo } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Svg, { Rect } from 'react-native-svg'
import type { Bounds, ShapeRecord } from '@incantly/canvas/headless'
import {
  fitMinimap,
  miniToWorld,
  minimapWorld,
  pageBounds,
  shapeRenderable,
  worldToMini,
} from '@incantly/canvas/headless'

const MINI_W = 120
const MINI_H = 90

export function Minimap({
  shapes,
  viewport,
  fallback,
  backdrop,
  onPanTo,
}: {
  shapes: readonly ShapeRecord[]
  viewport: Bounds
  fallback: Bounds
  backdrop?: Bounds
  onPanTo: (worldX: number, worldY: number) => void
}) {
  const content = useMemo(() => {
    let b: Bounds | null = null
    for (const s of shapes) {
      if (!shapeRenderable(s)) continue
      const pb = pageBounds(s)
      if (!b) b = pb
      else {
        const x = Math.min(b.x, pb.x)
        const y = Math.min(b.y, pb.y)
        b = {
          x,
          y,
          w: Math.max(b.x + b.w, pb.x + pb.w) - x,
          h: Math.max(b.y + b.h, pb.y + pb.h) - y,
        }
      }
    }
    return b
  }, [shapes])

  const world = useMemo(
    () => minimapWorld(content, viewport, fallback),
    [content, viewport, fallback],
  )
  const layout = useMemo(() => fitMinimap(world, MINI_W, MINI_H), [world])
  const vp = worldToMini(viewport.x, viewport.y, world, layout)
  const vpSize = {
    w: Math.max(4, viewport.w * layout.scale),
    h: Math.max(4, viewport.h * layout.scale),
  }

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Minimap"
        onPress={(e) => {
          const { locationX, locationY } = e.nativeEvent
          const w = miniToWorld(locationX, locationY, world, layout)
          onPanTo(w.x, w.y)
        }}
        style={styles.mini}
      >
        <Svg width={MINI_W} height={MINI_H}>
          <Rect x={0} y={0} width={MINI_W} height={MINI_H} fill="#f7f4ee" />
          {backdrop ? (
            <Rect
              x={worldToMini(backdrop.x, backdrop.y, world, layout).x}
              y={worldToMini(backdrop.x, backdrop.y, world, layout).y}
              width={Math.max(2, backdrop.w * layout.scale)}
              height={Math.max(2, backdrop.h * layout.scale)}
              fill="#fffef8"
              stroke="rgba(28, 27, 24, 0.2)"
              strokeWidth={1}
            />
          ) : null}
          {shapes.filter(shapeRenderable).map((s) => {
            const b = pageBounds(s)
            const p = worldToMini(b.x, b.y, world, layout)
            return (
              <Rect
                key={s.id}
                x={p.x}
                y={p.y}
                width={Math.max(2, b.w * layout.scale)}
                height={Math.max(2, b.h * layout.scale)}
                fill="rgba(28, 27, 24, 0.35)"
              />
            )
          })}
          <Rect
            x={vp.x}
            y={vp.y}
            width={vpSize.w}
            height={vpSize.h}
            fill="none"
            stroke="#1967d2"
            strokeWidth={1.5}
          />
        </Svg>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    zIndex: 8,
  },
  mini: {
    width: MINI_W,
    height: MINI_H,
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#c8c2b6',
    backgroundColor: '#f7f4ee',
    shadowColor: '#1c1b18',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
})
