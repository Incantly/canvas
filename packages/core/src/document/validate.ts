import { CURRENT_DOCUMENT_SCHEMA_VERSION } from './constants.js'
import { DOCUMENT_LIMITS } from './limits.js'
import { ALLOWED_LINK_PROTOCOLS, canCombineTextMarks, normalizeLinkHref } from './inline.js'
import { VIDEO_EMBED_PROVIDERS } from './nodes.js'
import type { DocumentNode, IncantlyDocument, TextMark } from './types.js'

export type DocumentValidationIssueCode =
  | 'invalid_type' | 'invalid_value' | 'missing_field' | 'unknown_field'
  | 'unsupported_schema_version' | 'unknown_node' | 'unknown_mark'
  | 'invalid_child' | 'invalid_url' | 'invalid_color' | 'invalid_language'
  | 'invalid_mime_type' | 'invalid_filename' | 'duplicate_node_id'
  | 'limit_depth' | 'limit_nodes' | 'limit_text' | 'limit_table'
  | 'limit_url' | 'limit_attribute' | 'unsafe_key' | 'unsupported_content'

export interface DocumentValidationIssue {
  code: DocumentValidationIssueCode
  path: string
  message: string
  severity: 'error' | 'warning'
}

export interface DocumentValidationResult {
  valid: boolean
  issues: DocumentValidationIssue[]
  /** Present only when strict validation succeeds. */
  document?: IncantlyDocument
}

type JsonRecord = Record<string, unknown>
type ChildContext = 'root' | 'blocks' | 'listItems' | 'checklistItems' | 'tableRows' | 'tableCells'

const NODE_TYPES = new Set([
  'paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'checklist',
  'listItem', 'checklistItem', 'horizontalRule', 'codeBlock', 'mathBlock', 'table',
  'tableRow', 'tableHeaderCell', 'tableCell', 'image', 'fileAttachment', 'audio',
  'videoEmbed', 'pdfEmbed', 'canvasEmbed', 'pageBreak',
])
const BLOCK_TYPES = new Set([
  'paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'checklist',
  'horizontalRule', 'codeBlock', 'mathBlock', 'table', 'image', 'fileAttachment',
  'audio', 'videoEmbed', 'pdfEmbed', 'canvasEmbed', 'pageBreak',
])
const ALIGNMENTS = new Set(['left', 'center', 'right', 'justify'])
const DISPLAY_VALUES: Record<string, Set<string>> = {
  image: new Set(['inline', 'block', 'figure']),
  fileAttachment: new Set(['card', 'inline']),
  pdfEmbed: new Set(['card', 'preview', 'reader']),
  canvasEmbed: new Set(['card', 'preview']),
}
const SIMPLE_MARKS = new Set(['bold', 'italic', 'underline', 'strike', 'code'])
const COLOR_RE = /^(?:#[\da-f]{3,8}|(?:rgb|hsl)a?\([^\n]{1,80}\)|[a-z]{1,32})$/i
const LANGUAGE_RE = /^(?:[A-Za-z]{2,8})(?:-[A-Za-z0-9]{1,8})*$/
const MIME_RE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/i
const SAFE_LANGUAGE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_+.#-]{0,63}$/
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{1,128}$/
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/

const isRecord = (value: unknown): value is JsonRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const own = (record: JsonRecord, key: string): boolean => Object.prototype.hasOwnProperty.call(record, key)

function issue(issues: DocumentValidationIssue[], code: DocumentValidationIssueCode,
  path: string, message: string, severity: 'error' | 'warning' = 'error'): void {
  issues.push({ code, path, message, severity })
}

function rejectUnsafeKeys(value: unknown, path: string, issues: DocumentValidationIssue[]): void {
  const seen = new Set<object>()
  const pending: Array<{ value: unknown; path: string }> = [{ value, path }]
  while (pending.length) {
    const current = pending.pop() as { value: unknown; path: string }
    if (!current.value || typeof current.value !== 'object' || seen.has(current.value as object)) continue
    seen.add(current.value as object)
    if (Array.isArray(current.value)) {
      current.value.forEach((item, index) => pending.push({ value: item, path: `${current.path}[${index}]` }))
      continue
    }
    for (const key of Object.keys(current.value)) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor' || /^on[a-z]/i.test(key))
        issue(issues, 'unsafe_key', `${current.path}.${key}`, `Unsafe key "${key}" is not allowed`)
      pending.push({ value: (current.value as JsonRecord)[key], path: `${current.path}.${key}` })
    }
  }
}

