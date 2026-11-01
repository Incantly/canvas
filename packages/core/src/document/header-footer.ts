import { documentNodeId } from './ids.js'
import { inlineContentToPlainText, normalizeInlineContent } from './inline.js'
import { DOCUMENT_LIMITS } from './limits.js'
import type {
  HeaderFooterContent, HeaderFooterField, HeaderFooterFieldType, IncantlyDocument, InlineNode,
  PageHeaderFooterVariants, PageLayoutSection, ParagraphNode, TextAlignment,
} from './types.js'
import type { DocumentValidationIssue } from './validate.js'

/*
 * Header and footer rules shared by the editor, print CSS and Word export.
 *
 * Header/footer content is a flat list of paragraphs and fields
 * (`HeaderFooterContent[]`). Fields cannot sit inside a paragraph, so lines are
 * read like this:
 * - every paragraph starts a new line, except one that directly follows a field,
 *   which continues that field's line;
 * - a field continues the current line, or starts one when it is first.
 * So `[paragraph "Page ", pageNumber, paragraph " of ", pageCount]` is the one
 * line "Page 3 of 10", aligned like its first paragraph.
 */

export type HeaderFooterKind = 'header' | 'footer'
export type HeaderFooterVariant = keyof PageHeaderFooterVariants
export const HEADER_FOOTER_KINDS: readonly HeaderFooterKind[] = ['header', 'footer']
export const HEADER_FOOTER_VARIANTS: readonly HeaderFooterVariant[] = ['default', 'first', 'odd', 'even']
export const HEADER_FOOTER_FIELD_TYPES: readonly HeaderFooterFieldType[] = ['pageNumber', 'pageCount', 'documentTitle', 'currentDate']
/** `format` values for `pageNumber` and `pageCount` fields. Missing means `decimal`. */
export type PageNumberFormat = 'decimal' | 'lower-roman' | 'upper-roman'
export const PAGE_NUMBER_FORMATS: readonly PageNumberFormat[] = ['decimal', 'lower-roman', 'upper-roman']
/**
 * `currentDate` format used when a field has none. Tokens: `YYYY` (2026), `YY` (26),
 * `MMMM` (November), `MMM` (Nov), `MM` (03), `M` (3), `DD` (07), `D` (7).
 * Text in square brackets is literal: `[Updated] D MMMM YYYY`. Other characters print as written.
 * Month names are English.
 */
export const DEFAULT_HEADER_FOOTER_DATE_FORMAT = 'YYYY-MM-DD'
export const HEADER_FOOTER_DATE_TOKENS = ['YYYY', 'YY', 'MMMM', 'MMM', 'MM', 'M', 'DD', 'D'] as const
/** Maximum number of items (paragraphs and fields) in one header/footer variant. */
export const MAX_HEADER_FOOTER_ITEMS = 100
/** Maximum length of a field `format` string. */
export const MAX_HEADER_FOOTER_FORMAT_LENGTH = 64

export type PageLayoutWarningCode =
  | 'section_start_missing' | 'section_start_duplicate' | 'section_id_duplicate' | 'invalid_page_setup'
  | 'unknown_field' | 'unknown_format' | 'number_out_of_range' | 'page_count_unknown'
  | 'document_title_empty' | 'date_invalid' | 'unsupported_content'

/** A non-fatal problem found while resolving a layout or rendering a header/footer. */
export interface PageLayoutWarning {
  code: PageLayoutWarningCode
  message: string
  sectionId?: string
}

/** Values the fields of one page print. */
export interface HeaderFooterFieldContext {
  /** Printed page number, which already includes `startingPageNumber` (see `numberPages`). */
  pageNumber: number
  /** Total number of pages in the document. Leave it out while it is unknown, e.g. in a live editor preview. */
  pageCount?: number
  /** Title for `documentTitle`; `headerFooterDocumentTitle(document)` gives the standard one. */
  documentTitle?: string
  /**
   * Calendar date for `currentDate`, as `YYYY-MM-DD`. A full ISO timestamp is accepted and only its
   * date part is used. The caller picks the time zone, e.g. `new Date().toLocaleDateString('en-CA')`
   * for the reader's local date.
   */
  date?: string
}

export interface HeaderFooterTextResult {
  text: string
  warnings: PageLayoutWarning[]
}

/** One printed line of a header or footer. */
export interface HeaderFooterLine {
  alignment: TextAlignment
  /** Plain text; may contain `\n` from hard breaks. */
  text: string
}

