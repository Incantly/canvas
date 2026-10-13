import { CURRENT_DOCUMENT_SCHEMA_VERSION, DEFAULT_DOCUMENT_LANGUAGE, DEFAULT_PAGE_SETUP } from './constants.js'
import { createParagraph } from './create.js'
import { assetId, citationId, documentId, documentNodeId } from './ids.js'
import { DOCUMENT_LIMITS } from './limits.js'
import { normalizeLinkHref, normalizeTextMarks } from './inline.js'
import { normalizeDocumentNode, VIDEO_EMBED_PROVIDERS } from './nodes.js'
import type {
  DocumentAuthor, DocumentMetadata, DocumentNode, IncantlyDocument, InlineNode,
  PageSetup, TextAlignment, TextMark,
} from './types.js'
import { validateDocument, type DocumentValidationIssue } from './validate.js'

export interface UnsupportedDocumentContent {
  path: string
  originalType?: string
  action: 'converted_to_paragraph' | 'omitted'
  plainText?: string
}

export interface DocumentRecoveryResult {
  document: IncantlyDocument
  issues: DocumentValidationIssue[]
  unsupportedContent: UnsupportedDocumentContent[]
}

type JsonRecord = Record<string, unknown>
type RecoveryContext = 'root' | 'blocks' | 'listItems' | 'checklistItems' | 'tableRows' | 'tableCells'
interface RecoveryState {
  usedIds: Set<string>
  nextId: number
  nodes: number
  text: number
  issues: DocumentValidationIssue[]
  unsupportedContent: UnsupportedDocumentContent[]
}

const isRecord = (value: unknown): value is JsonRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const safeString = (value: unknown, max: number = DOCUMENT_LIMITS.maxAttributeStringLength): string | undefined =>
  typeof value === 'string' ? value.slice(0, max) : undefined