function requiredString(record: JsonRecord, key: string, path: string,
  issues: DocumentValidationIssue[], max: number = DOCUMENT_LIMITS.maxAttributeStringLength): string | null {
  if (!own(record, key)) { issue(issues, 'missing_field', `${path}.${key}`, `${key} is required`); return null }
  const value = record[key]
  if (typeof value !== 'string' || value.length === 0) {
    issue(issues, 'invalid_type', `${path}.${key}`, `${key} must be a non-empty string`); return null
  }
  if (value.length > max) issue(issues, 'limit_attribute', `${path}.${key}`, `${key} exceeds ${max} characters`)
  return value
}

function optionalString(record: JsonRecord, key: string, path: string,
  issues: DocumentValidationIssue[], max: number = DOCUMENT_LIMITS.maxAttributeStringLength): string | undefined {
  if (!own(record, key)) return undefined
  const value = record[key]
  if (typeof value !== 'string') { issue(issues, 'invalid_type', `${path}.${key}`, `${key} must be a string`); return undefined }
  if (value.length > max) issue(issues, 'limit_attribute', `${path}.${key}`, `${key} exceeds ${max} characters`)
  return value
}

function requiredStringAllowEmpty(record: JsonRecord, key: string, path: string,
  issues: DocumentValidationIssue[], max: number = DOCUMENT_LIMITS.maxAttributeStringLength): string | null {
  if (!own(record, key)) { issue(issues, 'missing_field', `${path}.${key}`, `${key} is required`); return null }
  const value = record[key]
  if (typeof value !== 'string') { issue(issues, 'invalid_type', `${path}.${key}`, `${key} must be a string`); return null }
  if (value.length > max) issue(issues, 'limit_attribute', `${path}.${key}`, `${key} exceeds ${max} characters`)
  return value
}

function validateNumber(record: JsonRecord, key: string, path: string, issues: DocumentValidationIssue[],
  options: { integer?: boolean; min?: number; max?: number } = {}): number | undefined {
  if (!own(record, key)) return undefined
  const value = record[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issue(issues, 'invalid_type', `${path}.${key}`, `${key} must be a finite number`); return undefined
  }
  if ((options.integer && !Number.isInteger(value)) || (options.min !== undefined && value < options.min)
    || (options.max !== undefined && value > options.max)) {
    issue(issues, 'invalid_value', `${path}.${key}`, `${key} is outside its allowed range`)
  }
  return value
}

function validateInline(value: unknown, path: string, issues: DocumentValidationIssue[], state: ValidationState): void {
  if (!Array.isArray(value)) { issue(issues, 'invalid_type', path, 'Inline content must be an array'); return }
  value.forEach((candidate, index) => {
    const itemPath = `${path}[${index}]`
    if (!isRecord(candidate)) { issue(issues, 'invalid_type', itemPath, 'Inline node must be an object'); return }
    if (candidate.type === 'hardBreak') return
    if (candidate.type !== 'text') { issue(issues, 'unknown_node', `${itemPath}.type`, 'Unknown inline node'); return }
    if (typeof candidate.text !== 'string') { issue(issues, 'invalid_type', `${itemPath}.text`, 'Text must be a string'); return }
    state.totalText += candidate.text.length
    if (candidate.text.length > DOCUMENT_LIMITS.maxTextNodeLength)
      issue(issues, 'limit_text', `${itemPath}.text`, 'Text node is too long')
    if (state.totalText > DOCUMENT_LIMITS.maxTotalTextLength)
      issue(issues, 'limit_text', `${itemPath}.text`, 'Document text limit exceeded')
    if (!own(candidate, 'marks')) return
    if (!Array.isArray(candidate.marks)) { issue(issues, 'invalid_type', `${itemPath}.marks`, 'Marks must be an array'); return }
    if (candidate.marks.length > DOCUMENT_LIMITS.maxMarksPerTextNode)
      issue(issues, 'limit_attribute', `${itemPath}.marks`, 'Too many marks on one text node')
    const seen = new Set<string>()
    for (let markIndex = 0; markIndex < candidate.marks.length; markIndex++) {
      const mark = candidate.marks[markIndex]
      const markPath = `${itemPath}.marks[${markIndex}]`
      if (!isRecord(mark) || typeof mark.type !== 'string') { issue(issues, 'invalid_type', markPath, 'Mark must be an object with a type'); continue }
      if (seen.has(mark.type)) issue(issues, 'invalid_value', `${markPath}.type`, 'Duplicate mark type')
      for (const existing of seen) if (!canCombineTextMarks(existing as TextMark['type'], mark.type as TextMark['type']))
        issue(issues, 'invalid_value', `${markPath}.type`, 'This mark cannot be combined with another mark')
      seen.add(mark.type)
      if (SIMPLE_MARKS.has(mark.type)) continue
      if (mark.type === 'link') {
        const href = requiredString(mark, 'href', markPath, issues, DOCUMENT_LIMITS.maxUrlLength)
        if (href && (!normalizeLinkHref(href) || href.length > DOCUMENT_LIMITS.maxUrlLength))
          issue(issues, href.length > DOCUMENT_LIMITS.maxUrlLength ? 'limit_url' : 'invalid_url', `${markPath}.href`, 'Link URL is not allowed')
        optionalString(mark, 'title', markPath, issues)
      } else if (mark.type === 'textColor' || mark.type === 'highlight') {
        const color = requiredString(mark, 'color', markPath, issues, 80)
        if (color && !COLOR_RE.test(color)) issue(issues, 'invalid_color', `${markPath}.color`, 'Color is invalid')
      } else if (mark.type === 'citation') requiredString(mark, 'citationId', markPath, issues)
      else if (mark.type === 'inlineMath') requiredString(mark, 'latex', markPath, issues)
      else issue(issues, 'unknown_mark', `${markPath}.type`, `Unknown mark "${mark.type}"`)
    }
  })
}

