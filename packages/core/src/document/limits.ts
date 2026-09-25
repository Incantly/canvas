/** Resource and attribute limits applied before untrusted document JSON is used. */
export const DOCUMENT_LIMITS = {
  maxDepth: 32,
  maxNodes: 100_000,
  maxTotalTextLength: 2_000_000,
  maxTextNodeLength: 100_000,
  maxTableRows: 1_000,
  maxTableColumns: 100,
  maxUrlLength: 2_048,
  maxAttributeStringLength: 10_000,
  maxFilenameLength: 255,
  maxMetadataItems: 1_000,
  maxMarksPerTextNode: 10,
} as const

export type DocumentLimits = typeof DOCUMENT_LIMITS
