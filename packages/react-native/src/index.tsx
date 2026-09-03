import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ForwardedRef,
} from "react";
import { View, StyleSheet } from "react-native";
import type {
  ColorId,
  DocumentBlock,
  DrawingStroke,
  FillId,
  GeoId,
  PaperSizeId,
  PaperStyleId,
  SizeId,
  TextBlock,
} from "@incantly/canvas/headless";
import {
  applyPageDocumentOverflow,
  pageContentRect,
  validateDocumentBlocks,
  documentBlocksFingerprint,
  debounce,
  pageTextBlocksToPlainLines,
  sanitizeInkPens,
  createGeoShape,
  createLineishShape,
  createTextShape,
  newId,
} from "@incantly/canvas/headless";
import { PageViewport } from "./document/PageViewport.js";
import { PAGE_FORMAT_BAR_HEIGHT } from "./document/PageRichTextEditor.js";
import { InkToolbar } from "./ink/InkToolbar.js";
import {
  commitDocumentInkStroke,
  eraseDocumentInkHits,
} from "./ink/commit.js";
import type { InkHit } from "./ink/types.js";
import { BoardViewport } from "./board/BoardViewport.js";
import type { ShapeDraft } from "./shapes/ShapeLayer.js";
import {
  commitBoardInkStroke,
  commitShape,
  eraseShapeIds,
  moveShape,
  resizeShape,
  updateShapeFill,
  updateTextShapeBlocks,
} from "./shapes/commit.js";
import { useCanvasStore } from "./store/use-canvas-store.js";
import { createStoreBridge } from "./store/store-bridge.js";
import type { CanvasProps, CanvasRef } from "./types/index.js";

export type {
  CanvasProps,
  CanvasRef,
  VersionSummary,
  SafeAreaInsets,
} from "./types/index.js";

export {
  Store,
  migrateSnapshot,
  safeParseSnapshot,
  snapshotFingerprint,
  documentBlocksFingerprint,
  textBlockToMarkdown,
  markdownToTextBlock,
  pageTextBlocksToMarkdown,
  markdownToPageTextBlocks,
  mergeMarkdownIntoPageDocument,
  applyPageDocumentOverflow,
  validateDocumentBlocks,
  createVersionManager,
  MemoryVersionStorage,
  createMutex,
  createSerialQueue,
  debounce,
  createNotebookPersistence,
  createSqliteVersionStorage,
  createExpoSqliteDriver,
  DEFAULT_INK_PENS,
  sanitizeInkPens,
  resolveInkPen,
} from "./headless-exports.js";

export type {
  Snapshot,
  Diff,
  DiffSource,
  DocumentBlock,
  TextBlock,
  ToolId,
  VersionManager,
  NotebookPersistence,
  NotebookPersistenceOptions,
  VersionStorage,
  DocumentVersion,
  SqliteDriver,
  ExpoSqliteLike,
  SqliteVersionStorageOptions,
  InkPenDefinition,
  InkPenStyle,
} from "./headless-exports.js";

export { TextBlockEditor, BlockFormatBar } from "./document/TextBlockEditor.js";
export { DocumentScrollView } from "./document/DocumentScrollView.js";
export {
  PageRichTextEditor,
  isEnrichedMarkdownAvailable,
  PAGE_FORMAT_BAR_HEIGHT,
} from "./document/PageRichTextEditor.js";
export { PageViewport } from "./document/PageViewport.js";
export { PaperBackground } from "./document/PaperBackground.js";
export { InkOverlay } from "./ink/InkOverlay.js";
export { InkToolbar } from "./ink/InkToolbar.js";
export { resolveInkBarItems } from "./ink/ink-bar-config.js";
export type {
  InkBarConfig,
  InkBarItemConfig,
  InkBarItemId,
  InkBarMode,
  ResolvedInkBarItem,
} from "./ink/ink-bar-config.js";
export { ShapeLayer } from "./shapes/ShapeLayer.js";
export { BoardViewport } from "./board/BoardViewport.js";
export { Minimap } from "./board/Minimap.js";
export {
  DEFAULT_FORMAT_BAR_ITEMS,
  resolveFormatBarItems,
} from "./document/format-bar-config.js";
export type {
  FormatBarConfig,
  FormatBarItemConfig,
  FormatBarItemId,
  BlockFormatAction,
} from "./document/format-bar-config.js";