interface ValidationState { nodeIds: Set<string>; nodeCount: number; totalText: number }

function allowedInContext(type: string, context: ChildContext): boolean {
  if (context === 'root' || context === 'blocks') return BLOCK_TYPES.has(type)
  if (context === 'listItems') return type === 'listItem'
  if (context === 'checklistItems') return type === 'checklistItem'
  if (context === 'tableRows') return type === 'tableRow'
  return type === 'tableCell' || type === 'tableHeaderCell'
}

function validateChildren(record: JsonRecord, path: string, issues: DocumentValidationIssue[], state: ValidationState,
  depth: number, context: ChildContext, required = true): void {
  if (!own(record, 'content')) {
    if (required) issue(issues, 'missing_field', `${path}.content`, 'content is required')
    return
  }
  if (!Array.isArray(record.content)) { issue(issues, 'invalid_type', `${path}.content`, 'content must be an array'); return }
  record.content.forEach((node, index) => validateNode(node, `${path}.content[${index}]`, issues, state, depth + 1, context))
}

function validateAttrsObject(record: JsonRecord, path: string, issues: DocumentValidationIssue[], required = false): JsonRecord | null {
  if (!own(record, 'attrs')) {
    if (required) issue(issues, 'missing_field', `${path}.attrs`, 'attrs is required')
    return null
  }
  if (!isRecord(record.attrs)) { issue(issues, 'invalid_type', `${path}.attrs`, 'attrs must be an object'); return null }
  return record.attrs
}

