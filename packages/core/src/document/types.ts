import type { AssetId, CitationId, DocumentId, DocumentNodeId } from './ids.js'

export type DocumentSchemaVersion = 1
export type PageMode = 'continuous' | 'paginated'
export type PageSize = 'a4' | 'letter' | 'legal' | 'custom'
export type PageOrientation = 'portrait' | 'landscape'
export type TextAlignment = 'left' | 'center' | 'right' | 'justify'

/** Print measurements are expressed in points (1/72 inch). */
export interface PageMargins { top: number; right: number; bottom: number; left: number }
export interface PageSetup {
  mode: PageMode
  size: PageSize
  /** Required when size is custom; ignored for named sizes. */
  width?: number
  /** Required when size is custom; ignored for named sizes. */
  height?: number
  orientation: PageOrientation
  margins: PageMargins
  headerDistance?: number
  footerDistance?: number
  mirroredMargins?: boolean
  startingPageNumber?: number
  columns: 1 | 2
}

export type HeaderFooterFieldType = 'pageNumber' | 'pageCount' | 'documentTitle' | 'currentDate'
export interface HeaderFooterField { type: 'field'; field: HeaderFooterFieldType; format?: string }
export type HeaderFooterContent = DocumentNode | HeaderFooterField

export interface PageLayoutSection {
  id: string
  startNodeId?: DocumentNodeId
  pageSetup: PageSetup
  headers?: PageHeaderFooterVariants
  footers?: PageHeaderFooterVariants
}

export interface PageHeaderFooterVariants {
  default?: HeaderFooterContent[]
  first?: HeaderFooterContent[]
  odd?: HeaderFooterContent[]
  even?: HeaderFooterContent[]
}

export interface PageLayout {
  version: 1
  defaultSection: PageLayoutSection
  sections: PageLayoutSection[]
}

export interface DocumentAuthor {
  id?: string
  name: string
  email?: string
  orcid?: string
  affiliations?: string[]
}
export interface ResearchMetadata {
  title?: string
  authors?: DocumentAuthor[]
  abstract?: DocumentNode[]
  keywords?: string[]
  language?: string
  citationStyle?: 'apa' | 'mla' | 'chicago' | 'ieee' | (string & {})
}
export interface DocumentMetadata {
  title: string
  language: string
  authors: DocumentAuthor[]
  tags: string[]
  pageSetup: PageSetup
  layout?: PageLayout
  research?: ResearchMetadata
}

export interface BoldMark { type: 'bold' }
export interface ItalicMark { type: 'italic' }
export interface UnderlineMark { type: 'underline' }
export interface StrikeMark { type: 'strike' }
export interface CodeMark { type: 'code' }
export interface LinkMark { type: 'link'; href: string; title?: string }
export interface TextColorMark { type: 'textColor'; color: string }
export interface HighlightMark { type: 'highlight'; color: string }
export type FontFamilyKey = 'sans' | 'times' | 'mono'
export interface FontFamilyMark { type: 'fontFamily'; family: FontFamilyKey }
/** Inline font size in points (Word-style presets). */
export interface FontSizeMark { type: 'fontSize'; size: number }
export interface CitationMark { type: 'citation'; citationId: CitationId }
export interface InlineMathMark { type: 'inlineMath'; latex: string }
export type TextMark =
  | BoldMark | ItalicMark | UnderlineMark | StrikeMark | CodeMark | LinkMark
  | TextColorMark | HighlightMark | FontFamilyMark | FontSizeMark | CitationMark | InlineMathMark
export type TextMarkType = TextMark['type']

export interface DocumentTextNode { type: 'text'; text: string; marks?: TextMark[] }
export interface HardBreakNode { type: 'hardBreak' }
export interface InlineMathNode { type: 'inlineMath'; latex: string }
export type InlineNode = DocumentTextNode | HardBreakNode | InlineMathNode

