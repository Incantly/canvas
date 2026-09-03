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
