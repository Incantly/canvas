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
  documentId,
  documentNodeId,
  type AssetId,
  type BrandedId,
  type CitationId,
  type CommentId,
  type DocumentId,
  type DocumentNodeId,
} from './ids.js'

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
