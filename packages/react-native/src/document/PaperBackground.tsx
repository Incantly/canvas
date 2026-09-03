import type { ReactNode } from 'react'
import { View, StyleSheet } from 'react-native'
import type { PaperStyleId } from '@incantly/canvas/headless'

const STEP = 28

export interface PaperBackgroundProps {
  width: number
  height: number
  style?: PaperStyleId
}

/** Ruled / grid / dot pattern behind a discrete paper sheet. */
export function PaperBackground({ width, height, style = 'plain' }: PaperBackgroundProps) {
  if (style === 'plain' || width <= 0 || height <= 0) return null

  if (style === 'dots') {
    const cols = Math.floor(width / STEP)
    const rows = Math.floor(height / STEP)
    const dots: ReactNode[] = []
    for (let r = 1; r <= rows; r++) {
      for (let c = 1; c <= cols; c++) {
        dots.push(
          <View
            key={`${r}-${c}`}
            style={[styles.dot, { left: c * STEP - 1, top: r * STEP - 1 }]}
          />,
        )
      }
    }
    return <View pointerEvents="none" style={[styles.layer, { width, height }]}>{dots}</View>
  }

  const lines: ReactNode[] = []
  if (style === 'grid') {
    const cols = Math.floor(width / STEP)
    for (let c = 1; c <= cols; c++) {
      lines.push(
        <View key={`v${c}`} style={[styles.vLine, { left: c * STEP, height }]} />,
      )
    }
  }
  const rows = Math.floor(height / STEP)
  for (let r = 1; r <= rows; r++) {
    lines.push(
      <View key={`h${r}`} style={[styles.hLine, { top: r * STEP, width }]} />,
    )
  }
  return <View pointerEvents="none" style={[styles.layer, { width, height }]}>{lines}</View>
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 0, top: 0, overflow: 'hidden' },
  hLine: {
    position: 'absolute',
    left: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(60, 90, 140, 0.22)',
  },
  vLine: {
    position: 'absolute',
    top: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(60, 90, 140, 0.18)',
  },
  dot: {
    position: 'absolute',
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(60, 90, 140, 0.35)',
  },
})