function validateNode(value: unknown, path: string, issues: DocumentValidationIssue[], state: ValidationState,
  depth: number, context: ChildContext): void {
  if (depth > DOCUMENT_LIMITS.maxDepth) { issue(issues, 'limit_depth', path, 'Maximum document depth exceeded'); return }
  if (++state.nodeCount > DOCUMENT_LIMITS.maxNodes) { issue(issues, 'limit_nodes', path, 'Maximum node count exceeded'); return }
  if (!isRecord(value)) { issue(issues, 'invalid_type', path, 'Document node must be an object'); return }
  if (typeof value.type !== 'string' || !NODE_TYPES.has(value.type)) {
    issue(issues, 'unknown_node', `${path}.type`, 'Unknown document node'); return
  }
  if (!allowedInContext(value.type, context))
    issue(issues, 'invalid_child', `${path}.type`, `${value.type} is not allowed in this parent`)
  const id = requiredString(value, 'id', path, issues)
  if (id) {
    if (state.nodeIds.has(id)) issue(issues, 'duplicate_node_id', `${path}.id`, `Duplicate node ID "${id}"`)
    state.nodeIds.add(id)
  }
  const attrs = validateAttrsObject(value, path, issues,
    ['heading', 'checklistItem', 'mathBlock', 'image', 'fileAttachment', 'audio', 'videoEmbed', 'pdfEmbed', 'canvasEmbed'].includes(value.type))
  switch (value.type) {
    case 'paragraph': case 'heading': {
      validateInline(value.content, `${path}.content`, issues, state)
      if (attrs && value.type === 'heading') validateNumber(attrs, 'level', `${path}.attrs`, issues, { integer: true, min: 1, max: 6 })
      if (attrs?.alignment !== undefined && !ALIGNMENTS.has(String(attrs.alignment))) issue(issues, 'invalid_value', `${path}.attrs.alignment`, 'Invalid alignment')
      if (attrs && value.type === 'paragraph') validateNumber(attrs, 'lineHeight', `${path}.attrs`, issues, { min: 0.5, max: 10 })
      return
    }
    case 'blockquote': case 'listItem': validateChildren(value, path, issues, state, depth, 'blocks'); return
    case 'bulletList': case 'orderedList':
      if (attrs && value.type === 'orderedList') validateNumber(attrs, 'start', `${path}.attrs`, issues, { integer: true, min: 1 })
      validateChildren(value, path, issues, state, depth, 'listItems'); return
    case 'checklist': validateChildren(value, path, issues, state, depth, 'checklistItems'); return
    case 'checklistItem':
      if (attrs && typeof attrs.checked !== 'boolean') issue(issues, 'invalid_type', `${path}.attrs.checked`, 'checked must be boolean')
      validateChildren(value, path, issues, state, depth, 'blocks'); return
    case 'codeBlock':
      if (typeof value.text !== 'string') issue(issues, 'invalid_type', `${path}.text`, 'Code text must be a string')
      else { state.totalText += value.text.length; if (value.text.length > DOCUMENT_LIMITS.maxTextNodeLength || state.totalText > DOCUMENT_LIMITS.maxTotalTextLength) issue(issues, 'limit_text', `${path}.text`, 'Code text limit exceeded') }
      if (attrs?.language !== undefined && (typeof attrs.language !== 'string' || !SAFE_LANGUAGE_ID_RE.test(attrs.language))) issue(issues, 'invalid_language', `${path}.attrs.language`, 'Invalid code language identifier')
      return
    case 'mathBlock':
      if (attrs) { requiredString(attrs, 'latex', `${path}.attrs`, issues); if (attrs.numbered !== undefined && typeof attrs.numbered !== 'boolean') issue(issues, 'invalid_type', `${path}.attrs.numbered`, 'numbered must be boolean'); optionalString(attrs, 'label', `${path}.attrs`, issues) }
      return
    case 'table': {
      if (Array.isArray(value.content) && value.content.length > DOCUMENT_LIMITS.maxTableRows) issue(issues, 'limit_table', `${path}.content`, 'Table has too many rows')
      if (attrs) optionalString(attrs, 'caption', `${path}.attrs`, issues)
      validateChildren(value, path, issues, state, depth, 'tableRows'); return
    }
    case 'tableRow':
      if (Array.isArray(value.content) && value.content.length > DOCUMENT_LIMITS.maxTableColumns) issue(issues, 'limit_table', `${path}.content`, 'Table row has too many cells')
      validateChildren(value, path, issues, state, depth, 'tableCells'); return
    case 'tableHeaderCell': case 'tableCell':
      if (attrs) { validateNumber(attrs, 'colspan', `${path}.attrs`, issues, { integer: true, min: 1, max: DOCUMENT_LIMITS.maxTableColumns }); validateNumber(attrs, 'rowspan', `${path}.attrs`, issues, { integer: true, min: 1, max: DOCUMENT_LIMITS.maxTableRows }); if (attrs.alignment !== undefined && !ALIGNMENTS.has(String(attrs.alignment))) issue(issues, 'invalid_value', `${path}.attrs.alignment`, 'Invalid alignment') }
      validateChildren(value, path, issues, state, depth, 'blocks'); return
    case 'image':
      if (attrs) { requiredString(attrs, 'assetId', `${path}.attrs`, issues); optionalString(attrs, 'alt', `${path}.attrs`, issues); optionalString(attrs, 'caption', `${path}.attrs`, issues); validateNumber(attrs, 'width', `${path}.attrs`, issues, { min: 1, max: 100_000 }); validateNumber(attrs, 'height', `${path}.attrs`, issues, { min: 1, max: 100_000 }) }
      break
    case 'fileAttachment':
      if (attrs) { requiredString(attrs, 'assetId', `${path}.attrs`, issues); const filename = optionalString(attrs, 'filename', `${path}.attrs`, issues, DOCUMENT_LIMITS.maxFilenameLength); if (filename && (!filename.trim() || /[\x00-\x1f/\\]/.test(filename))) issue(issues, 'invalid_filename', `${path}.attrs.filename`, 'Filename is invalid'); const mime = optionalString(attrs, 'mimeType', `${path}.attrs`, issues, 255); if (mime && !MIME_RE.test(mime)) issue(issues, 'invalid_mime_type', `${path}.attrs.mimeType`, 'MIME type is invalid') }
      break
    case 'audio': if (attrs) { requiredString(attrs, 'assetId', `${path}.attrs`, issues); optionalString(attrs, 'title', `${path}.attrs`, issues); optionalString(attrs, 'caption', `${path}.attrs`, issues) }; break
    case 'videoEmbed':
      if (attrs) { if (!(VIDEO_EMBED_PROVIDERS as readonly unknown[]).includes(attrs.provider)) issue(issues, 'invalid_url', `${path}.attrs.provider`, 'Video provider is not allowed'); const videoId = requiredString(attrs, 'videoId', `${path}.attrs`, issues, 128); if (videoId && !VIDEO_ID_RE.test(videoId)) issue(issues, 'invalid_url', `${path}.attrs.videoId`, 'Video ID is invalid'); optionalString(attrs, 'title', `${path}.attrs`, issues); optionalString(attrs, 'caption', `${path}.attrs`, issues) }
      break
    case 'pdfEmbed': if (attrs) { requiredString(attrs, 'assetId', `${path}.attrs`, issues); validateNumber(attrs, 'page', `${path}.attrs`, issues, { integer: true, min: 1 }); optionalString(attrs, 'extractedDocumentId', `${path}.attrs`, issues) }; break
    case 'canvasEmbed': if (attrs) { requiredString(attrs, 'canvasId', `${path}.attrs`, issues); optionalString(attrs, 'previewAssetId', `${path}.attrs`, issues); optionalString(attrs, 'caption', `${path}.attrs`, issues) }; break
  }
  if (attrs && DISPLAY_VALUES[value.type] && attrs.display !== undefined && !DISPLAY_VALUES[value.type].has(String(attrs.display)))
    issue(issues, 'invalid_value', `${path}.attrs.display`, 'Invalid display mode')
}

