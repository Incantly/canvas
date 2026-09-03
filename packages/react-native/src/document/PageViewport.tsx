import { useMemo } from 'react'
import {
  ScrollView,
  View,
  Text,
  Pressable,
  StyleSheet,
} from 'react-native'
import type { DocumentBlock, PaperSizeId, PaperStyleId } from '@incantly/canvas/headless'
import { PAGE_DOC_MARGIN_X, PAGE_DOC_MARGIN_Y } from '@incantly/canvas/headless'
import type { PageRecord } from '@incantly/canvas/headless'
import { PageRichTextEditor } from './PageRichTextEditor.js'
import { PaperBackground } from './PaperBackground.js'
import type { FormatBarConfig } from './format-bar-config.js'

const ZOOM_STEPS = [0.55, 0.75, 1] as const
const PAPER_SIZES: PaperSizeId[] = ['letter', 'a4']
const PAPER_STYLES: PaperStyleId[] = ['plain', 'ruled', 'grid', 'dots']
const SIZE_LABEL: Record<PaperSizeId, string> = { letter: 'Letter', a4: 'A4' }
const STYLE_LABEL: Record<PaperStyleId, string> = {
  plain: 'Plain',
  ruled: 'Rule',
  grid: 'Grid',
  dots: 'Dot',
}

export interface PageViewportProps {
  pages: PageRecord[]
  currentPageId: string
  blocks: DocumentBlock[]
  zoom: number
  readonly?: boolean
  formatBar?: FormatBarConfig
  paperColor?: string
  onChangeBlocks?: (blocks: DocumentBlock[]) => void
  onSelectPage: (pageId: string) => void
  onAddPage: () => void
  onRemovePage: () => void
  onPaperSize: (size: PaperSizeId) => void
  onPaperStyle: (style: PaperStyleId) => void
  onZoom: (zoom: number) => void
  onError?: (message: string) => void
  /** Host flushes writes and reflows when measured text exceeds the paper box. */
  onOverflowRequest?: (measuredHeight: number, boxHeight: number) => void
  /** Place caret at the end of the active page (overflow handoff). */
  caretAtEnd?: boolean
}

function cycle<T>(list: readonly T[], current: T): T {
  const i = list.indexOf(current)
  return list[(i + 1) % list.length]!
}