/** The page a header/footer is chosen for. Spread a `numberPages` entry and add `kind`. */
export interface HeaderFooterPage {
  kind: HeaderFooterKind
  /** 0-based index of the page inside its section; 0 is the section's first page. */
  pageIndexInSection: number
  /** Printed page number, including `startingPageNumber`. It decides odd and even. */
  printedPageNumber: number
}

export interface HeaderFooterSelection {
  /** The variant used, or null when the section has nothing for this page. */
  variant: HeaderFooterVariant | null
  /** Content to show. An empty array with variant `first` is a deliberately blank first page. */
  content: readonly HeaderFooterContent[]
}

export interface HeaderFooterOptions {
  /** A `first` header or footer is set. */
  differentFirstPage: boolean
  /** An `odd` or `even` header or footer is set. */
  differentOddEven: boolean
}

const NO_HEADER_FOOTER: HeaderFooterSelection = Object.freeze({ variant: null, content: Object.freeze([]) as readonly HeaderFooterContent[] })

/**
 * Picks the header or footer variant for one page:
 * 1. `first` on the section's first page, when set (even if empty);
 * 2. otherwise `odd` or `even` by the printed page number, when that variant is set;
 * 3. otherwise `default`;
 * 4. otherwise nothing.
 */
export function headerFooterFor(section: Pick<PageLayoutSection, 'headers' | 'footers'>, page: HeaderFooterPage): HeaderFooterSelection {
  if (!HEADER_FOOTER_KINDS.includes(page.kind)) throw new RangeError(`Unknown header/footer kind "${String(page.kind)}"`)
  if (!Number.isInteger(page.pageIndexInSection) || page.pageIndexInSection < 0)
    throw new RangeError('pageIndexInSection must be an integer >= 0')
  if (!Number.isInteger(page.printedPageNumber) || page.printedPageNumber < 1)
    throw new RangeError('printedPageNumber must be an integer >= 1')
  const variants = page.kind === 'header' ? section.headers : section.footers
  if (!variants) return NO_HEADER_FOOTER
  if (page.pageIndexInSection === 0 && variants.first) return { variant: 'first', content: variants.first }
  const parity = page.printedPageNumber % 2 === 0 ? 'even' : 'odd'
  if (variants[parity]) return { variant: parity, content: variants[parity] }
  if (variants.default) return { variant: 'default', content: variants.default }
  return NO_HEADER_FOOTER
}

/** Reports which header/footer toggles are on for a section, for settings UIs. */
export function headerFooterOptions(section: Pick<PageLayoutSection, 'headers' | 'footers'>): HeaderFooterOptions {
  const variants = [section.headers, section.footers]
  return {
    differentFirstPage: variants.some((entry) => entry?.first !== undefined),
    differentOddEven: variants.some((entry) => entry?.odd !== undefined || entry?.even !== undefined),
  }
}

/** The title `documentTitle` fields print: the research title when set, else the document title, trimmed. */
export function headerFooterDocumentTitle(document: IncantlyDocument): string {
  return (document.metadata.research?.title?.trim() || document.metadata.title.trim())
}

const ROMAN_NUMERALS: ReadonlyArray<readonly [number, string]> = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
]

/**
 * Formats a page number. `format` is one of `PAGE_NUMBER_FORMATS` (default `decimal`).
 * Roman numerals cover 1 to 3999; other numbers, and unknown formats, print as decimal with a warning.
 */
