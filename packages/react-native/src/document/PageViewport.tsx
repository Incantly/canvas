import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PanResponder,
  ScrollView,
  View,
  Text,
  Pressable,
  StyleSheet,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Svg, { Path } from "react-native-svg";
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
  sanitizeInkPens,
} from "@incantly/canvas/headless";
import type { PageRecord, ShapeRecord } from "@incantly/canvas/headless";
import { PageRichTextEditor } from "./PageRichTextEditor.js";
import { PaperBackground } from "./PaperBackground.js";
import { InkOverlay, type InkHit } from "../ink/InkOverlay.js";
import { ShapeLayer, type ShapeDraft } from "../shapes/ShapeLayer.js";
import type { FormatBarConfig } from "./format-bar-config.js";

const ZOOM_STEPS = [CAMERA_ZOOM_MIN, 0.5, 1, 2, CAMERA_ZOOM_MAX] as const;
const STACK_PAD = 16;
const STACK_GAP = 24;
const EMPTY_BLOCKS: DocumentBlock[] = [];
const EMPTY_SHAPES: ShapeRecord[] = [];
const NOOP = () => {};
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
  /**
   * Page navigator style. `strip` (default) is the bottom bar with prev/next,
   * add, and delete. `floating` is a bottom-left pill with prev/next and the
   * current/total count — add/delete live in host chrome instead.
   */
  pagerVariant?: "strip" | "floating";
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
  pagerVariant = "strip",
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
  const inkPens = useMemo(() => sanitizeInkPens(ink?.pens), [ink?.pens]);
  const tool = ink?.tool ?? "type";
  const inkColor = ink?.color ?? "black";
  const inkSize = ink?.size ?? "m";
  const chromeLocked =
    !!ink &&
    !readonly &&
    (isInkCapturingTool(tool, inkPens) ||
      isShapeCreateTool(tool) ||
      tool === "select");
  const scrollRef = useRef<ScrollView>(null);
  // Latest scroll offset lives in a ref so two-finger programmatic scrolling
  // never triggers a re-render.
  const scrollPos = useRef({ x: 0, y: 0 });
  const [viewSize, setViewSize] = useState({ w: 1, h: 1 });

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset } = e.nativeEvent;
      scrollPos.current = { x: contentOffset.x, y: contentOffset.y };
    },
    [],
  );
  const twoFingerLast = useRef<{ x: number; y: number } | null>(null);

  // Ink/shape/select tools lock the ScrollView (single-finger draws), so a
  // two-finger drag scrolls the page list programmatically instead.
  const pagePan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (e) => (e.nativeEvent.touches?.length ?? 0) >= 2,
      onMoveShouldSetPanResponder: (e) => (e.nativeEvent.touches?.length ?? 0) >= 2,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const t = e.nativeEvent.touches;
        if (!t || t.length < 2) {
          twoFingerLast.current = null;
          return;
        }
        twoFingerLast.current = {
          x: (t[0]!.pageX + t[1]!.pageX) / 2,
          y: (t[0]!.pageY + t[1]!.pageY) / 2,
        };
      },
      onPanResponderMove: (e) => {
        const t = e.nativeEvent.touches;
        const last = twoFingerLast.current;
        if (!t || t.length < 2 || !last) return;
        const mid = {
          x: (t[0]!.pageX + t[1]!.pageX) / 2,
          y: (t[0]!.pageY + t[1]!.pageY) / 2,
        };
        const dy = mid.y - last.y;
        twoFingerLast.current = mid;
        if (dy === 0) return;
        const p = scrollPos.current;
        const y = Math.max(0, p.y - dy);
        scrollPos.current = { x: p.x, y };
        scrollRef.current?.scrollTo({ x: p.x, y, animated: false });
      },
      onPanResponderRelease: () => {
        twoFingerLast.current = null;
      },
      onPanResponderTerminate: () => {
        twoFingerLast.current = null;
      },
    }),
  ).current;

  const handleLayout = useCallback((e: { nativeEvent: { layout: { width: number; height: number } } }) => {
    const { width, height } = e.nativeEvent.layout;
    setViewSize((prev) => (prev.w === width && prev.h === height ? prev : { w: width, h: height }));
  }, []);

  const sheetY = useMemo(() => {
    let y = STACK_PAD;
    for (let i = 0; i < idx; i++) y += (pages[i]?.height ?? 0) * zoom + STACK_GAP;
    return y;
  }, [idx, pages, zoom]);

  // New / selected page may be off-screen (e.g. + adds below the fold) —
  // bring it into view. Skipped on mount so boot doesn't jump.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    scrollRef.current?.scrollTo({ y: Math.max(0, sheetY - STACK_PAD), animated: true });
  }, [currentPageId, sheetY]);
  const sheetW = (current?.width ?? 816) * zoom;
  const sheetX = Math.max(0, (viewSize.w - sheetW) / 2);

  const shapesByPage = useMemo(() => {
    const map = new Map<string, ShapeRecord[]>();
    for (const s of shapes) {
      const pid = s.parentId;
      if (typeof pid !== "string" || pid.length === 0) continue;
      const list = map.get(pid);
      if (list) list.push(s);
      else map.set(pid, [s]);
    }
    return map;
  }, [shapes]);
  const commitShape = onCommitShape ?? NOOP;
  const moveShape = onMoveShape ?? NOOP;
  const selectShape = onSelectShape ?? NOOP;
  const goPrevPage = useCallback(() => {
    const prev = pages[idx - 1];
    if (prev) onSelectPage(prev.id);
  }, [pages, idx, onSelectPage]);
  const goNextPage = useCallback(() => {
    const next = pages[idx + 1];
    if (next) onSelectPage(next.id);
  }, [pages, idx, onSelectPage]);

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

      <View style={styles.stage} {...(chromeLocked ? pagePan.panHandlers : {})}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroller}
        contentContainerStyle={styles.stack}
        scrollEnabled={!chromeLocked}
        maximumZoomScale={chromeLocked ? 1 : CAMERA_ZOOM_MAX}
        minimumZoomScale={chromeLocked ? 1 : CAMERA_ZOOM_MIN}
        keyboardShouldPersistTaps="handled"
        onLayout={handleLayout}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {sheets.map((page, i) => (
          <PageSheet
            key={page.id}
            page={page}
            index={i}
            active={page.id === currentPageId}
            blocks={page.id === currentPageId ? blocks : (page.document?.blocks ?? EMPTY_BLOCKS)}
            zoom={zoom}
            readonly={readonly}
            chromeLocked={chromeLocked}
            formatBar={formatBar}
            paperColor={paperColor}
            onError={onError}
            caretAtEnd={page.id === currentPageId ? caretAtEnd : undefined}
            onChangeBlocks={page.id === currentPageId && !readonly && !chromeLocked ? onChangeBlocks : undefined}
            onOverflowRequest={page.id === currentPageId && !readonly && !chromeLocked ? onOverflowRequest : undefined}
            onSelectPage={onSelectPage}
            tool={tool}
            inkColor={inkColor}
            inkSize={inkSize}
            inkPens={inkPens}
            ink={ink}
            pageShapes={shapesByPage.get(page.id) ?? EMPTY_SHAPES}
            geoKind={geoKind}
            fill={fill}
            selectedShapeId={selectedShapeId}
            onCommitShape={commitShape}
            onMoveShape={moveShape}
            onSelectShape={selectShape}
            onResizeShape={onResizeShape}
          />
        ))}
      </ScrollView>

      {current && pagerVariant === "floating" ? (
        <PageStepper
          current={pages.length ? idx + 1 : 0}
          total={pages.length}
          onPrev={goPrevPage}
          onNext={goNextPage}
          onAddPage={onAddPage}
        />
      ) : null}
      </View>

      {pagerVariant === "strip" ? (
      <View style={styles.strip}>
        <Pressable
          style={styles.stripBtn}
          disabled={idx <= 0}
          onPress={goPrevPage}
        >
          <Text style={[styles.stripText, idx <= 0 && styles.muted]}>‹</Text>
        </Pressable>
        <Text style={styles.stripText}>
          {pages.length ? `${idx + 1} / ${pages.length}` : "—"}
        </Text>
        <Pressable
          style={styles.stripBtn}
          disabled={idx >= pages.length - 1}
          onPress={goNextPage}
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
      ) : null}
    </View>
  );
}

