import { DEFAULT_PAGE_SETUP } from './constants.js'
import {
  HEADER_FOOTER_KINDS, HEADER_FOOTER_VARIANTS, normalizeHeaderFooterContent,
  type HeaderFooterKind, type HeaderFooterVariant, type PageLayoutWarning,
} from './header-footer.js'
import type { DocumentNodeId } from './ids.js'
import type {
  HeaderFooterContent, IncantlyDocument, PageHeaderFooterVariants, PageLayout, PageLayoutSection, PageMode, PageSetup,
} from './types.js'
import { validateHeaderFooterContent, type DocumentValidationIssue } from './validate.js'

export const PAGE_PRESETS = {
  a4: { width: 595.28, height: 841.89 },
  letter: { width: 612, height: 792 },
  legal: { width: 612, height: 1008 },
} as const

export function normalizePageSetup(input: PageSetup): PageSetup {
  const preset = input.size === 'custom' ? undefined : PAGE_PRESETS[input.size]
  const width = preset?.width ?? input.width
  const height = preset?.height ?? input.height
  if (width === undefined || height === undefined || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    throw new Error('Page dimensions must be positive finite values in points')
  // Named sizes must not carry width/height keys at all: an explicit
  // `undefined` value is not canonical JSON and the strict serializer rejects
  // it (e.g. after switching back from custom to a preset in page settings).
  const { width: _ignoredWidth, height: _ignoredHeight, startingPageNumber: _startingPageNumber, ...rest } = input
  return {
    ...rest,
    ...(input.size === 'custom' ? { width, height } : {}),
    margins: { ...input.margins },
    headerDistance: Math.max(0, input.headerDistance ?? 36),
    footerDistance: Math.max(0, input.footerDistance ?? 36),
    ...(input.startingPageNumber !== undefined && Number.isFinite(input.startingPageNumber)
      ? { startingPageNumber: Math.max(1, Math.floor(input.startingPageNumber)) }
      : {}),
    columns: input.columns === 2 ? 2 : 1,
  }
}

export function createPageLayout(pageSetup: PageSetup, id = 'section-1'): PageLayout {
  const section: PageLayoutSection = { id, pageSetup: normalizePageSetup(pageSetup) }
  return { version: 1, defaultSection: section, sections: [section] }
}

export function contentRegion(setup: PageSetup): { width: number; height: number } {
  const normalized = normalizePageSetup(setup)
  const size = normalized.size === 'custom' ? { width: normalized.width!, height: normalized.height! } : PAGE_PRESETS[normalized.size]
  const landscape = normalized.orientation === 'landscape'
  const width = landscape ? size.height : size.width
  const height = landscape ? size.width : size.height
  return { width: width - normalized.margins.left - normalized.margins.right, height: height - normalized.margins.top - normalized.margins.bottom }
}

/** The stored layout, or a one-section layout built from `metadata.pageSetup` when none is stored. */
export function ensurePageLayout(document: IncantlyDocument): PageLayout {
  return document.metadata.layout ?? createPageLayout(document.metadata.pageSetup)
}

/** A layout section placed in the document. All lengths are points (1/72 inch). */
export interface ResolvedPageLayoutSection {
  id: string
  /** 0-based position among the resolved sections. */
  index: number
  /** Index in `document.content` of the section's first top-level block. 0 for the first section. */
  startIndex: number
  /** ID of that block; undefined when the document has no content. */
  startNodeId?: DocumentNodeId
  /**
   * Effective, normalized page setup. `mode` is always the document's. `startingPageNumber` is set
   * on the first section (default 1); on a later section it is set only when that section restarts
   * numbering, and missing means "continue from the previous section".
   */
  pageSetup: PageSetup
  headers?: PageHeaderFooterVariants
  footers?: PageHeaderFooterVariants
}

export interface ResolvedPageLayout {
  /** The document's view mode, shared by every section. */
  mode: PageMode
  /** The layout's default section with its effective page setup, used for new sections. */
  defaultSection: PageLayoutSection
  /** Sections in document order; never empty. */
  sections: ResolvedPageLayoutSection[]
  /** Sections that were skipped or repaired, and why. */
  warnings: PageLayoutWarning[]
}

/** One page of the document, as numbered by `numberPages`. */
export interface PageNumbering {
  sectionIndex: number
  sectionId: string
  /** 0-based index of the page inside its section. */
  pageIndexInSection: number
  /** 1-based physical position of the page in the whole document. */
  absolutePageNumber: number
  /** The number printed on the page, after `startingPageNumber` and section restarts. */
  printedPageNumber: number
}

function effectivePageSetup(documentSetup: PageSetup, setup: PageSetup | undefined, first: boolean,
  sectionId: string, warnings: PageLayoutWarning[]): PageSetup {
  const { startingPageNumber: documentStart, ...inherited } = documentSetup
  const merged = { ...inherited, ...setup, mode: documentSetup.mode } as PageSetup
  if (first) merged.startingPageNumber = setup?.startingPageNumber ?? documentStart ?? 1
  try {
    return normalizePageSetup(merged)
  } catch {
    warnings.push({ code: 'invalid_page_setup', sectionId, message: `Section "${sectionId}" has no usable page size; the document page setup is used` })
    try {
      return normalizePageSetup({ ...documentSetup, ...(first ? { startingPageNumber: merged.startingPageNumber } : { startingPageNumber: undefined }) })
    } catch {
      return normalizePageSetup({ ...DEFAULT_PAGE_SETUP, margins: { ...DEFAULT_PAGE_SETUP.margins }, mode: documentSetup.mode, ...(first ? { startingPageNumber: merged.startingPageNumber } : {}) })
    }
  }
}

/**
 * Places the stored layout sections in the document.
 * - No `metadata.layout` (or no stored sections): one section from `metadata.pageSetup` / `defaultSection`.
 * - The first stored section always starts at the top of the document.
 * - Later sections start at their `startNodeId`, which must be a top-level block; sections whose
 *   start is missing, nested, or already taken, and repeated section IDs, are skipped with a warning.
 * It never throws and never changes the document.
 */
export function resolvePageLayout(document: IncantlyDocument): ResolvedPageLayout {
  const documentSetup = document.metadata.pageSetup
  const layout = document.metadata.layout
  const warnings: PageLayoutWarning[] = []
  const stored: PageLayoutSection[] = layout?.sections?.length
    ? layout.sections
    : [layout?.defaultSection ?? { id: 'section-1', pageSetup: documentSetup }]
  const blockIndex = new Map<string, number>()
  document.content.forEach((node, index) => { if (!blockIndex.has(node.id)) blockIndex.set(node.id, index) })

  const ids = new Set<string>()
  const placed: Array<{ section: PageLayoutSection; start: number; order: number }> = []
  stored.forEach((section, order) => {
    if (ids.has(section.id)) {
      warnings.push({ code: 'section_id_duplicate', sectionId: section.id, message: `Section ID "${section.id}" is used more than once; the later one is skipped` })
      return
    }
    ids.add(section.id)
    if (order === 0) { placed.push({ section, start: 0, order }); return }
    const start = section.startNodeId === undefined ? undefined : blockIndex.get(section.startNodeId)
    if (start === undefined) {
      warnings.push({ code: 'section_start_missing', sectionId: section.id, message: `Section "${section.id}" does not start at a top-level block of this document; it is skipped` })
      return
    }
    placed.push({ section, start, order })
  })
  placed.sort((left, right) => left.start - right.start || left.order - right.order)

  const sections: ResolvedPageLayoutSection[] = []
  let previousStart = -1
  for (const { section, start } of placed) {
    // The first stored section owns the top of the document, so a later section at block 0 collides too.
    const effectiveStart = sections.length === 0 ? 0 : start
    if (sections.length > 0 && effectiveStart <= previousStart) {
      warnings.push({ code: 'section_start_duplicate', sectionId: section.id, message: `Section "${section.id}" starts where another section starts; it is skipped` })
      continue
    }
    previousStart = effectiveStart
    const startNodeId = document.content[effectiveStart]?.id
    sections.push({
      id: section.id,
      index: sections.length,
      startIndex: effectiveStart,
      ...(startNodeId ? { startNodeId } : {}),
      pageSetup: effectivePageSetup(documentSetup, section.pageSetup, sections.length === 0, section.id, warnings),
      ...(section.headers ? { headers: section.headers } : {}),
      ...(section.footers ? { footers: section.footers } : {}),
    })
  }

  const storedDefault = layout?.defaultSection ?? stored[0] as PageLayoutSection
  const defaultSection: PageLayoutSection = {
    ...storedDefault,
    pageSetup: storedDefault === stored[0] || storedDefault.id === sections[0]?.id
      ? sections[0]!.pageSetup
      : effectivePageSetup(documentSetup, storedDefault.pageSetup, true, storedDefault.id, warnings),
  }
  return { mode: documentSetup.mode, defaultSection, sections, warnings }
}

/**
 * Numbers every page from the page count of each resolved section (in order). The first section
 * starts at its `startingPageNumber`; a later section restarts at its own `startingPageNumber` when
 * set, otherwise it continues. Throws a RangeError for counts that are not integers >= 0 or a list
 * whose length differs from `layout.sections`.
 */
export function numberPages(layout: Pick<ResolvedPageLayout, 'sections'>, sectionPageCounts: readonly number[]): PageNumbering[] {
  if (sectionPageCounts.length !== layout.sections.length)
    throw new RangeError(`Expected ${layout.sections.length} section page counts, got ${sectionPageCounts.length}`)
  const pages: PageNumbering[] = []
  let printed = 0
  layout.sections.forEach((section, sectionIndex) => {
    const count = sectionPageCounts[sectionIndex] as number
    if (!Number.isInteger(count) || count < 0) throw new RangeError(`Section "${section.id}" page count must be an integer >= 0`)
    const restart = section.pageSetup.startingPageNumber
    if (sectionIndex === 0 || restart !== undefined) printed = (restart ?? 1) - 1
    for (let pageIndexInSection = 0; pageIndexInSection < count; pageIndexInSection++) {
      printed += 1
      pages.push({ sectionIndex, sectionId: section.id, pageIndexInSection, absolutePageNumber: pages.length + 1, printedPageNumber: printed })
    }
  })
  return pages
}

export type PageLayoutErrorCode = 'unknown_section' | 'invalid_argument' | 'invalid_header_footer_content'

/** Thrown by the layout builders for a bad section, kind, variant or header/footer content. */
export class PageLayoutError extends Error {
  readonly code: PageLayoutErrorCode
  readonly issues: DocumentValidationIssue[]
  constructor(code: PageLayoutErrorCode, message: string, issues: DocumentValidationIssue[] = []) {
    super(message)
    this.name = 'PageLayoutError'
    this.code = code
    this.issues = issues
  }
}

const copyContent = (content: readonly HeaderFooterContent[]): HeaderFooterContent[] =>
  JSON.parse(JSON.stringify(content)) as HeaderFooterContent[]

/**
 * Applies `update` to every copy of a section: `defaultSection` and the matching entry in
 * `sections` are separate objects once the document has been stored as JSON.
 */
function updateSection(layout: PageLayout, sectionId: string,
  update: (section: PageLayoutSection) => PageLayoutSection): PageLayout {
  const matchesDefault = layout.defaultSection.id === sectionId
  const matchesSection = layout.sections.some((section) => section.id === sectionId)
  if (!matchesDefault && !matchesSection) throw new PageLayoutError('unknown_section', `The layout has no section "${sectionId}"`)
  return {
    ...layout,
    defaultSection: matchesDefault ? update(layout.defaultSection) : layout.defaultSection,
    sections: layout.sections.map((section) => section.id === sectionId ? update(section) : section),
  }
}

function withVariants(section: PageLayoutSection, kind: HeaderFooterKind,
  change: (variants: PageHeaderFooterVariants) => PageHeaderFooterVariants): PageLayoutSection {
  const key = kind === 'header' ? 'headers' : 'footers'
  const variants = change({ ...section[key] })
  for (const variant of HEADER_FOOTER_VARIANTS) if (variants[variant] === undefined) delete variants[variant]
  const { [key]: _previous, ...rest } = section
  return Object.keys(variants).length ? { ...rest, [key]: variants } : rest
}

function assertKindAndVariant(kind: HeaderFooterKind, variant?: HeaderFooterVariant): void {
  if (!HEADER_FOOTER_KINDS.includes(kind)) throw new PageLayoutError('invalid_argument', `Unknown header/footer kind "${String(kind)}"`)
  if (variant !== undefined && !HEADER_FOOTER_VARIANTS.includes(variant))
    throw new PageLayoutError('invalid_argument', `Unknown header/footer variant "${String(variant)}"`)
}

/**
 * Returns a new layout with one header/footer variant of a section replaced by a copy of
 * `content`, or removed when `content` is undefined. Content must pass
 * `validateHeaderFooterContent`; run untrusted content through `normalizeHeaderFooterContent` first.
 * Older top-level fields are accepted and stored in the current form (inside paragraph text).
 */
export function setHeaderFooter(layout: PageLayout, sectionId: string, kind: HeaderFooterKind,
  variant: HeaderFooterVariant, content: readonly HeaderFooterContent[] | undefined): PageLayout {
  assertKindAndVariant(kind, variant)
  if (content !== undefined) {
    const issues = validateHeaderFooterContent(content).filter((entry) => entry.severity === 'error')
    if (issues.length) throw new PageLayoutError('invalid_header_footer_content', 'Header/footer content allows only paragraphs and fields', issues)
  }
  return updateSection(layout, sectionId, (section) =>
    withVariants(section, kind, (variants) => ({ ...variants, [variant]: content === undefined ? undefined : normalizeHeaderFooterContent(content).content })))
}

/**
 * Returns a new layout with "different first page" on or off for a section's header and footer.
 * On: adds an empty `first` variant where none exists (a blank first page until it is filled).
 * Off: removes the `first` variants.
 */
export function setDifferentFirstPage(layout: PageLayout, sectionId: string, enabled: boolean): PageLayout {
  return updateSection(layout, sectionId, (section) => HEADER_FOOTER_KINDS.reduce((current, kind) =>
    withVariants(current, kind, (variants) => ({ ...variants, first: enabled ? variants.first ?? [] : undefined })), section))
}

/**
 * Returns a new layout with "different odd and even pages" on or off for a section's header and footer.
 * On: `odd` starts as a copy of `default` and `even` starts empty, where they are not set yet.
 * Off: removes `odd` and `even`; non-empty `odd` content becomes the new `default`, so it is not lost.
 */
export function setDifferentOddEven(layout: PageLayout, sectionId: string, enabled: boolean): PageLayout {
  return updateSection(layout, sectionId, (section) => HEADER_FOOTER_KINDS.reduce((current, kind) =>
    withVariants(current, kind, (variants) => enabled
      ? { ...variants, odd: variants.odd ?? copyContent(variants.default ?? []), even: variants.even ?? [] }
      : { ...variants, default: variants.odd?.length ? variants.odd : variants.default, odd: undefined, even: undefined }), section))
}