function validateStringArray(value: unknown, path: string, issues: DocumentValidationIssue[]): void {
  if (!Array.isArray(value)) { issue(issues, 'invalid_type', path, 'Expected an array'); return }
  if (value.length > DOCUMENT_LIMITS.maxMetadataItems) issue(issues, 'limit_attribute', path, 'Too many metadata items')
  value.forEach((item, index) => { if (typeof item !== 'string') issue(issues, 'invalid_type', `${path}[${index}]`, 'Expected a string'); else if (item.length > DOCUMENT_LIMITS.maxAttributeStringLength) issue(issues, 'limit_attribute', `${path}[${index}]`, 'Metadata value is too long') })
}

function validateMetadata(value: unknown, path: string, issues: DocumentValidationIssue[], state: ValidationState): void {
  if (!isRecord(value)) { issue(issues, 'invalid_type', path, 'metadata must be an object'); return }
  requiredStringAllowEmpty(value, 'title', path, issues, DOCUMENT_LIMITS.maxAttributeStringLength)
  const language = requiredString(value, 'language', path, issues, 64)
  if (language && !LANGUAGE_RE.test(language)) issue(issues, 'invalid_language', `${path}.language`, 'Language tag is invalid')
  validateStringArray(value.tags, `${path}.tags`, issues)
  if (!Array.isArray(value.authors)) issue(issues, 'invalid_type', `${path}.authors`, 'authors must be an array')
  else {
    if (value.authors.length > DOCUMENT_LIMITS.maxMetadataItems) issue(issues, 'limit_attribute', `${path}.authors`, 'Too many authors')
    value.authors.forEach((author, index) => {
      const authorPath = `${path}.authors[${index}]`
      if (!isRecord(author)) { issue(issues, 'invalid_type', authorPath, 'Author must be an object'); return }
      requiredString(author, 'name', authorPath, issues); optionalString(author, 'id', authorPath, issues); optionalString(author, 'email', authorPath, issues, 320); optionalString(author, 'orcid', authorPath, issues, 64)
      if (own(author, 'affiliations')) validateStringArray(author.affiliations, `${authorPath}.affiliations`, issues)
    })
  }
  if (!isRecord(value.pageSetup)) issue(issues, 'invalid_type', `${path}.pageSetup`, 'pageSetup must be an object')
  else {
    const page = value.pageSetup
    if (!['continuous', 'paginated'].includes(String(page.mode))) issue(issues, 'invalid_value', `${path}.pageSetup.mode`, 'Invalid page mode')
    if (!['a4', 'letter', 'legal', 'custom'].includes(String(page.size))) issue(issues, 'invalid_value', `${path}.pageSetup.size`, 'Invalid page size')
    if (!['portrait', 'landscape'].includes(String(page.orientation))) issue(issues, 'invalid_value', `${path}.pageSetup.orientation`, 'Invalid page orientation')
    if (![1, 2].includes(Number(page.columns))) issue(issues, 'invalid_value', `${path}.pageSetup.columns`, 'Columns must be 1 or 2')
    if (page.size === 'custom') { validateNumber(page, 'width', `${path}.pageSetup`, issues, { min: 1, max: 100_000 }); validateNumber(page, 'height', `${path}.pageSetup`, issues, { min: 1, max: 100_000 }) }
    if (!isRecord(page.margins)) issue(issues, 'invalid_type', `${path}.pageSetup.margins`, 'Margins must be an object')
    else for (const side of ['top', 'right', 'bottom', 'left']) validateNumber(page.margins, side, `${path}.pageSetup.margins`, issues, { min: 0, max: 10_000 })
  }
  if (own(value, 'research') && !isRecord(value.research)) issue(issues, 'invalid_type', `${path}.research`, 'research must be an object')
  else if (isRecord(value.research)) {
    optionalString(value.research, 'title', `${path}.research`, issues)
    optionalString(value.research, 'language', `${path}.research`, issues, 64)
    optionalString(value.research, 'citationStyle', `${path}.research`, issues, 128)
    if (own(value.research, 'keywords')) validateStringArray(value.research.keywords, `${path}.research.keywords`, issues)
    if (own(value.research, 'authors') && !Array.isArray(value.research.authors))
      issue(issues, 'invalid_type', `${path}.research.authors`, 'Research authors must be an array')
    if (own(value.research, 'abstract')) {
      if (!Array.isArray(value.research.abstract)) issue(issues, 'invalid_type', `${path}.research.abstract`, 'Research abstract must be an array')
      else value.research.abstract.forEach((node, index) => validateNode(node, `${path}.research.abstract[${index}]`, issues, state, 1, 'root'))
    }
  }
}

