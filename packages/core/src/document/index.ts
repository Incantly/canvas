export {
  CURRENT_DOCUMENT_SCHEMA_VERSION,
  DEFAULT_DOCUMENT_LANGUAGE,
  DEFAULT_PAGE_SETUP,
  DOCUMENT_TYPE,
} from './constants.js'

export {
  assetId,
  citationId,
  commentId,
  createDocumentId,
  createDocumentNodeId,
  createDocumentTransactionId,
  documentId,
  documentNodeId,
  documentTransactionId,
  type AssetId,
  type BrandedId,
  type CitationId,
  type CommentId,
  type DocumentId,
  type DocumentNodeId,
  type DocumentTransactionId,
} from './ids.js'

export type {
  ClearDocumentAssetReferenceOperation,
  DeleteDocumentNodeOperation,
  DocumentOperation,
  InsertDocumentNodeOperation,
  MoveDocumentNodeOperation,
  ReplaceDocumentTextOperation,
  SetDocumentAssetReferenceOperation,
  SetDocumentPageSetupOperation,
  UpdateDocumentNodeOperation,
} from './operations.js'

export {
  DOCUMENT_TRANSACTION_LIMITS,
  applyDocumentTransaction,
  type ApplyDocumentTransactionResult,
  type DocumentTransaction,
  type DocumentTransactionBatchLimits,
  type DocumentTransactionIssue,
  type DocumentTransactionIssueCode,
  type DocumentTransactionOrigin,
} from './transactions.js'

export {
  commandAssetId,
  documentCommandToOperations,
  executeDocumentCommand,
  queryDocumentCommandState,
  type DeleteNodeCommand,
  type DocumentCommand,
  type DocumentCommandExecutionContext,
  type DocumentCommandIssue,
  type DocumentCommandIssueCode,
  type DocumentCommandPlanResult,
  type DocumentCommandState,
  type ExecuteDocumentCommandResult,
  type IndentListItemCommand,
  type InsertAudioCommand,
  type InsertBlockquoteCommand,
  type InsertBulletListCommand,
  type InsertCanvasEmbedCommand,
  type InsertChecklistCommand,
  type InsertCodeBlockCommand,
  type InsertFileAttachmentCommand,
  type InsertHeadingCommand,
  type InsertHorizontalRuleCommand,
  type InsertImageCommand,
  type InsertMathBlockCommand,
  type InsertOrderedListCommand,
  type InsertPageBreakCommand,
  type InsertParagraphCommand,
  type InsertPdfEmbedCommand,
  type InsertTableCommand,
  type InsertTableCommandIds,
  type InsertVideoEmbedCommand,
  type OutdentListItemCommand,
  type ReplaceTextCommand,
  type SetBlockAlignmentCommand,
  type SetPageSetupCommand,
  type SetTextMarkCommand,
  type UnsetTextMarkCommand,
} from './commands.js'

export {
  createCollapsedTextSelection,
  mapDocumentSelection,
  resolveDocumentSelection,
  type DocumentBlockRangeSelection,
  type DocumentNodeSelection,
  type DocumentSelection,
  type DocumentSelectionAffinity,
  type DocumentSelectionIssue,
  type DocumentSelectionIssueCode,
  type DocumentSelectionMappingFailure,
  type DocumentSelectionMappingFailureCode,
  type DocumentTextPoint,
  type DocumentTextSelection,
  type MapDocumentSelectionResult,
  type NoDocumentSelection,
  type ResolveDocumentSelectionResult,
  type ResolvedDocumentSelection,
} from './selection.js'

export {
  createDocument,
  createParagraph,
  type CreateDocumentOptions,
  type CreateParagraphOptions,
} from './create.js'

export {
  ALLOWED_LINK_PROTOCOLS,
  TEXT_MARK_ORDER,
  canCombineTextMarks,
  inlineContentToPlainText,
  normalizeInlineContent,
  normalizeLinkHref,
  normalizeTextMarks,
} from './inline.js'

export {
  DOCUMENT_NODE_RULES,
  MAX_BLOCKQUOTE_NESTING_DEPTH,
  MAX_DOCUMENT_NESTING_DEPTH,
  MAX_LIST_NESTING_DEPTH,
  MAX_TABLE_CELL_NESTING_DEPTH,
  VIDEO_EMBED_PROVIDERS,
  documentNodeToPlainText,
  documentNodesToPlainText,
  fallbackForUnsupportedNode,
  normalizeDocumentNode,
  type DocumentNodeRule,
  type NodeChildKind,
  type UnsupportedNodeFallback,
} from './nodes.js'

export {
  DOCUMENT_LIMITS,
  type DocumentLimits,
} from './limits.js'

export {
  DOCUMENT_ALLOWED_URL_PROTOCOLS,
  validateDocument,
  type DocumentValidationIssue,
  type DocumentValidationIssueCode,
  type DocumentValidationResult,
} from './validate.js'

export {
  normalizeDocument,
  recoverDocument,
  type DocumentRecoveryResult,
  type UnsupportedDocumentContent,
} from './normalize.js'

export {
  DocumentSerializationError,
  parseIncantlyDocument,
  serializeIncantlyDocument,
  type DocumentSerializationIssueCode,
  type ParseIncantlyDocumentOptions,
  type ParseIncantlyDocumentResult,
  type SerializeIncantlyDocumentOptions,
} from './serialize.js'

export {
  DOCUMENT_MIGRATIONS,
  DOCUMENT_SCHEMA_BOUNDARIES,
  DOCUMENT_V1_SCHEMA,
  detectDocumentSchemaVersion,
  migrateDocumentToCurrent,
  type DocumentMigration,
  type DocumentMigrationResult,
  type DocumentSchemaBoundary,
  type LegacyCanvasPageDocumentAdapter,
} from './migrations/index.js'

export {
  assetsHaveSameContent,
  contentAddressedAssetKey,
  type AssetBinary,
  type AssetHash,
  type AssetHasher,
  type AssetMetadata,
  type AssetRecord,
} from './assets.js'

export type {
  AppendDocumentUpdatesOptions,
  AppendDocumentUpdatesResult,
  AssetRepository,
  DocumentCheckpoint,
  DocumentRepository,
} from './repositories.js'

export type * from './types.js'
