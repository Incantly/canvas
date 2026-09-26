import type { DocumentNode, IncantlyDocument } from './types.js'

export interface ExportProjectionNode { id: string; type: DocumentNode['type']; text: string; depth: number; source: DocumentNode }
export interface ExportProjection { title: string; language: string; nodes: ExportProjectionNode[] }

const inlineText = (node: DocumentNode): string => {
  if (node.type === 'paragraph' || node.type === 'heading') return node.content.map((item) => item.type === 'text' ? item.text : '\n').join('')
  if (node.type === 'codeBlock') return node.text
  if (node.type === 'mathBlock') return node.attrs.latex
  return ''
}
export function createExportProjection(document: IncantlyDocument): ExportProjection {
  const nodes: ExportProjectionNode[] = []
  const visit = (node: DocumentNode, depth: number) => {
    nodes.push({ id: String(node.id), type: node.type, text: inlineText(node), depth, source: node })
    if ('content' in node && Array.isArray(node.content) && node.type !== 'paragraph' && node.type !== 'heading')
      node.content.forEach((child) => visit(child as DocumentNode, depth + 1))
  }
  document.content.forEach((node) => visit(node, 0))
  return { title: document.metadata.title, language: document.metadata.language, nodes }
}
