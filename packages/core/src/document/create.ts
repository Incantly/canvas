import {
  CURRENT_DOCUMENT_SCHEMA_VERSION,
  DEFAULT_DOCUMENT_LANGUAGE,
  DEFAULT_PAGE_SETUP,
  DOCUMENT_TYPE,
} from './constants.js'
import {
  createDocumentId,
  createDocumentNodeId,
  documentId,
  documentNodeId,
  type DocumentId,
  type DocumentNodeId,
} from './ids.js'
import { normalizeInlineContent } from './inline.js'
import type {
  DocumentMetadata,
  DocumentNode,
  InlineNode,
  IncantlyDocument,
  PageSetup,
  ParagraphNode,
} from './types.js'

export interface CreateParagraphOptions {
  id?: DocumentNodeId | string
  text?: string
  content?: InlineNode[]
  attrs?: ParagraphNode['attrs']
}

export interface CreateDocumentOptions {
  id?: DocumentId | string
  title?: string
  metadata?: Partial<Omit<DocumentMetadata, 'pageSetup'>> & {
    pageSetup?: Partial<Omit<PageSetup, 'margins'>> & {
      margins?: Partial<PageSetup['margins']>
    }
  }
  content?: DocumentNode[]
  /** ISO timestamp or Date. Primarily useful for importers and deterministic tests. */
  now?: string | Date
  /** Defaults to true when content is omitted. */
  createInitialParagraph?: boolean
}

const isoTimestamp = (value: string | Date | undefined): string => {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') return value
  return new Date().toISOString()
}

const cloneDefaultPageSetup = (): PageSetup => ({
  mode: DEFAULT_PAGE_SETUP.mode,
  size: DEFAULT_PAGE_SETUP.size,
  orientation: DEFAULT_PAGE_SETUP.orientation,
  margins: { ...DEFAULT_PAGE_SETUP.margins },
  columns: DEFAULT_PAGE_SETUP.columns,
})

export function createParagraph(options: CreateParagraphOptions = {}): ParagraphNode {
  const content = options.content
    ? normalizeInlineContent(options.content)
    : options.text
      ? [{ type: 'text' as const, text: options.text }]
      : []

  return {
    id:
      typeof options.id === 'string'
        ? documentNodeId(options.id)
        : options.id ?? createDocumentNodeId(),
    type: 'paragraph',
    ...(options.attrs ? { attrs: { ...options.attrs } } : {}),
    content,
  }
}

export function createDocument(options: CreateDocumentOptions = {}): IncantlyDocument {
  const timestamp = isoTimestamp(options.now)
  const metadata = options.metadata
  const defaultPageSetup = cloneDefaultPageSetup()
  const suppliedPageSetup = metadata?.pageSetup
  const pageSetup: PageSetup = {
    ...defaultPageSetup,
    ...suppliedPageSetup,
    margins: {
      ...defaultPageSetup.margins,
      ...suppliedPageSetup?.margins,
    },
  }
  const shouldCreateParagraph = options.createInitialParagraph ?? options.content === undefined

  return {
    schemaVersion: CURRENT_DOCUMENT_SCHEMA_VERSION,
    id:
      typeof options.id === 'string'
        ? documentId(options.id)
        : options.id ?? createDocumentId(),
    type: DOCUMENT_TYPE,
    metadata: {
      title: options.title ?? metadata?.title ?? '',
      language: metadata?.language ?? DEFAULT_DOCUMENT_LANGUAGE,
      authors: metadata?.authors ? [...metadata.authors] : [],
      tags: metadata?.tags ? [...metadata.tags] : [],
      pageSetup,
      ...(metadata?.research ? { research: { ...metadata.research } } : {}),
    },
    content: options.content ? [...options.content] : shouldCreateParagraph ? [createParagraph()] : [],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}
