import { createParagraph } from './create.js'
import { inlineContentToPlainText, normalizeInlineContent } from './inline.js'
import type { DocumentNode, DocumentNodeType, TableCellNode, TableHeaderCellNode } from './types.js'

export const MAX_DOCUMENT_NESTING_DEPTH = 32
export const MAX_LIST_NESTING_DEPTH = 8
export const MAX_BLOCKQUOTE_NESTING_DEPTH = 8
export const MAX_TABLE_CELL_NESTING_DEPTH = 4
export const VIDEO_EMBED_PROVIDERS = ['youtube', 'vimeo'] as const

export type NodeChildKind = 'none' | 'inline' | 'blocks' | 'listItems' | 'checklistItems' | 'tableRows' | 'tableCells' | 'plainText'
export type UnsupportedNodeFallback = 'paragraph' | 'attachment' | 'omit'
export interface DocumentNodeRule {
  childKind: NodeChildKind
  allowedChildren: readonly string[]
  maxDepth: number
  normalization: string
  unsupportedFallback: UnsupportedNodeFallback
}

const inline = ['text', 'hardBreak'] as const
const blocks = [
  'paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'checklist',
  'horizontalRule', 'codeBlock', 'mathBlock', 'table', 'image', 'fileAttachment',
  'audio', 'videoEmbed', 'pdfEmbed', 'canvasEmbed', 'pageBreak',
] as const

const rule = (childKind: NodeChildKind, allowedChildren: readonly string[], maxDepth: number,
  normalization: string, unsupportedFallback: UnsupportedNodeFallback): DocumentNodeRule =>
  ({ childKind, allowedChildren, maxDepth, normalization, unsupportedFallback })

/** Declarative content, depth, normalization, and fallback contract for every v1 node. */
export const DOCUMENT_NODE_RULES: Readonly<Record<DocumentNodeType, DocumentNodeRule>> = {
  paragraph: rule('inline', inline, 32, 'normalize inline content and merge adjacent equal marks', 'paragraph'),
  heading: rule('inline', inline, 32, 'normalize inline content and clamp level to 1-6', 'paragraph'),
  blockquote: rule('blocks', blocks, 8, 'normalize block children and insert a paragraph when empty', 'paragraph'),
  bulletList: rule('listItems', ['listItem'], 8, 'normalize list-item block children', 'paragraph'),
  orderedList: rule('listItems', ['listItem'], 8, 'normalize start and list-item block children', 'paragraph'),
  checklist: rule('checklistItems', ['checklistItem'], 8, 'normalize checked state and item children', 'paragraph'),
  listItem: rule('blocks', blocks, 8, 'normalize block children and insert a paragraph when empty', 'paragraph'),
  checklistItem: rule('blocks', blocks, 8, 'normalize checked state and block children', 'paragraph'),
  horizontalRule: rule('none', [], 32, 'discard unexpected child content', 'omit'),
  codeBlock: rule('plainText', [], 32, 'preserve text and trim optional language', 'paragraph'),
  mathBlock: rule('none', [], 32, 'trim LaTeX and optional label', 'paragraph'),
  table: rule('tableRows', ['tableRow'], 32, 'normalize table rows', 'paragraph'),
  tableRow: rule('tableCells', ['tableHeaderCell', 'tableCell'], 32, 'normalize table cells', 'paragraph'),
  tableHeaderCell: rule('blocks', blocks, 4, 'normalize spans, alignment, and block children', 'paragraph'),
  tableCell: rule('blocks', blocks, 4, 'normalize spans, alignment, and block children', 'paragraph'),
  image: rule('none', [], 32, 'retain asset reference and display metadata', 'attachment'),
  fileAttachment: rule('none', [], 32, 'retain asset reference and display metadata', 'attachment'),
  audio: rule('none', [], 32, 'retain asset reference and labels', 'attachment'),
  videoEmbed: rule('none', [], 32, 'retain an allowed provider and provider ID', 'paragraph'),
  pdfEmbed: rule('none', [], 32, 'normalize page and retain asset reference', 'attachment'),
  canvasEmbed: rule('none', [], 32, 'retain canvas and optional preview references', 'paragraph'),
  pageBreak: rule('none', [], 32, 'discard unexpected child content', 'omit'),
}