const finite = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined
const positiveInt = (value: unknown, fallback: number, max = Number.MAX_SAFE_INTEGER): number => {
  const number = finite(value)
  return number === undefined ? fallback : Math.min(max, Math.max(1, Math.floor(number)))
}
const ALIGNMENTS = new Set<TextAlignment>(['left', 'center', 'right', 'justify'])
const COLOR_RE = /^(?:#[\da-f]{3,8}|(?:rgb|hsl)a?\([^\n]{1,80}\)|[a-z]{1,32})$/i
const LANGUAGE_RE = /^(?:[A-Za-z]{2,8})(?:-[A-Za-z0-9]{1,8})*$/
const MIME_RE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/i
const CODE_LANGUAGE_RE = /^[A-Za-z0-9][A-Za-z0-9_+.#-]{0,63}$/
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{1,128}$/

function warning(state: RecoveryState, code: DocumentValidationIssue['code'], path: string, message: string): void {
  state.issues.push({ code, path, message, severity: 'warning' })
}

function recoveredId(value: unknown, path: string, state: RecoveryState): ReturnType<typeof documentNodeId> {
  const base = typeof value === 'string' && value.trim()
    ? value.trim().slice(0, DOCUMENT_LIMITS.maxAttributeStringLength)
    : `node:recovered:${++state.nextId}`
  let candidate = base
  let suffix = 2
  while (state.usedIds.has(candidate)) candidate = `${base}~${suffix++}`
  if (candidate !== value) warning(state, 'duplicate_node_id', path, `Node ID was repaired as "${candidate}"`)
  state.usedIds.add(candidate)
  return documentNodeId(candidate)
}

function plainTextFromUnknown(value: unknown, remaining = DOCUMENT_LIMITS.maxTextNodeLength, depth = 0): string {
  if (remaining <= 0 || depth > DOCUMENT_LIMITS.maxDepth) return ''
  if (typeof value === 'string') return value.slice(0, remaining)
  if (Array.isArray(value)) return value.map((item) => plainTextFromUnknown(item, remaining, depth + 1)).filter(Boolean).join(' ').slice(0, remaining)
  if (!isRecord(value)) return ''
  for (const key of ['text', 'title', 'caption', 'alt', 'label', 'content']) {
    const text = plainTextFromUnknown(value[key], remaining, depth + 1)
    if (text) return text
  }
  return ''
}

function normalizeMarks(value: unknown): TextMark[] {
  const marks = normalizeTextMarks(value).slice(0, DOCUMENT_LIMITS.maxMarksPerTextNode)
  return marks.filter((mark) => {
    if (mark.type === 'link') return mark.href.length <= DOCUMENT_LIMITS.maxUrlLength && normalizeLinkHref(mark.href) !== null
    if (mark.type === 'textColor' || mark.type === 'highlight') return COLOR_RE.test(mark.color)
    if (mark.type === 'inlineMath') return mark.latex.length <= DOCUMENT_LIMITS.maxAttributeStringLength
    if (mark.type === 'citation') return String(mark.citationId).length <= DOCUMENT_LIMITS.maxAttributeStringLength
    return true
  }).map((mark) => mark.type === 'citation' ? { ...mark, citationId: citationId(String(mark.citationId)) } : mark)
}

function recoverInline(value: unknown, path: string, state: RecoveryState): InlineNode[] {
  if (!Array.isArray(value)) return []
  const output: InlineNode[] = []
  for (let index = 0; index < value.length; index++) {
    const candidate = value[index]
    if (!isRecord(candidate)) continue
    if (candidate.type === 'hardBreak') { output.push({ type: 'hardBreak' }); continue }
    if (candidate.type !== 'text' || typeof candidate.text !== 'string') continue
    const remaining = DOCUMENT_LIMITS.maxTotalTextLength - state.text
    if (remaining <= 0) { warning(state, 'limit_text', `${path}[${index}].text`, 'Text beyond the document limit was omitted'); break }
    const text = candidate.text.slice(0, Math.min(DOCUMENT_LIMITS.maxTextNodeLength, remaining))
    state.text += text.length
    if (!text) continue
    const marks = normalizeMarks(candidate.marks)
    const previous = output[output.length - 1]
    const next: InlineNode = { type: 'text', text, ...(marks.length ? { marks } : {}) }
    if (previous?.type === 'text' && JSON.stringify(previous.marks ?? []) === JSON.stringify(marks)) previous.text += text
    else output.push(next)
  }
  return output
}

function allowed(type: string, context: RecoveryContext): boolean {
  const blocks = !['listItem', 'checklistItem', 'tableRow', 'tableHeaderCell', 'tableCell'].includes(type)
  if (context === 'root' || context === 'blocks') return blocks
  if (context === 'listItems') return type === 'listItem'
  if (context === 'checklistItems') return type === 'checklistItem'
  if (context === 'tableRows') return type === 'tableRow'
  return type === 'tableHeaderCell' || type === 'tableCell'
}

function recoverChildren(value: unknown, path: string, state: RecoveryState, depth: number,
  context: RecoveryContext): DocumentNode[] {
  if (!Array.isArray(value)) return []
  const output: DocumentNode[] = []
  for (let index = 0; index < value.length; index++) {
    const node = recoverNode(value[index], `${path}[${index}]`, state, depth, context)
    if (node) output.push(node)
    if (state.nodes >= DOCUMENT_LIMITS.maxNodes) break
  }
  return output
}

function fallbackUnknown(value: unknown, path: string, state: RecoveryState, context: RecoveryContext): DocumentNode | null {
  const originalType = isRecord(value) && typeof value.type === 'string' ? value.type : undefined
  const text = plainTextFromUnknown(value).trim()
  if ((context === 'root' || context === 'blocks') && text && state.text < DOCUMENT_LIMITS.maxTotalTextLength) {
    const clipped = text.slice(0, Math.min(DOCUMENT_LIMITS.maxTextNodeLength, DOCUMENT_LIMITS.maxTotalTextLength - state.text))
    state.text += clipped.length
    const fallback = createParagraph({ id: recoveredId(undefined, `${path}.id`, state), text: clipped })
    state.unsupportedContent.push({ path, ...(originalType ? { originalType } : {}), action: 'converted_to_paragraph', plainText: clipped })
    warning(state, 'unsupported_content', path, 'Unsupported content was converted to a paragraph')
    return fallback
  }
  state.unsupportedContent.push({ path, ...(originalType ? { originalType } : {}), action: 'omitted', ...(text ? { plainText: text } : {}) })
  warning(state, 'unsupported_content', path, 'Unsupported content was omitted and recorded in the recovery report')
  return null
}

function recoverNode(value: unknown, path: string, state: RecoveryState, depth: number,
  context: RecoveryContext): DocumentNode | null {
  if (depth > DOCUMENT_LIMITS.maxDepth || state.nodes >= DOCUMENT_LIMITS.maxNodes) {
    warning(state, depth > DOCUMENT_LIMITS.maxDepth ? 'limit_depth' : 'limit_nodes', path, 'Content beyond a safety limit was omitted')
    return fallbackUnknown(value, path, state, context)
  }
  state.nodes++
  if (!isRecord(value) || typeof value.type !== 'string' || !allowed(value.type, context))
    return fallbackUnknown(value, path, state, context)
  const id = recoveredId(value.id, `${path}.id`, state)
  const attrs = isRecord(value.attrs) ? value.attrs : {}
  const alignment = ALIGNMENTS.has(attrs.alignment as TextAlignment) ? attrs.alignment as TextAlignment : undefined
  const blocks = (input: unknown, childPath = `${path}.content`): DocumentNode[] => {
    const result = recoverChildren(input, childPath, state, depth + 1, 'blocks')
    return result.length ? result : [createParagraph({ id: recoveredId(undefined, `${childPath}[0].id`, state) })]
  }
  switch (value.type) {
    case 'paragraph': {
      const lineHeight = finite(attrs.lineHeight)
      return { id, type: 'paragraph', ...((alignment || (lineHeight && lineHeight >= 0.5 && lineHeight <= 10)) ? { attrs: { ...(alignment ? { alignment } : {}), ...(lineHeight && lineHeight >= 0.5 && lineHeight <= 10 ? { lineHeight } : {}) } } : {}), content: recoverInline(value.content, `${path}.content`, state) }
    }
    case 'heading': return { id, type: 'heading', attrs: { level: positiveInt(attrs.level, 1, 6) as 1 | 2 | 3 | 4 | 5 | 6, ...(alignment ? { alignment } : {}) }, content: recoverInline(value.content, `${path}.content`, state) }
    case 'blockquote': return { id, type: 'blockquote', content: blocks(value.content) }
    case 'bulletList': {
      const content = recoverChildren(value.content, `${path}.content`, state, depth + 1, 'listItems')
      return { id, type: 'bulletList', content: content as Extract<DocumentNode, { type: 'listItem' }>[] }
    }
    case 'orderedList': {
      const content = recoverChildren(value.content, `${path}.content`, state, depth + 1, 'listItems')
      const start = positiveInt(attrs.start, 1)
      return { id, type: 'orderedList', ...(start === 1 ? {} : { attrs: { start } }), content: content as Extract<DocumentNode, { type: 'listItem' }>[] }
    }
    case 'checklist': {
      const content = recoverChildren(value.content, `${path}.content`, state, depth + 1, 'checklistItems')
      return { id, type: 'checklist', content: content as Extract<DocumentNode, { type: 'checklistItem' }>[] }
    }
    case 'listItem': return { id, type: 'listItem', content: blocks(value.content) }
    case 'checklistItem': return { id, type: 'checklistItem', attrs: { checked: attrs.checked === true }, content: blocks(value.content) }
    case 'horizontalRule': return { id, type: 'horizontalRule' }
    case 'codeBlock': {
      const remaining = Math.max(0, DOCUMENT_LIMITS.maxTotalTextLength - state.text)
      const text = safeString(value.text, Math.min(DOCUMENT_LIMITS.maxTextNodeLength, remaining)) ?? ''
      state.text += text.length
      const language = safeString(attrs.language, 64)
      return { id, type: 'codeBlock', ...(language && CODE_LANGUAGE_RE.test(language) ? { attrs: { language } } : {}), text }
    }
    case 'mathBlock': return { id, type: 'mathBlock', attrs: { latex: safeString(attrs.latex) ?? '', ...(attrs.numbered === true ? { numbered: true } : {}), ...(safeString(attrs.label) ? { label: safeString(attrs.label) } : {}) } }
    case 'table': {
      const input = Array.isArray(value.content) ? value.content.slice(0, DOCUMENT_LIMITS.maxTableRows) : []
      const content = recoverChildren(input, `${path}.content`, state, depth + 1, 'tableRows')
      const caption = safeString(attrs.caption)
      return { id, type: 'table', ...(caption ? { attrs: { caption } } : {}), content: content as Extract<DocumentNode, { type: 'tableRow' }>[] }
    }
    case 'tableRow': {
      const input = Array.isArray(value.content) ? value.content.slice(0, DOCUMENT_LIMITS.maxTableColumns) : []
      const content = recoverChildren(input, `${path}.content`, state, depth + 1, 'tableCells')
      return { id, type: 'tableRow', content: content as Array<Extract<DocumentNode, { type: 'tableCell' | 'tableHeaderCell' }>> }
    }
    case 'tableHeaderCell': case 'tableCell': {
      const cellAttrs = { ...(positiveInt(attrs.colspan, 1, DOCUMENT_LIMITS.maxTableColumns) !== 1 ? { colspan: positiveInt(attrs.colspan, 1, DOCUMENT_LIMITS.maxTableColumns) } : {}), ...(positiveInt(attrs.rowspan, 1, DOCUMENT_LIMITS.maxTableRows) !== 1 ? { rowspan: positiveInt(attrs.rowspan, 1, DOCUMENT_LIMITS.maxTableRows) } : {}), ...(alignment ? { alignment } : {}) }
      return { id, type: value.type, ...(Object.keys(cellAttrs).length ? { attrs: cellAttrs } : {}), content: blocks(value.content) }
    }
    case 'image': {
      const width = finite(attrs.width); const height = finite(attrs.height)
      return { id, type: 'image', attrs: { assetId: assetId(safeString(attrs.assetId) || 'asset:missing'), ...(safeString(attrs.alt) ? { alt: safeString(attrs.alt) } : {}), ...(safeString(attrs.caption) ? { caption: safeString(attrs.caption) } : {}), ...(width && width > 0 && width <= 100_000 ? { width } : {}), ...(height && height > 0 && height <= 100_000 ? { height } : {}), ...(['inline', 'block', 'figure'].includes(String(attrs.display)) ? { display: attrs.display as 'inline' | 'block' | 'figure' } : {}) } }
    }
    case 'fileAttachment': {
      const filename = safeString(attrs.filename, DOCUMENT_LIMITS.maxFilenameLength)
      const mimeType = safeString(attrs.mimeType, 255)
      return { id, type: 'fileAttachment', attrs: { assetId: assetId(safeString(attrs.assetId) || 'asset:missing'), ...(filename && !/[\x00-\x1f/\\]/.test(filename) ? { filename } : {}), ...(mimeType && MIME_RE.test(mimeType) ? { mimeType } : {}), ...(['card', 'inline'].includes(String(attrs.display)) ? { display: attrs.display as 'card' | 'inline' } : {}) } }
    }
    case 'audio': return { id, type: 'audio', attrs: { assetId: assetId(safeString(attrs.assetId) || 'asset:missing'), ...(safeString(attrs.title) ? { title: safeString(attrs.title) } : {}), ...(safeString(attrs.caption) ? { caption: safeString(attrs.caption) } : {}) } }
    case 'videoEmbed': return { id, type: 'videoEmbed', attrs: { provider: (VIDEO_EMBED_PROVIDERS as readonly unknown[]).includes(attrs.provider) ? attrs.provider as 'youtube' | 'vimeo' : 'youtube', videoId: VIDEO_ID_RE.test(String(attrs.videoId ?? '')) ? String(attrs.videoId) : 'invalid', ...(safeString(attrs.title) ? { title: safeString(attrs.title) } : {}), ...(safeString(attrs.caption) ? { caption: safeString(attrs.caption) } : {}) } }
    case 'pdfEmbed': return { id, type: 'pdfEmbed', attrs: { assetId: assetId(safeString(attrs.assetId) || 'asset:missing'), ...(finite(attrs.page) ? { page: positiveInt(attrs.page, 1) } : {}), display: ['card', 'preview', 'reader'].includes(String(attrs.display)) ? attrs.display as 'card' | 'preview' | 'reader' : 'card', ...(safeString(attrs.extractedDocumentId) ? { extractedDocumentId: documentId(safeString(attrs.extractedDocumentId) as string) } : {}) } }
    case 'canvasEmbed': return { id, type: 'canvasEmbed', attrs: { canvasId: safeString(attrs.canvasId) || 'canvas:missing', ...(safeString(attrs.previewAssetId) ? { previewAssetId: assetId(safeString(attrs.previewAssetId) as string) } : {}), ...(safeString(attrs.caption) ? { caption: safeString(attrs.caption) } : {}), ...(['card', 'preview'].includes(String(attrs.display)) ? { display: attrs.display as 'card' | 'preview' } : {}) } }
    case 'pageBreak': return { id, type: 'pageBreak' }
    default: return fallbackUnknown(value, path, state, context)
  }
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, DOCUMENT_LIMITS.maxMetadataItems)
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.slice(0, DOCUMENT_LIMITS.maxAttributeStringLength))
}

