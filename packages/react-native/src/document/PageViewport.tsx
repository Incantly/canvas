import { useMemo, useRef, useState } from "react";
import {
  ScrollView,
  View,
  Text,
  Pressable,
  StyleSheet,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import type {
  ColorId,
  DocumentBlock,
  DrawingStroke,
  FillId,
  GeoId,
  InkPenDefinition,
  PaperSizeId,
  PaperStyleId,
  SizeId,
} from "@incantly/canvas/headless";
import {
  CAMERA_ZOOM_MAX,
  CAMERA_ZOOM_MIN,
  PAGE_DOC_MARGIN_X,
  PAGE_DOC_MARGIN_Y,
  clamp,
  isInkCapturingTool,
  isShapeCreateTool,
  paperVisibleRect,
  sanitizeInkPens,
} from "@incantly/canvas/headless";
import type { PageRecord, ShapeRecord } from "@incantly/canvas/headless";
import { PageRichTextEditor } from "./PageRichTextEditor.js";
import { PaperBackground } from "./PaperBackground.js";
import { InkOverlay, type InkHit } from "../ink/InkOverlay.js";
import { ShapeLayer, type ShapeDraft } from "../shapes/ShapeLayer.js";
import type { FormatBarConfig } from "./format-bar-config.js";
import { Minimap } from "../board/Minimap.js";

const ZOOM_STEPS = [CAMERA_ZOOM_MIN, 0.5, 1, 2, CAMERA_ZOOM_MAX] as const;
const STACK_PAD = 16;
const STACK_GAP = 24;
const PAPER_SIZES: PaperSizeId[] = ["letter", "a4"];
const PAPER_STYLES: PaperStyleId[] = ["plain", "ruled", "grid", "dots"];
const SIZE_LABEL: Record<PaperSizeId, string> = { letter: "Letter", a4: "A4" };
const STYLE_LABEL: Record<PaperStyleId, string> = {
  plain: "Plain",
  ruled: "Rule",
  grid: "Grid",
  dots: "Dot",
};

export interface PageViewportProps {
  pages: PageRecord[];
  currentPageId: string;
  blocks: DocumentBlock[];
  zoom: number;
  readonly?: boolean;
  formatBar?: FormatBarConfig;
  paperColor?: string;
  onChangeBlocks?: (blocks: DocumentBlock[]) => void;
  onSelectPage: (pageId: string) => void;
  onAddPage: () => void;
  onRemovePage: () => void;
  onPaperSize: (size: PaperSizeId) => void;
  onPaperStyle: (style: PaperStyleId) => void;
  onZoom: (zoom: number) => void;
  onError?: (message: string) => void;
  /** Host flushes writes and reflows when measured text exceeds the paper box. */
  onOverflowRequest?: (measuredHeight: number, boxHeight: number) => void;
  /** Place caret at the end of the active page (overflow handoff). */
  caretAtEnd?: boolean;
  /** Ink overlay on the full paper sheet (pen / highlighter / eraser). */
  ink?: {
    tool: string;
    color: ColorId;
    size: SizeId;
    pens?: readonly InkPenDefinition[];
    onCommitStroke: (stroke: DrawingStroke) => void;
    onErase: (hits: InkHit[]) => void;
  };
  shapes?: readonly ShapeRecord[];
  geoKind?: GeoId;
  fill?: FillId;
  selectedShapeId?: string | null;
  onCommitShape?: (draft: ShapeDraft) => void;
  onMoveShape?: (id: string, x: number, y: number) => void;
  onSelectShape?: (id: string | null) => void;
  onResizeShape?: (id: string, box: { x: number; y: number; w: number; h: number }) => void;
}

function cycle<T>(list: readonly T[], current: T): T {
  const i = list.indexOf(current);
  return list[(i + 1) % list.length]!;
}

export function PageViewport({
  pages,
  currentPageId,
  blocks,
  zoom,
  readonly,
  formatBar,
  paperColor = "#fffef8",
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
  ink,
  shapes = [],
  geoKind = "rectangle",
  fill = "none",
  selectedShapeId = null,
  onCommitShape,
  onMoveShape,
  onSelectShape,
  onResizeShape,
}: PageViewportProps) {
  const current = pages.find((p) => p.id === currentPageId) ?? pages[0];
  const sizeId: PaperSizeId =
    current && current.width === 794 && current.height === 1123
      ? "a4"
      : "letter";
  const styleId: PaperStyleId = current?.paperStyle ?? "plain";
  const idx = Math.max(
    0,
    pages.findIndex((p) => p.id === currentPageId),
  );

  const sheets = useMemo(() => pages, [pages]);
  const inkPens = sanitizeInkPens(ink?.pens);
  const tool = ink?.tool ?? "type";
  const chromeLocked =
    !!ink &&
    !readonly &&
    (isInkCapturingTool(tool, inkPens) ||
      isShapeCreateTool(tool) ||
      tool === "select");
  const scrollRef = useRef<ScrollView>(null);
  const [scroll, setScroll] = useState({ x: 0, y: 0 });
  const [viewSize, setViewSize] = useState({ w: 1, h: 1 });

  const sheetY = (() => {
    let y = STACK_PAD;
    for (let i = 0; i < idx; i++) y += (pages[i]?.height ?? 0) * zoom + STACK_GAP;
    return y;
  })();
  const sheetW = (current?.width ?? 816) * zoom;
  const sheetX = Math.max(0, (viewSize.w - sheetW) / 2);
  const pageW = current?.width ?? 816;
  const pageH = current?.height ?? 1056;
  const paperViewport = paperVisibleRect(
    scroll,
    viewSize,
    { x: sheetX, y: sheetY },
    zoom,
    { w: pageW, h: pageH },
  );

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
              onPress={() =>
                onZoom(clamp(z, CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX))
              }
            >
              <Text style={styles.chipText}>{Math.round(z * 100)}%</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.stage}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroller}
        contentContainerStyle={styles.stack}
        scrollEnabled={!chromeLocked}
        maximumZoomScale={chromeLocked ? 1 : CAMERA_ZOOM_MAX}
        minimumZoomScale={chromeLocked ? 1 : CAMERA_ZOOM_MIN}
        keyboardShouldPersistTaps="handled"
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setViewSize({ w: width, h: height });
        }}
        onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
          const { contentOffset } = e.nativeEvent;
          setScroll({ x: contentOffset.x, y: contentOffset.y });
        }}
        scrollEventThrottle={16}
      >
        {sheets.map((page, i) => {
          const active = page.id === currentPageId;
          const w = page.width * zoom;
          const h = page.height * zoom;
          const contentW =
            Math.max(80, page.width - PAGE_DOC_MARGIN_X * 2) * zoom;
          const contentH =
            Math.max(80, page.height - PAGE_DOC_MARGIN_Y - PAGE_DOC_MARGIN_X) *
            zoom;
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
                    borderColor: active ? "#1967d2" : "#d8d4cc",
                  },
                ]}
              >
                <PaperBackground
                  width={w}
                  height={h}
                  style={page.paperStyle ?? "plain"}
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
                    readonly={readonly || !active || chromeLocked}
                    onChangeBlocks={
                      active && !readonly && !chromeLocked
                        ? onChangeBlocks
                        : undefined
                    }
                    onError={onError}
                    formatBar={formatBar}
                    zoom={zoom}
                    contentBoxWidth={contentW}
                    contentBoxHeight={contentH}
                    caretAtEnd={active ? caretAtEnd : undefined}
                    onOverflowRequest={
                      active && !readonly && !chromeLocked
                        ? onOverflowRequest
                        : undefined
                    }
                  />
                  {!active ? (
                    <Text style={styles.sheetIndex} pointerEvents="none">
                      Page {i + 1}
                    </Text>
                  ) : null}
                </View>
                {active ? (
                  <ShapeLayer
                    width={w}
                    height={h}
                    zoom={zoom}
                    space="paper"
                    paperWidth={page.width}
                    paperHeight={page.height}
                    shapes={shapes.filter((s) => s.parentId === page.id)}
                    tool={tool}
                    color={ink?.color ?? "black"}
                    size={ink?.size ?? "m"}
                    geoKind={geoKind}
                    fill={fill}
                    selectedId={selectedShapeId}
                    readonly={readonly || !ink}
                    onCommit={onCommitShape ?? (() => {})}
                    onMove={onMoveShape ?? (() => {})}
                    onSelect={onSelectShape ?? (() => {})}
                    onResize={onResizeShape}
                  />
                ) : null}
                <InkOverlay
                  width={w}
                  height={h}
                  zoom={zoom}
                  paperWidth={page.width}
                  paperHeight={page.height}
                  blocks={active ? blocks : (page.document?.blocks ?? [])}
                  tool={tool}
                  color={ink?.color ?? "black"}
                  size={ink?.size ?? "m"}
                  pens={inkPens}
                  readonly={!ink || readonly || !active}
                  onCommitStroke={ink?.onCommitStroke}
                  onErase={ink?.onErase}
                />
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {current ? (
        <Minimap
          shapes={shapes.filter((s) => s.parentId === current.id)}
          viewport={paperViewport}
          fallback={{ x: 0, y: 0, w: pageW, h: pageH }}
          backdrop={{ x: 0, y: 0, w: pageW, h: pageH }}
          onPanTo={(wx, wy) => {
            scrollRef.current?.scrollTo({
              x: Math.max(0, sheetX + wx * zoom - viewSize.w / 2),
              y: Math.max(0, sheetY + wy * zoom - viewSize.h / 2),
              animated: true,
            });
          }}
        />
      ) : null}
      </View>

      <View style={styles.strip}>
        <Pressable
          style={styles.stripBtn}
          disabled={idx <= 0}
          onPress={() => {
            const prev = pages[idx - 1];
            if (prev) onSelectPage(prev.id);
          }}
        >
          <Text style={[styles.stripText, idx <= 0 && styles.muted]}>‹</Text>
        </Pressable>
        <Text style={styles.stripText}>
          {pages.length ? `${idx + 1} / ${pages.length}` : "—"}
        </Text>
        <Pressable
          style={styles.stripBtn}
          disabled={idx >= pages.length - 1}
          onPress={() => {
            const next = pages[idx + 1];
            if (next) onSelectPage(next.id);
          }}
        >
          <Text
            style={[styles.stripText, idx >= pages.length - 1 && styles.muted]}
          >
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
          <Text style={[styles.stripText, pages.length <= 1 && styles.muted]}>
            ⌫
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#e8e4dc" },
  chrome: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#fff",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ccc",
  },
  chipOn: { borderColor: "#1967d2", backgroundColor: "#e8f0fe" },
  chipText: { fontSize: 13, fontWeight: "600" },
  zoomRow: { flexDirection: "row", gap: 6, marginLeft: "auto" },
  stage: { flex: 1 },
  scroller: { flex: 1 },
  stack: {
    alignItems: "center",
    paddingVertical: 16,
    gap: 24,
    paddingBottom: 48,
  },
  sheetWrap: { alignSelf: "center" },
  sheet: {
    borderWidth: 1,
    borderRadius: 2,
    overflow: "hidden",
    shadowColor: "#1c1b18",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  contentBox: {
    position: "absolute",
    overflow: "hidden",
  },
  sheetIndex: {
    position: "absolute",
    right: 0,
    bottom: -22,
    fontSize: 11,
    fontWeight: "600",
    color: "#888",
  },
  strip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 10,
    backgroundColor: "#f4f2ee",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#d0ccc4",
  },
  stripBtn: { paddingHorizontal: 10, paddingVertical: 4 },
  stripText: { fontSize: 16, fontWeight: "600" },
  muted: { opacity: 0.35 },
});