export function formatPageNumber(value: number, format?: string): HeaderFooterTextResult {
  const decimal = String(value)
  if (format === undefined || format === 'decimal') return { text: decimal, warnings: [] }
  if (format !== 'lower-roman' && format !== 'upper-roman')
    return { text: decimal, warnings: [{ code: 'unknown_format', message: `Unknown number format "${format}"; printed as decimal` }] }
  if (!Number.isInteger(value) || value < 1 || value > 3999)
    return { text: decimal, warnings: [{ code: 'number_out_of_range', message: `${decimal} has no roman numeral; printed as decimal` }] }
  let remaining = value
  let roman = ''
  for (const [amount, numeral] of ROMAN_NUMERALS) {
    while (remaining >= amount) { roman += numeral; remaining -= amount }
  }
  return { text: format === 'lower-roman' ? roman.toLowerCase() : roman, warnings: [] }
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DATE_TOKEN_RE = /\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|DD|D/g
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/

function formatDate(value: string | undefined, format = DEFAULT_HEADER_FOOTER_DATE_FORMAT): HeaderFooterTextResult {
  const match = value === undefined ? null : DATE_RE.exec(value)
  const year = Number(match?.[1])
  const month = Number(match?.[2])
  const day = Number(match?.[3])
  const daysInMonth = match ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 0
  if (!match || month < 1 || month > 12 || day < 1 || day > daysInMonth)
    return { text: '', warnings: [{ code: 'date_invalid', message: value === undefined ? 'No date was given for the currentDate field' : `"${value}" is not a YYYY-MM-DD date` }] }
  const pad = (number: number): string => String(number).padStart(2, '0')
  const text = format.replace(DATE_TOKEN_RE, (token, literal: string | undefined) => {
    if (literal !== undefined) return literal
    switch (token) {
      case 'YYYY': return match[1] as string
      case 'YY': return (match[1] as string).slice(2)
      case 'MMMM': return MONTHS[month - 1] as string
      case 'MMM': return (MONTHS[month - 1] as string).slice(0, 3)
      case 'MM': return pad(month)
      case 'M': return String(month)
      case 'DD': return pad(day)
      default: return String(day)
    }
  })
  return { text, warnings: [] }
}

/**
 * Renders one field to text:
 * - `pageNumber` / `pageCount`: `format` is `decimal` (default), `lower-roman` or `upper-roman`;
 * - `documentTitle`: `context.documentTitle`, trimmed;
 * - `currentDate`: `context.date` with the date tokens in `DEFAULT_HEADER_FOOTER_DATE_FORMAT`'s docs.
 * Missing values and unknown fields print as an empty string with a warning; it never throws.
 */
export function formatHeaderFooterField(field: HeaderFooterField, context: HeaderFooterFieldContext): HeaderFooterTextResult {
  switch (field.field) {
    case 'pageNumber': return formatPageNumber(context.pageNumber, field.format)
    case 'pageCount':
      if (context.pageCount === undefined)
        return { text: '', warnings: [{ code: 'page_count_unknown', message: 'The page count is not known yet' }] }
      return formatPageNumber(context.pageCount, field.format)
    case 'documentTitle': {
      const title = context.documentTitle?.trim() ?? ''
      return title ? { text: title, warnings: [] } : { text: '', warnings: [{ code: 'document_title_empty', message: 'The document has no title' }] }
    }
    case 'currentDate': return formatDate(context.date, field.format)
    default:
      return { text: '', warnings: [{ code: 'unknown_field', message: `Unknown header/footer field "${String((field as { field?: unknown }).field)}"` }] }
  }
}

/** Renders header/footer content to aligned plain-text lines (see the line rule at the top of this file). */
export function headerFooterLines(content: readonly HeaderFooterContent[], context: HeaderFooterFieldContext): { lines: HeaderFooterLine[]; warnings: PageLayoutWarning[] } {
  const lines: HeaderFooterLine[] = []
  const warnings: PageLayoutWarning[] = []
  let current: HeaderFooterLine | undefined
  let previousWasField = false
  for (const item of content) {
    if (item.type === 'field') {
      const result = formatHeaderFooterField(item, context)
      warnings.push(...result.warnings)
      if (!current) { current = { alignment: 'left', text: '' }; lines.push(current) }
      current.text += result.text
      previousWasField = true
      continue
    }
    let text: string
    let alignment: TextAlignment = 'left'
    if (item.type === 'paragraph' || item.type === 'heading') {
      text = inlineContentToPlainText(item.content)
      alignment = item.attrs?.alignment ?? 'left'
      if (item.type === 'heading') warnings.push({ code: 'unsupported_content', message: 'A heading in a header/footer is shown as plain text' })
    } else {
      text = plainTextOf(item)
      warnings.push({ code: 'unsupported_content', message: `A ${item.type} in a header/footer is shown as plain text` })
    }
    if (current && previousWasField) current.text += text
    else { current = { alignment, text }; lines.push(current) }
    previousWasField = false
  }
  return { lines, warnings }
}

/** Renders header/footer content to plain text for previews; lines are joined with `\n`. */
export function headerFooterPlainText(content: readonly HeaderFooterContent[], context: HeaderFooterFieldContext): HeaderFooterTextResult {
  const { lines, warnings } = headerFooterLines(content, context)
  return { text: lines.map((line) => line.text).join('\n'), warnings }
}

type JsonRecord = Record<string, unknown>
const isRecord = (value: unknown): value is JsonRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const ALIGNMENTS = new Set<TextAlignment>(['left', 'center', 'right', 'justify'])

function plainTextOf(value: unknown, depth = 0): string {
  if (depth > 32 || !isRecord(value)) return ''
  if (typeof value.text === 'string') return value.text
  if (typeof value.latex === 'string') return value.latex
  const parts = Array.isArray(value.content) ? value.content.map((child) => plainTextOf(child, depth + 1)) : []
  return parts.filter(Boolean).join(value.type === 'paragraph' || value.type === 'heading' ? '' : ' ')
}

function boundedInline(value: unknown): InlineNode[] {
  return normalizeInlineContent(Array.isArray(value)
    ? value.slice(0, MAX_HEADER_FOOTER_ITEMS * 4).map((node) => isRecord(node) && typeof node.text === 'string'
      ? { ...node, text: node.text.slice(0, DOCUMENT_LIMITS.maxTextNodeLength) }
      : node)
    : [])
}

/**
 * Turns untrusted header/footer content into inline-safe content: paragraphs (text with marks,
 * hard breaks, inline math) and known fields. Headings and other blocks become plain paragraphs,
 * unknown fields and empty blocks are dropped, over-long formats are removed, and duplicate
 * paragraph IDs inside the list get a `~2` suffix. Every change is reported as a warning.
 */
export function normalizeHeaderFooterContent(value: unknown, path = '$'): { content: HeaderFooterContent[]; issues: DocumentValidationIssue[] } {
  const issues: DocumentValidationIssue[] = []
  const warn = (code: DocumentValidationIssue['code'], at: string, message: string): void => { issues.push({ code, path: at, message, severity: 'warning' }) }
  if (!Array.isArray(value)) { warn('invalid_type', path, 'Header/footer content must be an array; it was emptied'); return { content: [], issues } }
  if (value.length > MAX_HEADER_FOOTER_ITEMS) warn('limit_attribute', path, `Header/footer content was cut to ${MAX_HEADER_FOOTER_ITEMS} items`)
  const usedIds = new Set<string>()
  const content: HeaderFooterContent[] = []
  value.slice(0, MAX_HEADER_FOOTER_ITEMS).forEach((item, index) => {
    const itemPath = `${path}[${index}]`
    if (isRecord(item) && item.type === 'field') {
      if (!HEADER_FOOTER_FIELD_TYPES.includes(item.field as HeaderFooterFieldType)) {
        warn('unsupported_content', itemPath, `Unknown field "${String(item.field)}" was removed`); return
      }
      const format = typeof item.format === 'string' && item.format ? item.format : undefined
      if (format && format.length > MAX_HEADER_FOOTER_FORMAT_LENGTH) warn('limit_attribute', `${itemPath}.format`, 'An over-long field format was removed')
      else if (item.format !== undefined && !format) warn('invalid_type', `${itemPath}.format`, 'An invalid field format was removed')
      const keep = format && format.length <= MAX_HEADER_FOOTER_FORMAT_LENGTH
      content.push({ type: 'field', field: item.field as HeaderFooterFieldType, ...(keep ? { format } : {}) })
      return
    }
    const isParagraph = isRecord(item) && item.type === 'paragraph'
    const isHeading = isRecord(item) && item.type === 'heading'
    let inline: InlineNode[]
    if (isParagraph || isHeading) inline = boundedInline(item.content)
    else {
      const text = plainTextOf(item).slice(0, DOCUMENT_LIMITS.maxTextNodeLength)
      inline = text ? [{ type: 'text', text }] : []
    }
    if (!isParagraph) {
      if (!inline.length) { warn('unsupported_content', itemPath, 'Content a header/footer cannot hold was removed'); return }
      warn('unsupported_content', itemPath, `${isRecord(item) && typeof item.type === 'string' ? item.type : 'Content'} was converted to a paragraph`)
    }
    const record = isRecord(item) ? item : {}
    const base = typeof record.id === 'string' && record.id.trim()
      ? record.id.trim().slice(0, DOCUMENT_LIMITS.maxAttributeStringLength)
      : `node:header-footer:${index + 1}`
    let id = base
    for (let suffix = 2; usedIds.has(id); suffix++) id = `${base}~${suffix}`
    if (id !== record.id && isParagraph) warn('duplicate_node_id', `${itemPath}.id`, `Paragraph ID was repaired as "${id}"`)
    usedIds.add(id)
    const attrs = isRecord(record.attrs) ? record.attrs : {}
    const alignment = ALIGNMENTS.has(attrs.alignment as TextAlignment) ? attrs.alignment as TextAlignment : undefined
    const lineHeight = isParagraph && typeof attrs.lineHeight === 'number' && attrs.lineHeight >= 0.5 && attrs.lineHeight <= 10 ? attrs.lineHeight : undefined
    const paragraph: ParagraphNode = {
      id: documentNodeId(id),
      type: 'paragraph',
      ...(alignment || lineHeight ? { attrs: { ...(alignment ? { alignment } : {}), ...(lineHeight ? { lineHeight } : {}) } } : {}),
      content: inline,
    }
    content.push(paragraph)
  })
  return { content, issues }
}