export interface ParagraphNode {
  id: DocumentNodeId
  type: 'paragraph'
  attrs?: { alignment?: TextAlignment; lineHeight?: number }
  content: InlineNode[]
}
export interface HeadingNode {
  id: DocumentNodeId
  type: 'heading'
  attrs: { level: 1 | 2 | 3 | 4 | 5 | 6; alignment?: TextAlignment }
  content: InlineNode[]
}
export interface BlockquoteNode { id: DocumentNodeId; type: 'blockquote'; content: DocumentNode[] }
export interface BulletListNode { id: DocumentNodeId; type: 'bulletList'; content: ListItemNode[] }
export interface OrderedListNode { id: DocumentNodeId; type: 'orderedList'; attrs?: { start?: number }; content: ListItemNode[] }
export interface ChecklistNode { id: DocumentNodeId; type: 'checklist'; content: ChecklistItemNode[] }
export interface ListItemNode { id: DocumentNodeId; type: 'listItem'; content: DocumentNode[] }
export interface ChecklistItemNode { id: DocumentNodeId; type: 'checklistItem'; attrs: { checked: boolean }; content: DocumentNode[] }
export interface HorizontalRuleNode { id: DocumentNodeId; type: 'horizontalRule' }
export interface DetailsNode {
  id: DocumentNodeId
  type: 'details'
  attrs: { summary: string; open?: boolean }
  content: DocumentNode[]
}
export interface CodeBlockNode { id: DocumentNodeId; type: 'codeBlock'; attrs?: { language?: string }; text: string }
export interface MathBlockNode {
  id: DocumentNodeId
  type: 'mathBlock'
  attrs: { latex: string; numbered?: boolean; label?: string }
}
export interface TableNode { id: DocumentNodeId; type: 'table'; attrs?: { caption?: string }; content: TableRowNode[] }
export interface TableRowNode { id: DocumentNodeId; type: 'tableRow'; content: Array<TableHeaderCellNode | TableCellNode> }
export interface TableCellAttributes { colspan?: number; rowspan?: number; alignment?: TextAlignment }
export interface TableHeaderCellNode { id: DocumentNodeId; type: 'tableHeaderCell'; attrs?: TableCellAttributes; content: DocumentNode[] }
export interface TableCellNode { id: DocumentNodeId; type: 'tableCell'; attrs?: TableCellAttributes; content: DocumentNode[] }
export interface ImageNode {
  id: DocumentNodeId
  type: 'image'
  attrs: { assetId: AssetId; alt?: string; caption?: string; width?: number; height?: number; display?: 'inline' | 'block' | 'figure'; alignment?: TextAlignment }
}
export interface FileAttachmentNode {
  id: DocumentNodeId
  type: 'fileAttachment'
  attrs: { assetId: AssetId; filename?: string; mimeType?: string; display?: 'card' | 'inline' }
}
export interface AudioNode { id: DocumentNodeId; type: 'audio'; attrs: { assetId: AssetId; title?: string; caption?: string } }
export type VideoEmbedProvider = 'youtube' | 'vimeo'
export interface VideoEmbedNode {
  id: DocumentNodeId
  type: 'videoEmbed'
  attrs: { provider: VideoEmbedProvider; videoId: string; title?: string; caption?: string }
}
export interface PdfEmbedNode {
  id: DocumentNodeId
  type: 'pdfEmbed'
  attrs: { assetId: AssetId; page?: number; display: 'card' | 'preview' | 'reader'; extractedDocumentId?: DocumentId }
}
export interface CanvasEmbedNode {
  id: DocumentNodeId
  type: 'canvasEmbed'
  attrs: { canvasId: string; previewAssetId?: AssetId; caption?: string; display?: 'card' | 'preview' }
}
export interface PageBreakNode { id: DocumentNodeId; type: 'pageBreak' }

export type DocumentNode =
  | ParagraphNode | HeadingNode | BlockquoteNode | BulletListNode | OrderedListNode
  | ChecklistNode | ListItemNode | ChecklistItemNode | HorizontalRuleNode | DetailsNode | CodeBlockNode
  | MathBlockNode | TableNode | TableRowNode | TableHeaderCellNode | TableCellNode
  | ImageNode | FileAttachmentNode | AudioNode | VideoEmbedNode | PdfEmbedNode
  | CanvasEmbedNode | PageBreakNode
export type DocumentNodeType = DocumentNode['type']

export interface IncantlyDocument {
  schemaVersion: DocumentSchemaVersion
  id: DocumentId
  type: 'document'
  metadata: DocumentMetadata
  content: DocumentNode[]
  createdAt: string
  updatedAt: string
}