/** Strictly validates untrusted input without coercing, dropping, or repairing it. */
export function validateDocument(value: unknown): DocumentValidationResult {
  const issues: DocumentValidationIssue[] = []
  rejectUnsafeKeys(value, '$', issues)
  if (!isRecord(value)) {
    issue(issues, 'invalid_type', '$', 'Document must be an object')
    return { valid: false, issues }
  }
  if (value.schemaVersion !== CURRENT_DOCUMENT_SCHEMA_VERSION)
    issue(issues, 'unsupported_schema_version', '$.schemaVersion', `Expected schema version ${CURRENT_DOCUMENT_SCHEMA_VERSION}`)
  if (value.type !== 'document') issue(issues, 'invalid_value', '$.type', 'Document type must be "document"')
  requiredString(value, 'id', '$', issues)
  const state: ValidationState = { nodeIds: new Set(), nodeCount: 0, totalText: 0 }
  validateMetadata(value.metadata, '$.metadata', issues, state)
  if (typeof value.createdAt !== 'string' || !ISO_DATE_RE.test(value.createdAt)) issue(issues, 'invalid_value', '$.createdAt', 'createdAt must be an ISO UTC timestamp')
  if (typeof value.updatedAt !== 'string' || !ISO_DATE_RE.test(value.updatedAt)) issue(issues, 'invalid_value', '$.updatedAt', 'updatedAt must be an ISO UTC timestamp')
  if (!Array.isArray(value.content)) issue(issues, 'invalid_type', '$.content', 'content must be an array')
  else value.content.forEach((node, index) => validateNode(node, `$.content[${index}]`, issues, state, 1, 'root'))
  const valid = !issues.some((entry) => entry.severity === 'error')
  return { valid, issues, ...(valid ? { document: value as unknown as IncantlyDocument } : {}) }
}

/** Exported for consumers that need to explain the URL security policy. */
export const DOCUMENT_ALLOWED_URL_PROTOCOLS = ALLOWED_LINK_PROTOCOLS