function recoverMetadata(value: unknown, state: RecoveryState): DocumentMetadata {
  const metadata = isRecord(value) ? value : {}
  const page = isRecord(metadata.pageSetup) ? metadata.pageSetup : {}
  const margins = isRecord(page.margins) ? page.margins : {}
  const numberOr = (value: unknown, fallback: number, min = 0, max = 100_000): number => {
    const parsed = finite(value)
    return parsed === undefined || parsed < min || parsed > max ? fallback : parsed
  }
  const size = ['a4', 'letter', 'legal', 'custom'].includes(String(page.size)) ? page.size as PageSetup['size'] : DEFAULT_PAGE_SETUP.size
  const pageSetup: PageSetup = {
    mode: ['continuous', 'paginated'].includes(String(page.mode)) ? page.mode as PageSetup['mode'] : DEFAULT_PAGE_SETUP.mode,
    size,
    ...(size === 'custom' ? { width: numberOr(page.width, 612, 1), height: numberOr(page.height, 792, 1) } : {}),
    orientation: ['portrait', 'landscape'].includes(String(page.orientation)) ? page.orientation as PageSetup['orientation'] : DEFAULT_PAGE_SETUP.orientation,
    margins: { top: numberOr(margins.top, DEFAULT_PAGE_SETUP.margins.top, 0, 10_000), right: numberOr(margins.right, DEFAULT_PAGE_SETUP.margins.right, 0, 10_000), bottom: numberOr(margins.bottom, DEFAULT_PAGE_SETUP.margins.bottom, 0, 10_000), left: numberOr(margins.left, DEFAULT_PAGE_SETUP.margins.left, 0, 10_000) },
    columns: page.columns === 2 ? 2 : 1,
  }
  const authors: DocumentAuthor[] = Array.isArray(metadata.authors)
    ? metadata.authors.slice(0, DOCUMENT_LIMITS.maxMetadataItems).filter(isRecord).map((author) => ({ name: safeString(author.name) || 'Unknown author', ...(safeString(author.id) ? { id: safeString(author.id) } : {}), ...(safeString(author.email, 320) ? { email: safeString(author.email, 320) } : {}), ...(safeString(author.orcid, 64) ? { orcid: safeString(author.orcid, 64) } : {}), ...(Array.isArray(author.affiliations) ? { affiliations: stringArray(author.affiliations) } : {}) }))
    : []
  const language = safeString(metadata.language, 64)
  const research = isRecord(metadata.research) ? metadata.research : undefined
  const researchLanguage = safeString(research?.language, 64)
  const researchAuthors: DocumentAuthor[] | undefined = Array.isArray(research?.authors)
    ? research.authors.slice(0, DOCUMENT_LIMITS.maxMetadataItems).filter(isRecord).map((author) => ({ name: safeString(author.name) || 'Unknown author', ...(safeString(author.id) ? { id: safeString(author.id) } : {}), ...(safeString(author.email, 320) ? { email: safeString(author.email, 320) } : {}), ...(safeString(author.orcid, 64) ? { orcid: safeString(author.orcid, 64) } : {}), ...(Array.isArray(author.affiliations) ? { affiliations: stringArray(author.affiliations) } : {}) }))
    : undefined
  const abstract = Array.isArray(research?.abstract)
    ? recoverChildren(research.abstract, '$.metadata.research.abstract', state, 1, 'root')
    : undefined
  return {
    title: safeString(metadata.title) ?? '',
    language: language && LANGUAGE_RE.test(language) ? language : DEFAULT_DOCUMENT_LANGUAGE,
    authors,
    tags: stringArray(metadata.tags),
    pageSetup,
    ...(research ? { research: {
      ...(safeString(research.title) ? { title: safeString(research.title) } : {}),
      ...(researchAuthors ? { authors: researchAuthors } : {}),
      ...(abstract ? { abstract } : {}),
      ...(Array.isArray(research.keywords) ? { keywords: stringArray(research.keywords) } : {}),
      ...(researchLanguage && LANGUAGE_RE.test(researchLanguage) ? { language: researchLanguage } : {}),
      ...(safeString(research.citationStyle, 128) ? { citationStyle: safeString(research.citationStyle, 128) as string } : {}),
    } } : {}),
  }
}

