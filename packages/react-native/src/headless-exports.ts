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
  DEFAULT_INK_PENS,
  sanitizeInkPens,
  resolveInkPen,
  inkBaseWidthPaper,
  sanitizeInkWidth,
  widthSliderToPaper,
  paperToWidthSlider,
  sanitizeEraserMode,
  sanitizeEraserRadius,
  INK_WIDTH_MIN_PAPER,
  INK_WIDTH_MAX_PAPER,
  INK_WIDTH_SLIDER_MIN,
  INK_WIDTH_SLIDER_MAX,
  DEFAULT_ERASER_RADIUS_PAPER,
  ERASER_RADIUS_MIN_PAPER,
  ERASER_RADIUS_MAX_PAPER,
} from '@incantly/canvas/headless'

export type {
  Snapshot,
  Diff,
  DiffSource,
  DocumentBlock,
  TextBlock,
  ToolId,
  VersionManager,
  VersionStorage,
  DocumentVersion,
  InkPenDefinition,
  InkPenStyle,
  EraserMode,
} from '@incantly/canvas/headless'

export {
  createNotebookPersistence,
  type NotebookPersistence,
  type NotebookPersistenceOptions,
} from './storage/notebook-persistence.js'

export {
  createSqliteVersionStorage,
  type SqliteVersionStorageOptions,
} from './storage/sqlite-version-storage.js'

export {
  createExpoSqliteDriver,
  type SqliteDriver,
  type ExpoSqliteLike,
} from './storage/sqlite-driver.js'
