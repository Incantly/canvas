import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { ColorId, FillId, GeoId, InkPenDefinition, SizeId } from '@incantly/canvas/headless'
import {
  COLOR_IDS,
  FILL_IDS,
  GEO_IDS,
  SIZE_IDS,
  isInkPenTool,
  isShapeCreateTool,
  themeOf,
} from '@incantly/canvas/headless'
import { resolveInkBarItems, type InkBarConfig, type InkBarMode } from './ink-bar-config.js'

const SWATCH: Record<ColorId, string> = Object.fromEntries(
  COLOR_IDS.map((id) => [id, themeOf('light').colors[id].stroke]),
) as Record<ColorId, string>

const GEO_LABEL: Record<GeoId, string> = {
  rectangle: 'Rect',
  ellipse: 'Oval',
  triangle: 'Tri',
  diamond: 'Dia',
  hexagon: 'Hex',
  star: 'Star',
  cloud: 'Cloud',
}

export interface InkToolbarProps {
  tool: string
  color: ColorId
  size: SizeId
  pens: readonly InkPenDefinition[]
  inkBar?: InkBarConfig
  mode?: InkBarMode
  geoKind?: GeoId
  fill?: FillId
  /** Show fill chips (geo tool, text tool, or a selected text/geo box). */
  showFill?: boolean
  onTool: (tool: string) => void
  onColor: (color: ColorId) => void
  onSize: (size: SizeId) => void
  onGeoKind?: (geo: GeoId) => void
  onFill?: (fill: FillId) => void
}

export function InkToolbar({
  tool,
  color,
  size,
  pens,
  inkBar,
  mode = 'notes',
  geoKind = 'rectangle',
  fill = 'none',
  showFill = false,
  onTool,
  onColor,
  onSize,
  onGeoKind,
  onFill,
}: InkToolbarProps) {
  const items = resolveInkBarItems(pens, inkBar, mode)
  const styleOn = isInkPenTool(tool, pens) || isShapeCreateTool(tool) || tool === 'text'
  return (
    <View style={styles.bar}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {items.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => onTool(t.id)}
            accessibilityRole="button"
            accessibilityLabel={t.name}
            style={[styles.chip, tool === t.id && styles.chipOn]}
          >
            {t.icon ? <View style={styles.icon}>{t.icon}</View> : null}
            <Text style={styles.chipText}>{t.name}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {styleOn ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {COLOR_IDS.map((id) => (
            <Pressable
              key={id}
              onPress={() => onColor(id)}
              accessibilityLabel={id}
              style={[
                styles.swatch,
                { backgroundColor: SWATCH[id] },
                color === id && styles.swatchOn,
              ]}
            />
          ))}
          {SIZE_IDS.map((id) => (
            <Pressable
              key={id}
              onPress={() => onSize(id)}
              style={[styles.chip, size === id && styles.chipOn]}
            >
              <Text style={styles.chipText}>{id.toUpperCase()}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      {tool === 'geo' ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {GEO_IDS.map((id) => (
            <Pressable
              key={id}
              onPress={() => onGeoKind?.(id)}
              style={[styles.chip, geoKind === id && styles.chipOn]}
            >
              <Text style={styles.chipText}>{GEO_LABEL[id]}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      {tool === 'geo' || tool === 'text' || showFill ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {FILL_IDS.map((id) => (
            <Pressable
              key={id}
              onPress={() => onFill?.(id)}
              style={[styles.chip, fill === id && styles.chipOn]}
            >
              <Text style={styles.chipText}>{id}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: '#f4f2ee',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#d0ccc4',
    paddingVertical: 8,
    gap: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ccc',
  },
  chipOn: { borderColor: '#1967d2', backgroundColor: '#e8f0fe' },
  chipText: { fontSize: 13, fontWeight: '600' },
  icon: { justifyContent: 'center', alignItems: 'center' },
  swatch: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.15)',
  },
  swatchOn: { borderWidth: 2, borderColor: '#1967d2' },
})
