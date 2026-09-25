/** First standalone Incantly document schema. */
export const CURRENT_DOCUMENT_SCHEMA_VERSION = 1 as const

export const DOCUMENT_TYPE = 'document' as const

export const DEFAULT_DOCUMENT_LANGUAGE = 'en' as const

export const DEFAULT_PAGE_SETUP = {
  mode: 'continuous',
  size: 'a4',
  orientation: 'portrait',
  margins: {
    top: 72,
    right: 72,
    bottom: 72,
    left: 72,
  },
  columns: 1,
} as const