export function PageViewport({
  pages,
  currentPageId,
  blocks,
  zoom,
  readonly,
  formatBar,
  paperColor = '#fffef8',
  onChangeBlocks,
  onSelectPage,
  onAddPage,
  onRemovePage,
  onPaperSize,
  onPaperStyle,
  onZoom,
  onError,
  onOverflowRequest,
  caretAtEnd,
}: PageViewportProps) {
  const current = pages.find((p) => p.id === currentPageId) ?? pages[0]
  const sizeId: PaperSizeId =
    current && current.width === 794 && current.height === 1123 ? 'a4' : 'letter'
  const styleId: PaperStyleId = current?.paperStyle ?? 'plain'
  const idx = Math.max(0, pages.findIndex((p) => p.id === currentPageId))

  const sheets = useMemo(() => pages, [pages])

  return (
    <View style={styles.root}>
      <View style={styles.chrome}>
        <Pressable
          style={styles.chip}
          onPress={() => onPaperSize(cycle(PAPER_SIZES, sizeId))}
        >
          <Text style={styles.chipText}>{SIZE_LABEL[sizeId]}</Text>
        </Pressable>
        <Pressable
          style={styles.chip}
          onPress={() => onPaperStyle(cycle(PAPER_STYLES, styleId))}
        >
          <Text style={styles.chipText}>{STYLE_LABEL[styleId]}</Text>
        </Pressable>
        <View style={styles.zoomRow}>
          {ZOOM_STEPS.map((z) => (
            <Pressable
              key={z}
              style={[styles.chip, zoom === z && styles.chipOn]}
              onPress={() => onZoom(z)}
            >
              <Text style={styles.chipText}>{Math.round(z * 100)}%</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView
        style={styles.scroller}
        contentContainerStyle={styles.stack}
        maximumZoomScale={2}
        minimumZoomScale={0.4}
      >
        {sheets.map((page, i) => {
          const active = page.id === currentPageId
          const w = page.width * zoom
          const h = page.height * zoom
          const contentW = Math.max(80, page.width - PAGE_DOC_MARGIN_X * 2) * zoom
          const contentH =
            Math.max(80, page.height - PAGE_DOC_MARGIN_Y - PAGE_DOC_MARGIN_X) * zoom
          return (
            <Pressable
              key={page.id}
              onPress={() => onSelectPage(page.id)}
              style={[styles.sheetWrap, { width: w, height: h }]}
            >
              <View
                style={[
                  styles.sheet,
                  {
                    width: w,
                    height: h,
                    backgroundColor: paperColor,
                    borderColor: active ? '#1967d2' : '#d8d4cc',
                  },
                ]}
              >
                <PaperBackground
                  width={w}
                  height={h}
                  style={page.paperStyle ?? 'plain'}
                />
                <View
                  style={[
                    styles.contentBox,
                    {
                      left: PAGE_DOC_MARGIN_X * zoom,
                      top: PAGE_DOC_MARGIN_Y * zoom,
                      width: contentW,
                      height: contentH,
                    },
                  ]}
                >
                  <PageRichTextEditor
                    blocks={active ? blocks : (page.document?.blocks ?? [])}
                    readonly={readonly || !active}
                    onChangeBlocks={active && !readonly ? onChangeBlocks : undefined}
                    onError={onError}
                    formatBar={formatBar}
                    zoom={zoom}
                    contentBoxWidth={contentW}
                    contentBoxHeight={contentH}
                    caretAtEnd={active ? caretAtEnd : undefined}
                    onOverflowRequest={
                      active && !readonly ? onOverflowRequest : undefined
                    }
                  />
                  {!active ? (
                    <Text style={styles.sheetIndex} pointerEvents="none">
                      Page {i + 1}
                    </Text>
                  ) : null}
                </View>
              </View>
            </Pressable>
          )
        })}
      </ScrollView>

      <View style={styles.strip}>
        <Pressable
          style={styles.stripBtn}
          disabled={idx <= 0}
          onPress={() => {
            const prev = pages[idx - 1]
            if (prev) onSelectPage(prev.id)
          }}
        >
          <Text style={[styles.stripText, idx <= 0 && styles.muted]}>‹</Text>
        </Pressable>
        <Text style={styles.stripText}>
          {pages.length ? `${idx + 1} / ${pages.length}` : '—'}
        </Text>
        <Pressable
          style={styles.stripBtn}
          disabled={idx >= pages.length - 1}
          onPress={() => {
            const next = pages[idx + 1]
            if (next) onSelectPage(next.id)
          }}
        >
          <Text style={[styles.stripText, idx >= pages.length - 1 && styles.muted]}>
            ›
          </Text>
        </Pressable>
        <Pressable style={styles.stripBtn} onPress={onAddPage}>
          <Text style={styles.stripText}>+</Text>
        </Pressable>
        <Pressable
          style={styles.stripBtn}
          disabled={pages.length <= 1}
          onPress={onRemovePage}
        >
          <Text style={[styles.stripText, pages.length <= 1 && styles.muted]}>⌫</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#e8e4dc' },
  chrome: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ccc',
  },
  chipOn: { borderColor: '#1967d2', backgroundColor: '#e8f0fe' },
  chipText: { fontSize: 13, fontWeight: '600' },
  zoomRow: { flexDirection: 'row', gap: 6, marginLeft: 'auto' },
  scroller: { flex: 1 },
  stack: { alignItems: 'center', paddingVertical: 16, gap: 24, paddingBottom: 48 },
  sheetWrap: { alignSelf: 'center' },
  sheet: {
    borderWidth: 1,
    borderRadius: 2,
    overflow: 'hidden',
    shadowColor: '#1c1b18',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  contentBox: {
    position: 'absolute',
    overflow: 'hidden',
  },
  sheetIndex: {
    position: 'absolute',
    right: 0,
    bottom: -22,
    fontSize: 11,
    fontWeight: '600',
    color: '#888',
  },
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 10,
    backgroundColor: '#f4f2ee',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#d0ccc4',
  },
  stripBtn: { paddingHorizontal: 10, paddingVertical: 4 },
  stripText: { fontSize: 16, fontWeight: '600' },
  muted: { opacity: 0.35 },
})