export const Canvas = forwardRef(function Canvas(
  props: CanvasProps,
  ref: ForwardedRef<CanvasRef>,
) {
  const {
    snapshot,
    readonly = false,
    documentMode = true,
    onReady,
    onChange,
    onError,
    formatBar,
    inkBar,
    inkPens,
    versionStorage,
    notebookId,
    style,
  } = props;

  const pens = useMemo(() => sanitizeInkPens(inkPens), [inkPens]);
  const initialTool = documentMode ? "type" : "draw";
  const toolRef = useRef<string>(initialTool);
  const colorRef = useRef<ColorId>("black");
  const sizeRef = useRef<SizeId>("m");
  const fillRef = useRef<FillId>("none");
  const [tool, setTool] = useState<string>(initialTool);
  const [inkColor, setInkColor] = useState<ColorId>("black");
  const [inkSize, setInkSize] = useState<SizeId>("m");
  const [geoKind, setGeoKind] = useState<GeoId>("rectangle");
  const [fill, setFill] = useState<FillId>("none");
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  toolRef.current = tool;
  colorRef.current = inkColor;
  sizeRef.current = inkSize;
  fillRef.current = fill;
  const lastFpRef = useRef("");
  const { store, versionManager, loadSnapshot, getSnapshot, notify } =
    useCanvasStore({
      onChange,
      versionStorage,
      notebookId,
    });

  const pages = store.pages();
  const [currentPageId, setCurrentPageId] = useState(() => pages[0]?.id ?? "");
  const currentPageIdRef = useRef(currentPageId);
  currentPageIdRef.current = currentPageId;

  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const [caretAtEnd, setCaretAtEnd] = useState(false);
  const overflowQuietUntilRef = useRef(0);

  const activeId = store.page(currentPageId)
    ? currentPageId
    : (pages[0]?.id ?? "");
  const storeBlocks = validateDocumentBlocks(
    activeId
      ? store.pageDocumentBlocks(activeId)
      : store.notebookDocumentBlocks(),
  );
  const [localBlocks, setLocalBlocks] = useState<DocumentBlock[]>(storeBlocks);
  const localFpRef = useRef(documentBlocksFingerprint(storeBlocks));
  const lastPlainLenRef = useRef(
    pageTextBlocksToPlainLines(storeBlocks).length,
  );

  const syncLocalFromPage = useCallback(
    (pageId: string) => {
      const trimmed = validateDocumentBlocks(store.pageDocumentBlocks(pageId));
      const trimmedFp = documentBlocksFingerprint(trimmed);
      lastFpRef.current = trimmedFp;
      localFpRef.current = trimmedFp;
      lastPlainLenRef.current = pageTextBlocksToPlainLines(trimmed).length;
      setLocalBlocks(trimmed);
    },
    [store],
  );

  const followOverflowPage = useCallback(
    (overflowPageId?: string) => {
      if (!overflowPageId || !store.page(overflowPageId)) return false;
      if (overflowPageId === currentPageIdRef.current) return false;
      setCaretAtEnd(true);
      overflowQuietUntilRef.current = Date.now() + 500;
      setCurrentPageId(overflowPageId);
      currentPageIdRef.current = overflowPageId;
      syncLocalFromPage(overflowPageId);
      return true;
    },
    [store, syncLocalFromPage],
  );

  useEffect(() => {
    const fp = documentBlocksFingerprint(storeBlocks);
    if (fp !== localFpRef.current && fp !== lastFpRef.current) {
      localFpRef.current = fp;
      setLocalBlocks(storeBlocks);
    }
  }, [storeBlocks, activeId]);

  useImperativeHandle(
    ref,
    () =>
      createStoreBridge({
        store,
        versionManager,
        getSnapshot,
        loadSnapshot,
        notify,
        toolRef,
        colorRef,
        sizeRef,
        currentPageIdRef,
        onToolChange: setTool,
        onColorChange: setInkColor,
        onSizeChange: setInkSize,
        allowedInkTools: () => [
          "type",
          "select",
          "hand",
          "eraser",
          "line",
          "arrow",
          "geo",
          "text",
          ...pens.map((p) => p.id),
        ],
      }),
    [store, versionManager, getSnapshot, loadSnapshot, notify, pens],
  );

  useEffect(() => {
    if (tool !== "select" && tool !== "text") setEditingTextId(null);
  }, [tool]);

  useEffect(() => {
    if (!snapshot) {
      onReady?.();
      return;
    }
    try {
      loadSnapshot(snapshot, "remote");
      const first = store.pages()[0];
      if (first) {
        setCurrentPageId(first.id);
        currentPageIdRef.current = first.id;
      }
      const blocks = validateDocumentBlocks(
        first
          ? store.pageDocumentBlocks(first.id)
          : store.notebookDocumentBlocks(),
      );
      const fp = documentBlocksFingerprint(blocks);
      lastFpRef.current = fp;
      localFpRef.current = fp;
      setLocalBlocks(blocks);
      onReady?.();
    } catch (e) {
      onError?.(e instanceof Error ? e.message : String(e));
    }
    // Only re-run when snapshot identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot]);

  const writeStore = useCallback(
    (blocks: DocumentBlock[], overflowOpts?: { maxContentHeight?: number }) => {
      const pageId = currentPageIdRef.current;
      if (!pageId || !store.page(pageId)) return;
      const validated = validateDocumentBlocks(blocks);
      const fp = documentBlocksFingerprint(validated);
      if (fp === lastFpRef.current && !overflowOpts?.maxContentHeight) return;
      lastFpRef.current = fp;
      store.setPageDocument(pageId, validated, "user");
      const inset = PAGE_FORMAT_BAR_HEIGHT / Math.max(0.35, zoomRef.current);
      const overflow = applyPageDocumentOverflow(store, pageId, "user", {
        contentInsetBottom: inset,
        maxContentHeight: overflowOpts?.maxContentHeight,
      });
      const trimmed = validateDocumentBlocks(store.pageDocumentBlocks(pageId));
      const trimmedFp = documentBlocksFingerprint(trimmed);
      lastFpRef.current = trimmedFp;
      if (overflow.changed && followOverflowPage(overflow.overflowPageId)) {
        notify();
        return;
      }
      if (overflow.changed || trimmedFp !== fp) {
        localFpRef.current = trimmedFp;
        lastPlainLenRef.current = pageTextBlocksToPlainLines(trimmed).length;
        setLocalBlocks(trimmed);
      }
      notify();
    },
    [store, notify, followOverflowPage],
  );

  const debouncedWrite = useRef(
    debounce((...args: unknown[]) => {
      writeStore(args[0] as DocumentBlock[]);
    }, 300),
  );

  useEffect(() => {
    const d = debouncedWrite.current;
    return () => {
      d.flush();
      d.dispose();
    };
  }, []);

  const onChangeBlocks = useCallback((blocks: DocumentBlock[]) => {
    const validated = validateDocumentBlocks(blocks);
    localFpRef.current = documentBlocksFingerprint(validated);
    setLocalBlocks(validated);
    debouncedWrite.current(validated);
    // Large paste: don't wait for the debounce — reflow onto the next page immediately.
    const plainLen = pageTextBlocksToPlainLines(validated).length;
    if (plainLen - lastPlainLenRef.current > 180) {
      debouncedWrite.current.flush();
    }
    lastPlainLenRef.current = plainLen;
  }, []);

  const onOverflowRequest = useCallback(
    (measuredHeight: number, boxHeight: number) => {
      if (Date.now() < overflowQuietUntilRef.current) return;
      const pageId = currentPageIdRef.current;
      if (!pageId || !store.page(pageId)) return;
      debouncedWrite.current.flush();
      const page = store.page(pageId);
      if (!page) return;
      const rect = pageContentRect(page);
      const inset = PAGE_FORMAT_BAR_HEIGHT / Math.max(0.35, zoomRef.current);
      if (measuredHeight <= boxHeight + 8) return;
      const overflow = applyPageDocumentOverflow(store, pageId, "user", {
        contentInsetBottom: inset,
        maxContentHeight: Math.max(80, rect.h - inset),
      });
      if (overflow.changed) {
        if (!followOverflowPage(overflow.overflowPageId)) {
          syncLocalFromPage(pageId);
        }
        notify();
      }
    },
    [store, notify, syncLocalFromPage, followOverflowPage],
  );

  const editable = documentMode && !readonly;

  const selectPage = useCallback(
    (pageId: string) => {
      if (!store.page(pageId)) return;
      setCaretAtEnd(false);
      setCurrentPageId(pageId);
      currentPageIdRef.current = pageId;
      const blocks = validateDocumentBlocks(store.pageDocumentBlocks(pageId));
      const fp = documentBlocksFingerprint(blocks);
      lastFpRef.current = fp;
      localFpRef.current = fp;
      setLocalBlocks(blocks);
      notify();
    },
    [store, notify],
  );

  const addPage = useCallback(() => {
    const page = store.addPage({ paperSize: "letter" });
    notify();
    selectPage(page.id);
  }, [store, notify, selectPage]);

  const removePage = useCallback(() => {
    const id = currentPageIdRef.current;
    if (!id) return;
    store.removePage(id);
    const next = store.pages()[0];
    notify();
    if (next) selectPage(next.id);
  }, [store, notify, selectPage]);

  const setPaperSize = useCallback(
    (paperSize: PaperSizeId) => {
      const id = currentPageIdRef.current;
      if (!id) return;
      store.setPagePaper(id, { paperSize });
      const inset = PAGE_FORMAT_BAR_HEIGHT / Math.max(0.35, zoomRef.current);
      applyPageDocumentOverflow(store, id, "user", {
        contentInsetBottom: inset,
      });
      syncLocalFromPage(id);
      notify();
    },
    [store, notify, syncLocalFromPage],
  );

  const setPaperStyle = useCallback(
    (paperStyle: PaperStyleId) => {
      const id = currentPageIdRef.current;
      if (!id) return;
      store.setPagePaper(id, { paperStyle });
      notify();
    },
    [store, notify],
  );

  const onCommitStroke = useCallback(
    (stroke: DrawingStroke) => {
      const pageId = currentPageIdRef.current;
      if (!pageId || !store.page(pageId)) return;
      if (commitDocumentInkStroke(store, pageId, stroke)) {
        syncLocalFromPage(pageId);
        notify();
      }
    },
    [store, notify, syncLocalFromPage],
  );

  const onEraseHits = useCallback(
    (hits: InkHit[]) => {
      const pageId = currentPageIdRef.current;
      if (!pageId || !store.page(pageId)) return;
      if (eraseDocumentInkHits(store, pageId, hits)) {
        syncLocalFromPage(pageId);
        notify();
      }
    },
    [store, notify, syncLocalFromPage],
  );

  const pageShapes = activeId ? store.shapesOnPage(activeId) : [];

  const onCommitShape = useCallback(
    (draft: ShapeDraft) => {
      const pageId = currentPageIdRef.current;
      if (!pageId || !store.page(pageId)) return;
      const z = store.maxZ() + 1;
      const shape =
        draft.kind === "lineish"
          ? createLineishShape({
              id: newId(),
              type: draft.type,
              parentId: pageId,
              z,
              x: draft.x,
              y: draft.y,
              dx: draft.dx,
              dy: draft.dy,
              color: draft.color,
              size: draft.size,
            })
          : createGeoShape({
              id: newId(),
              parentId: pageId,
              z,
              x: draft.x,
              y: draft.y,
              w: draft.w,
              h: draft.h,
              geo: draft.geo,
              color: draft.color,
              size: draft.size,
              fill: draft.fill,
            });
      if (commitShape(store, shape)) {
        setSelectedShapeId(shape.id);
        setEditingTextId(null);
        setTool("select");
        notify();
      }
    },
    [store, notify],
  );

  const onMoveShape = useCallback(
    (id: string, x: number, y: number) => {
      if (moveShape(store, id, x, y)) notify();
    },
    [store, notify],
  );

  const onPlaceText = useCallback(
    (x: number, y: number) => {
      const pageId = currentPageIdRef.current;
      if (!pageId || !store.page(pageId)) return;
      const shape = createTextShape({
        id: newId(),
        parentId: pageId,
        z: store.maxZ() + 1,
        x,
        y,
        color: colorRef.current,
        size: sizeRef.current,
        fill: fillRef.current,
      });
      if (commitShape(store, shape)) {
        setSelectedShapeId(shape.id);
        setEditingTextId(shape.id);
        setTool("select");
        notify();
      }
    },
    [store, notify],
  );

  const onResizeShape = useCallback(
    (id: string, box: { x: number; y: number; w: number; h: number }) => {
      if (resizeShape(store, id, box)) notify();
    },
    [store, notify],
  );

  const onChangeText = useCallback(
    (id: string, blocks: TextBlock[]) => {
      if (updateTextShapeBlocks(store, id, blocks)) notify();
    },
    [store, notify],
  );

  const onCommitBoardInk = useCallback(
    (stroke: DrawingStroke) => {
      const pageId = currentPageIdRef.current;
      if (!pageId || !store.page(pageId)) return;
      if (commitBoardInkStroke(store, pageId, stroke)) notify();
    },
    [store, notify],
  );

  const onEraseShapeIds = useCallback(
    (ids: string[]) => {
      if (eraseShapeIds(store, ids)) {
        if (selectedShapeId && ids.includes(selectedShapeId)) setSelectedShapeId(null);
        if (editingTextId && ids.includes(editingTextId)) setEditingTextId(null);
        notify();
      }
    },
    [store, notify, selectedShapeId, editingTextId],
  );

  const selectedRec = selectedShapeId ? store.get(selectedShapeId) : undefined;
  const selectedIsBox =
    selectedRec &&
    selectedRec.typeName === "shape" &&
    (selectedRec.type === "text" || selectedRec.type === "geo");
  const toolbarFill = selectedIsBox
    ? ((selectedRec.props as { fill?: FillId }).fill ?? fill)
    : fill;

  const onFillChange = useCallback(
    (next: FillId) => {
      setFill(next);
      fillRef.current = next;
      if (selectedShapeId && updateShapeFill(store, selectedShapeId, next)) notify();
    },
    [store, notify, selectedShapeId],
  );

  const onSelectShape = useCallback((id: string | null) => {
    setSelectedShapeId(id);
    if (!id) setEditingTextId(null);
  }, []);

  const onToolChange = useCallback((next: string) => {
    setTool(next);
    if (next !== "select" && next !== "text") setEditingTextId(null);
  }, []);

  return (
    <View style={[styles.root, style]}>
      {!readonly ? (
        <InkToolbar
          tool={tool}
          color={inkColor}
          size={inkSize}
          pens={pens}
          inkBar={inkBar}
          mode={documentMode ? "notes" : "board"}
          geoKind={geoKind}
          fill={toolbarFill}
          showFill={!!selectedIsBox}
          onTool={onToolChange}
          onColor={setInkColor}
          onSize={setInkSize}
          onGeoKind={setGeoKind}
          onFill={onFillChange}
        />
      ) : null}
      {documentMode ? (
        <PageViewport
          pages={pages}
          currentPageId={activeId}
          blocks={localBlocks}
          zoom={zoom}
          readonly={!editable}
          formatBar={formatBar}
          onChangeBlocks={editable ? onChangeBlocks : undefined}
          onSelectPage={selectPage}
          onAddPage={addPage}
          onRemovePage={removePage}
          onPaperSize={setPaperSize}
          onPaperStyle={setPaperStyle}
          onZoom={setZoom}
          onError={onError}
          onOverflowRequest={editable ? onOverflowRequest : undefined}
          caretAtEnd={caretAtEnd}
          shapes={pageShapes}
          geoKind={geoKind}
          fill={fill}
          selectedShapeId={selectedShapeId}
          onCommitShape={editable ? onCommitShape : undefined}
          onMoveShape={editable ? onMoveShape : undefined}
          onSelectShape={onSelectShape}
          onResizeShape={editable ? onResizeShape : undefined}
          ink={
            editable
              ? {
                  tool,
                  color: inkColor,
                  size: inkSize,
                  pens,
                  onCommitStroke,
                  onErase: onEraseHits,
                }
              : undefined
          }
        />
      ) : (
        <BoardViewport
          shapes={pageShapes}
          pageId={activeId}
          tool={tool}
          color={inkColor}
          size={inkSize}
          geoKind={geoKind}
          fill={fill}
          pens={pens}
          selectedId={selectedShapeId}
          readonly={readonly}
          onCommitShape={onCommitShape}
          onMoveShape={onMoveShape}
          onSelect={onSelectShape}
          onPlaceText={onPlaceText}
          onChangeText={onChangeText}
          onResizeShape={onResizeShape}
          editingTextId={editingTextId}
          onEditText={setEditingTextId}
          onCommitInk={onCommitBoardInk}
          onEraseInk={onEraseHits}
          onEraseShapeIds={onEraseShapeIds}
        />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#e8e4dc" },
});