const allowedBlocks = new Set<string>(blocks)
function normalizeBlocks(content: readonly DocumentNode[], depth: number): DocumentNode[] {
  const result = content.filter((node) => allowedBlocks.has(node.type))
    .map((node) => normalizeDocumentNode(node, depth + 1))
  return result.length ? result : [createParagraph()]
}
function normalizeCell<T extends TableCellNode | TableHeaderCellNode>(node: T, depth: number): T {
  const colspan = Math.max(1, Math.floor(node.attrs?.colspan ?? 1))
  const rowspan = Math.max(1, Math.floor(node.attrs?.rowspan ?? 1))
  return { ...node, attrs: {
    ...(colspan !== 1 ? { colspan } : {}), ...(rowspan !== 1 ? { rowspan } : {}),
    ...(node.attrs?.alignment ? { alignment: node.attrs.alignment } : {}),
  }, content: normalizeBlocks(node.content, depth) }
}

export function normalizeDocumentNode(node: DocumentNode, depth = 0): DocumentNode {
  if (depth > MAX_DOCUMENT_NESTING_DEPTH) return createParagraph()
  switch (node.type) {
    case 'paragraph': return { ...node, ...(node.attrs ? { attrs: { ...node.attrs } } : {}), content: normalizeInlineContent(node.content) }
    case 'heading': return { ...node, attrs: { ...node.attrs, level: Math.min(6, Math.max(1, Math.floor(node.attrs.level))) as 1 | 2 | 3 | 4 | 5 | 6 }, content: normalizeInlineContent(node.content) }
    case 'blockquote': return { ...node, content: normalizeBlocks(node.content, depth) }
    case 'bulletList': return { ...node, content: node.content.map((item) => ({ ...item, content: normalizeBlocks(item.content, depth + 1) })) }
    case 'orderedList': {
      const start = Math.max(1, Math.floor(node.attrs?.start ?? 1))
      return { ...node, attrs: start === 1 ? {} : { start }, content: node.content.map((item) => ({ ...item, content: normalizeBlocks(item.content, depth + 1) })) }
    }
    case 'checklist': return { ...node, content: node.content.map((item) => ({ ...item, attrs: { checked: item.attrs.checked === true }, content: normalizeBlocks(item.content, depth + 1) })) }
    case 'listItem': return { ...node, content: normalizeBlocks(node.content, depth) }
    case 'checklistItem': return { ...node, attrs: { checked: node.attrs.checked === true }, content: normalizeBlocks(node.content, depth) }
    case 'codeBlock': { const language = node.attrs?.language?.trim(); return { ...node, attrs: language ? { language } : {} } }
    case 'mathBlock': { const label = node.attrs.label?.trim(); return { ...node, attrs: { latex: node.attrs.latex.trim(), ...(node.attrs.numbered ? { numbered: true } : {}), ...(label ? { label } : {}) } } }
    case 'table': return { ...node, content: node.content.map((row) => normalizeDocumentNode(row, depth + 1) as typeof row) }
    case 'tableRow': return { ...node, content: node.content.map((cell) => normalizeDocumentNode(cell, depth + 1) as typeof cell) }
    case 'tableHeaderCell': case 'tableCell': return normalizeCell(node, depth)
    case 'pdfEmbed': return { ...node, attrs: { ...node.attrs, ...(node.attrs.page ? { page: Math.max(1, Math.floor(node.attrs.page)) } : {}) } }
    default: return { ...node, ...('attrs' in node ? { attrs: { ...node.attrs } } : {}) } as DocumentNode
  }
}

function attributeLabel(node: DocumentNode): string {
  if (!('attrs' in node)) return ''
  const attrs = node.attrs as Record<string, unknown> | undefined
  for (const key of ['caption', 'title', 'alt', 'filename', 'videoId', 'canvasId']) {
    if (typeof attrs?.[key] === 'string' && attrs[key]) return String(attrs[key])
  }
  return ''
}
export function documentNodeToPlainText(node: DocumentNode): string {
  switch (node.type) {
    case 'paragraph': case 'heading': return inlineContentToPlainText(node.content)
    case 'blockquote': case 'listItem': case 'checklistItem': case 'tableHeaderCell': case 'tableCell': return documentNodesToPlainText(node.content)
    case 'bulletList': case 'orderedList': case 'checklist': case 'table': case 'tableRow': return node.content.map(documentNodeToPlainText).filter(Boolean).join('\n')
    case 'codeBlock': return node.text
    case 'mathBlock': return node.attrs.latex
    case 'horizontalRule': case 'pageBreak': return ''
    default: return attributeLabel(node)
  }
}
export const documentNodesToPlainText = (nodes: readonly DocumentNode[]): string =>
  nodes.map(documentNodeToPlainText).filter(Boolean).join('\n')

/** Generic import fallback; asset-aware importers can choose attachment instead. */
export function fallbackForUnsupportedNode(plainText: string): DocumentNode | null {
  const text = plainText.trim()
  return text ? createParagraph({ text }) : null
}
