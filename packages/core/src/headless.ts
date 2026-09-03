/**
 * Platform-agnostic headless export for React Native and sync clients.
 * No DOM, Canvas2D, or window APIs.
 */
export { Store, newId, isDiffEmpty, invertDiff, composeDiff } from "./store.js";
export type { DiffSource, Diff, Snapshot } from "./types/operations.js";
export type { SerializedSchema } from "./types/schema.js";
export { CURRENT_SCHEMA } from "./types/schema.js";
export { migrateSnapshot } from "./migrations/index.js";

export type {
  ShapeType,
  ShapeRecord,
  AssetRecord,
  BoardRecord,
  PageRecord,
  NotebookRecord,
  PageDocumentRecord,
  DrawShapeProps,
  LineishShapeProps,
  GeoShapeProps,
  TextShapeProps,
  NoteShapeProps,
  ImageShapeProps,
} from "./types/models.js";

export type {
  BlockType,
  InlineSpan,
  TextBlock,
  DrawingBlock,
  DrawingStroke,
  ImageBlock,
  DocumentBlock,
  RichTextLink,
} from "./rich-text/types.js";

export {
  isDrawingBlock,
  isImageBlock,
  isTextBlock,
} from "./rich-text/types.js";

export {
  emptyDocument,
  textToBlocks,
  blocksToPlainText,
  isEmptyDocument,
  validateBlocks,
  mergeAdjacentSpans,
} from "./rich-text/document.js";

export {
  textBlockToMarkdown,
  markdownToTextBlock,
  textBlocksToMarkdown,
  markdownLinesToTextBlocks,
} from "./rich-text/markdown-serialize.js";

export {
  pageTextBlocksToMarkdown,
  markdownToPageTextBlocks,
  mergeMarkdownIntoPageDocument,
  pageTextBlocksToPlainLines,
  applyInlineMarkToPageRange,
} from "./rich-text/page-markdown.js";

export {
  estimateTextBlockHeight,
  estimateDocumentHeight,
  splitBlocksToFitContent,
  paginateBlocks,
  planPageOverflow,
  applyPageDocumentOverflow,
  isVisuallyEmptyPage,
  isOverflowEmpty,
} from "./page-document-paginate.js";

export {
  validateDocumentBlocks,
  layoutPageDocument,
  DRAWING_BLOCK_MIN_HEIGHT,
  drawingBlockHeight,
  consolidateDocumentBlocks,
  strokeBoundsHeight,
  hitDocumentStroke,
  removeDocumentStroke,
  appendStrokeToDrawingBlock,
  extendDrawingStroke,
  insertDrawingBlockAfter,
  findDrawingTarget,
} from "./page-document-blocks.js";

export {
  PAGE_DOC_MARGIN_X,
  PAGE_DOC_MARGIN_Y,
  PAGE_DOC_FONT_SIZE,
  pageContentRect,
  getPageDocument,
  pointInPageContent,
  notesPageContentRect,
  pointInNotesContent,
  pointInNotesPaper,
} from "./page-document.js";

export {
  NOTES_MIN_BODY_HEIGHT,
  notesContentWidth,
  notesPaperHeight,
  notesPaperBounds,
  virtualPrintPages,
  mergePageDocumentsIntoNotebook,
} from "./notebook-document.js";

export type { VirtualPrintPage } from "./notebook-document.js";

export {
  PAGE_GAP_PRESETS,
  PAGE_GAP_STEP,
  DEFAULT_PAGE_GAP,
  MAX_PAGE_GAP,
  NOTEBOOK_ID,
  PAPER_SIZE_PRESETS,
  paperSizePreset,
  validatePaperStyle,
  validatePaperSizeId,
  paperStyleToGridId,
  inferPaperSizeId,
} from "./pages.js";

export {
  themeOf,
  THEMES,
  COLOR_IDS,
  SIZE_IDS,
  SIZES,
  FONT_SIZES,
  GEO_IDS,
  DASH_IDS,
  FILL_IDS,
  HIGHLIGHT_ALPHA,
  HIGHLIGHT_SCALE,
} from "./palette.js";

export type {
  ColorId,
  SizeId,
  FontId,
  DashId,
  FillId,
  GeoId,
  ThemeId,
  GridId,
  PageLayout,
  PaperStyleId,
  PaperSizeId,
  Bounds,
  Camera,
  ToolId,
} from "./types/base.js";

export {
  boundsUnion,
  boundsExpand,
  boundsContain,
  boundsIntersect,
  ptsBounds,
  traceSmooth,
  distToSegSq,
  geoPolygon,
  ellipsePolygon,
  distToPolyline,
  pointInPolygon,
  pointInEllipse,
  rotWith,
  clamp,
} from "./geometry.js";

export { strokeOutline } from "./freehand.js";

export {
  createVersionManager,
  type VersionManager,
  type VersionManagerOptions,
  type VersionManagerStore,
  type DocumentVersion,
  type VersionStorage,
  type VersionKind,
} from "./version-history.js";

export { MemoryVersionStorage } from "./storage/memory-version-storage.js";

export * from "./utils/index.js";