function safeTimestamp(value: unknown): string {
  if (typeof value === 'string') {
    const timestamp = new Date(value)
    if (!Number.isNaN(timestamp.valueOf())) return timestamp.toISOString()
  }
  return new Date(0).toISOString()
}

/**
 * Explicit recovery path for untrusted or older JSON. It reconstructs a new object from
 * allowlisted fields, repairs duplicate IDs, and reports all unsupported content.
 */
export function recoverDocument(value: unknown): DocumentRecoveryResult {
  const strict = validateDocument(value)
  const state: RecoveryState = { usedIds: new Set(), nextId: 0, nodes: 0, text: 0, issues: [...strict.issues], unsupportedContent: [] }
  const record = isRecord(value) ? value : {}
  const content = recoverChildren(record.content, '$.content', state, 1, 'root')
  const document: IncantlyDocument = {
    schemaVersion: CURRENT_DOCUMENT_SCHEMA_VERSION,
    id: documentId(safeString(record.id) || 'document:recovered'),
    type: 'document',
    metadata: recoverMetadata(record.metadata, state),
    content: content.length ? content.map((node) => normalizeDocumentNode(node)) : [createParagraph({ id: recoveredId(undefined, '$.content[0].id', state) })],
    createdAt: safeTimestamp(record.createdAt),
    updatedAt: safeTimestamp(record.updatedAt),
  }
  return { document, issues: state.issues, unsupportedContent: state.unsupportedContent }
}

/** Normalizes a valid document through the same safe, idempotent reconstruction path. */
export function normalizeDocument(value: IncantlyDocument): IncantlyDocument {
  return recoverDocument(value).document
}
