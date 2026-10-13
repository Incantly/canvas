/** Platform-agnostic exports for React Native, workers, servers, and sync clients. */
export { Store, newId, isDiffEmpty, invertDiff, composeDiff } from './store.js'
export * from './document/index.js'
export {
  blocksToPlainText,
  emptyCanvasText,
  getShapeBlocks,
  migrateCanvasTextProps,
  textToBlocks,
  type CanvasTextBlock,
  type CanvasTextSpan,
  type TextBlock,
} from './canvas-text.js'
export {
  isDrawingBlock,
  type CanvasInkGroup,
  type CanvasInkStroke,
  type DocumentBlock,
  type DrawingStroke,
} from './canvas-ink.js'
export type { DiffSource, Diff, Snapshot } from './types/operations.js'
export type { SerializedSchema } from './types/schema.js'
export { CURRENT_SCHEMA } from './types/schema.js'
export { migrateSnapshot } from './migrations/index.js'

export type {
  ShapeType, ShapeRecord, BoardRecord, PageRecord, NotebookRecord,
  DrawShapeProps, LineishShapeProps, GeoShapeProps, TextShapeProps,
  NoteShapeProps, ImageShapeProps,
} from './types/models.js'

export {
  PAGE_GAP_PRESETS, PAGE_GAP_STEP, DEFAULT_PAGE_GAP, MAX_PAGE_GAP, NOTEBOOK_ID,
  PAPER_SIZE_PRESETS, paperSizePreset, validatePaperStyle, validatePaperSizeId,
  paperStyleToGridId, inferPaperSizeId,
} from './pages.js'
export {
  themeOf, THEMES, COLOR_IDS, SIZE_IDS, SIZES, FONT_SIZES, GEO_IDS,
  DASH_IDS, FILL_IDS, HIGHLIGHT_ALPHA, HIGHLIGHT_SCALE,
} from './palette.js'
export type {
  ColorId, SizeId, FontId, DashId, FillId, GeoId, ThemeId, GridId,
  PageLayout, PaperStyleId, PaperSizeId, Bounds, Camera, ToolId,
} from './types/base.js'
export {
  boundsUnion, boundsExpand, boundsContain, boundsIntersect, ptsBounds,
  traceSmooth, distToSegSq, geoPolygon, ellipsePolygon, distToPolyline,
  pointInPolygon, pointInEllipse, rotWith, clamp,
} from './geometry.js'
export { strokeOutline } from './freehand.js'
export {
  createVersionManager,
  type VersionManager, type VersionManagerOptions, type VersionManagerStore,
  type DocumentVersion, type VersionStorage, type VersionKind,
} from './version-history.js'
export { MemoryVersionStorage } from './storage/memory-version-storage.js'
export * from './utils/index.js'
