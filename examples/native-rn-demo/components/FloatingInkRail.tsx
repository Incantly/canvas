import { useState, type ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  resolveInkBarItems,
  useCanvasInkChrome,
  type InkBarConfig,
} from '@incantly/canvas-react-native'
import {
  COLOR_IDS,
  FILL_IDS,
  GEO_IDS,
  SIZE_IDS,
  isInkPenTool,
  isShapeCreateTool,
  themeOf,
  type ColorId,
  type GeoId,
} from '@incantly/canvas/headless'

const SWATCH: Record<ColorId, string> = Object.fromEntries(
  COLOR_IDS.map((id) => [id, themeOf('light').colors[id].stroke]),
) as Record<ColorId, string>

const GEO_LABEL: Record<GeoId, string> = {
  rectangle: '▭',
  ellipse: '◯',
  triangle: '△',
  diamond: '◇',
  hexagon: '⬡',
  star: '☆',
  cloud: '☁',
}

/** Fallback glyph when host does not pass an icon. */
function FallbackIcon({ label, accent }: { label: string; accent?: string }) {
  return <Text style={[styles.iconText, accent ? { color: accent } : null]}>{label}</Text>
}

function ToolButton({
  label,
  selected,
  onPress,
  children,
}: {
  label: string
  selected?: boolean
  onPress: () => void
  children: ReactNode
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected }}
      style={[styles.toolBtn, selected && styles.toolBtnOn]}
    >
      {children}
    </Pressable>
  )
}

/**
 * Host demo chrome — vertical floating rail with dark rounded sections
 * (tools / history / collapse), similar to common whiteboard sidebars.
 */
export function FloatingInkRail({
  inkBar,
  onUndo,
  onRedo,
}: {
  inkBar?: InkBarConfig
  onUndo?: () => void
  onRedo?: () => void
}) {
  const chrome = useCanvasInkChrome()
  const [expanded, setExpanded] = useState(true)
  if (chrome.readonly) return null

  const items = resolveInkBarItems(chrome.pens, inkBar ?? chrome.inkBar, chrome.mode)
  const styleOn =
    isInkPenTool(chrome.tool, chrome.pens) ||
    isShapeCreateTool(chrome.tool) ||
    chrome.tool === 'text'

  return (
    <View style={styles.dock} pointerEvents="box-none">
      <View style={styles.rail}>
        {expanded ? (
          <>
            <View style={styles.section}>
              <ScrollView
                showsVerticalScrollIndicator={false}
                style={styles.toolsScroll}
                contentContainerStyle={styles.toolsScrollContent}
              >
                {items.map((t) => {
                  const selected = chrome.tool === t.id
                  const accent = selected && t.id === 'highlight' ? '#f5d76e' : undefined
                  return (
                    <ToolButton
                      key={t.id}
                      label={t.name}
                      selected={selected}
                      onPress={() => chrome.onTool(t.id)}
                    >
                      {t.icon ? (
                        <View style={styles.iconSlot}>{t.icon}</View>
                      ) : (
                        <FallbackIcon label={t.name.slice(0, 1)} accent={accent} />
                      )}
                    </ToolButton>
                  )
                })}
              </ScrollView>
            </View>

            <View style={styles.section}>
              <ToolButton label="Undo" onPress={() => onUndo?.()}>
                <FallbackIcon label="↶" />
              </ToolButton>
              <ToolButton label="Redo" onPress={() => onRedo?.()}>
                <FallbackIcon label="↷" />
              </ToolButton>
            </View>
          </>
        ) : null}

        <View style={styles.section}>
          <ToolButton
            label={expanded ? 'Collapse tools' : 'Expand tools'}
            onPress={() => setExpanded((v) => !v)}
          >
            <FallbackIcon label={expanded ? '‹' : '›'} />
          </ToolButton>
        </View>
      </View>

      {expanded && styleOn ? (
        <View style={styles.styleTray}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.styleRow}
          >
            {COLOR_IDS.map((id) => (
              <Pressable
                key={id}
                onPress={() => chrome.onColor(id)}
                accessibilityLabel={id}
                style={[
                  styles.swatch,
                  { backgroundColor: SWATCH[id] },
                  chrome.color === id && styles.swatchOn,
                ]}
              />
            ))}
            {SIZE_IDS.map((id) => (
              <Pressable
                key={id}
                onPress={() => chrome.onSize(id)}
                style={[styles.sizeChip, chrome.size === id && styles.sizeChipOn]}
              >
                <Text style={styles.sizeText}>{id.toUpperCase()}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {chrome.tool === 'geo' ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.styleRow}
            >
              {GEO_IDS.map((id) => (
                <Pressable
                  key={id}
                  onPress={() => chrome.onGeoKind?.(id)}
                  style={[styles.sizeChip, chrome.geoKind === id && styles.sizeChipOn]}
                >
                  <Text style={styles.sizeText}>{GEO_LABEL[id]}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          {chrome.tool === 'geo' || chrome.tool === 'text' || chrome.showFill ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.styleRow}
            >
              {FILL_IDS.map((id) => (
                <Pressable
                  key={id}
                  onPress={() => chrome.onFill?.(id)}
                  style={[styles.sizeChip, chrome.fill === id && styles.sizeChipOn]}
                >
                  <Text style={styles.sizeText}>{id}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: 14,
    top: 56,
    bottom: 56,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  rail: {
    width: 56,
    borderRadius: 22,
    padding: 6,
    gap: 6,
    backgroundColor: 'rgba(28, 28, 30, 0.92)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  section: {
    borderRadius: 16,
    paddingVertical: 4,
    paddingHorizontal: 2,
    gap: 2,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  toolsScroll: {
    maxHeight: 420,
  },
  toolsScrollContent: {
    alignItems: 'center',
    gap: 2,
  },
  toolBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolBtnOn: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  iconSlot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    color: '#f5f5f7',
    fontSize: 18,
    fontWeight: '600',
  },
  styleTray: {
    maxWidth: 280,
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 8,
    backgroundColor: 'rgba(28, 28, 30, 0.92)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  styleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  swatch: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  swatchOn: {
    borderWidth: 2,
    borderColor: '#fff',
  },
  sizeChip: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  sizeChipOn: {
    borderColor: '#fff',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  sizeText: {
    color: '#f5f5f7',
    fontSize: 11,
    fontWeight: '700',
  },
})
