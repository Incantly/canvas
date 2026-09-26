import type { DocumentNode, IncantlyDocument } from './types.js'

export type ExportFormat = 'inc' | 'txt' | 'md' | 'html' | 'pdf' | 'docx'
export type ExportOutput = { kind: 'text'; text: string } | { kind: 'bytes'; bytes: Uint8Array }
export interface ExportWarning { code: string; message: string; nodeId?: string }
export interface ExportLoss { feature: string; reason: string; nodeId?: string }
export interface ExportProgress { phase: 'projecting' | 'resolving-assets' | 'rendering' | 'packaging'; completed: number; total?: number }
export interface ExportResult { format: ExportFormat; filename: string; mimeType: string; output: ExportOutput; warnings: ExportWarning[]; losses?: ExportLoss[] }
export interface ExportOptions { filename?: string; lineEnding?: 'lf' | 'crlf'; includeMetadata?: boolean; unsupported?: 'omit' | 'text' | 'placeholder'; encoding?: 'utf-8'; locale?: string; timeZone?: string; signal?: AbortSignal; onProgress?: (progress: ExportProgress) => void }
export interface AssetResolver { resolve(assetId: string): Promise<{ url?: string; bytes?: Uint8Array; mimeType?: string } | undefined> }
const cancelled = (): Error => Object.assign(new Error('Export cancelled'), { name: 'AbortError' })

const textOf = (node: DocumentNode): string => {
  if (node.type === 'paragraph' || node.type === 'heading') return node.content.map((item) => item.type === 'text' ? item.text : item.type === 'inlineMath' ? `$${item.latex}$` : '\n').join('')
  if (node.type === 'details') return [node.attrs.summary, node.content.map((child) => textOf(child)).join('\n')].filter(Boolean).join('\n')
  if (node.type === 'codeBlock') return node.text
  if (node.type === 'mathBlock') return node.attrs.latex
  if ('content' in node && Array.isArray(node.content)) return node.content.map((child) => textOf(child as DocumentNode)).join('\n')
  return ''
}
const markdownOf = (node: DocumentNode, warnings: ExportWarning[]): string => {
  if (node.type === 'heading') return `${'#'.repeat(node.attrs.level)} ${textOf(node)}\n`
  if (node.type === 'paragraph') return `${textOf(node)}\n`
  if (node.type === 'codeBlock') return `\n\`\`\`${node.attrs?.language ?? ''}\n${node.text}\n\`\`\`\n`
  if (node.type === 'mathBlock') return `\n$$\n${node.attrs.latex}\n$$\n`
  if (node.type === 'horizontalRule') return '\n---\n'
  if (node.type === 'details') return `\n**${node.attrs.summary}**\n${node.content.map((child) => markdownOf(child as DocumentNode, warnings)).join('')}\n`
  if (node.type === 'pageBreak') return '\n<div class="incantly-page-break"></div>\n'
  if (node.type === 'image') return `![${node.attrs.alt ?? ''}](asset:${node.attrs.assetId})\n`
  warnings.push({ code: 'unsupported-node', nodeId: node.id, message: `${node.type} exported as plain text` })
  return `${textOf(node)}\n`
}
const filename = (document: IncantlyDocument, options: ExportOptions, ext: string): string => `${(options.filename ?? document.metadata.title) || 'document'}.${ext}`
export function exportText(document: IncantlyDocument, options: ExportOptions = {}): ExportResult {
  if (options.signal?.aborted) throw cancelled()
  options.onProgress?.({ phase: 'projecting', completed: 0, total: document.content.length })
  const warnings: ExportWarning[] = []
  const separator = options.lineEnding === 'crlf' ? '\r\n' : '\n'
  const text = document.content.map(textOf).join(separator) + separator
  return { format: 'txt', filename: filename(document, options, 'txt'), mimeType: 'text/plain;charset=utf-8', output: { kind: 'text', text }, warnings }
}
export function exportMarkdown(document: IncantlyDocument, options: ExportOptions = {}): ExportResult {
  if (options.signal?.aborted) throw cancelled()
  const warnings: ExportWarning[] = []
  const metadata = options.includeMetadata ? `---\ntitle: ${document.metadata.title}\nlanguage: ${document.metadata.language}\n---\n\n` : ''
  return { format: 'md', filename: filename(document, options, 'md'), mimeType: 'text/markdown;charset=utf-8', output: { kind: 'text', text: metadata + document.content.map((node) => markdownOf(node, warnings)).join('\n') }, warnings }
}