function PagerChevron({ dir, color }: { dir: "up" | "down"; color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path
        d={dir === "up" ? "M6 14l6-6 6 6" : "M6 10l6 6 6-6"}
        fill="none"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * Floating bottom-left page stepper (vertical pill): prev chevron, current
 * page, divider, total pages, next chevron. Add/delete live in host chrome.
 */
export const PageStepper = memo(function PageStepper({
  current,
  total,
  onPrev,
  onNext,
  onAddPage,
}: {
  current: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onAddPage?: () => void;
}) {
  const atStart = current <= 1;
  const atEnd = total <= 0 || current >= total;
  return (
    <View style={styles.pager} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Previous page"
        disabled={atStart}
        onPress={onPrev}
        style={styles.pagerBtn}
      >
        <PagerChevron dir="up" color={atStart ? "#ccd1d9" : "#8b93a3"} />
      </Pressable>
      <Text style={styles.pagerNum}>{current}</Text>
      <View style={styles.pagerDiv} />
      <Text style={styles.pagerNum}>{total}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Next page"
        disabled={atEnd}
        onPress={onNext}
        style={styles.pagerBtn}
      >
        <PagerChevron dir="down" color={atEnd ? "#ccd1d9" : "#8b93a3"} />
      </Pressable>
      {onAddPage ? (
        <>
          <View style={styles.pagerDiv} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add page"
            onPress={onAddPage}
            style={styles.pagerBtn}
          >
            <Text style={styles.pagerPlus}>+</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
});

const PageSheet = memo(function PageSheet({
  page,
  index,
  active,
  blocks,
  zoom,
  readonly,
  chromeLocked,
  formatBar,
  paperColor,
  onError,
  caretAtEnd,
  onChangeBlocks,
  onOverflowRequest,
  onSelectPage,
  tool,
  inkColor,
  inkSize,
  inkPens,
  ink,
  pageShapes,
  geoKind,
  fill,
  selectedShapeId,
  onCommitShape,
  onMoveShape,
  onSelectShape,
  onResizeShape,
}: {
  page: PageRecord;
  index: number;
  active: boolean;
  blocks: DocumentBlock[];
  zoom: number;
  readonly?: boolean;
  chromeLocked: boolean;
  formatBar?: FormatBarConfig;
  paperColor: string;
  onError?: (message: string) => void;
  caretAtEnd?: boolean;
  onChangeBlocks?: (blocks: DocumentBlock[]) => void;
  onOverflowRequest?: (measuredHeight: number, boxHeight: number) => void;
  onSelectPage: (pageId: string) => void;
  tool: string;
  inkColor: ColorId;
  inkSize: SizeId;
  inkPens: readonly InkPenDefinition[];
  ink?: PageViewportProps["ink"];
  pageShapes: readonly ShapeRecord[];
  geoKind: GeoId;
  fill: FillId;
  selectedShapeId: string | null;
  onCommitShape: (draft: ShapeDraft) => void;
  onMoveShape: (id: string, x: number, y: number) => void;
  onSelectShape: (id: string | null) => void;
  onResizeShape?: (id: string, box: { x: number; y: number; w: number; h: number }) => void;
}) {
  const w = page.width * zoom;
  const h = page.height * zoom;
  const contentW = Math.max(80, page.width - PAGE_DOC_MARGIN_X * 2) * zoom;
  const contentH =
    Math.max(80, page.height - PAGE_DOC_MARGIN_Y - PAGE_DOC_MARGIN_X) * zoom;
  const handlePress = useCallback(() => onSelectPage(page.id), [onSelectPage, page.id]);
  return (
    <Pressable onPress={handlePress} style={[styles.sheetWrap, { width: w, height: h }]}>
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
        <PaperBackground width={w} height={h} style={page.paperStyle ?? "plain"} />
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
            blocks={blocks}
            readonly={readonly || !active || chromeLocked}
            onChangeBlocks={onChangeBlocks}
            onError={onError}
            formatBar={formatBar}
            zoom={zoom}
            contentBoxWidth={contentW}
            contentBoxHeight={contentH}
            caretAtEnd={caretAtEnd}
            onOverflowRequest={onOverflowRequest}
          />
          {!active ? (
            <Text style={styles.sheetIndex} pointerEvents="none">
              Page {index + 1}
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
            shapes={pageShapes}
            tool={tool}
            color={inkColor}
            size={inkSize}
            geoKind={geoKind}
            fill={fill}
            selectedId={selectedShapeId}
            readonly={readonly || !ink}
            onCommit={onCommitShape}
            onMove={onMoveShape}
            onSelect={onSelectShape}
            onResize={onResizeShape}
          />
        ) : null}
        <InkOverlay
          width={w}
          height={h}
          zoom={zoom}
          paperWidth={page.width}
          paperHeight={page.height}
          blocks={blocks}
          tool={tool}
          color={inkColor}
          size={inkSize}
          pens={inkPens}
          readonly={!ink || readonly || !active}
          onCommitStroke={ink?.onCommitStroke}
          onErase={ink?.onErase}
        />
      </View>
    </Pressable>
  );
});

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
  pager: {
    position: "absolute",
    left: 12,
    bottom: 12,
    width: 64,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    alignItems: "center",
    paddingVertical: 8,
    gap: 2,
    shadowColor: "#1c1b18",
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    zIndex: 9,
  },
  pagerBtn: {
    width: 44,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  pagerNum: {
    fontSize: 19,
    fontWeight: "700",
    color: "#4c5f82",
    textAlign: "center",
  },
  pagerPlus: {
    fontSize: 22,
    fontWeight: "600",
    color: "#4c5f82",
    textAlign: "center",
    lineHeight: 26,
  },
  pagerDiv: {
    width: 14,
    height: 2,
    borderRadius: 1,
    backgroundColor: "#a3adbd",
    marginVertical: 3,
  },
});
