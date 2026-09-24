import type { DocumentNode, IncantlyDocument } from './types.js'

export interface HtmlExportOptions { title?: string; className?: string }
const escape = (value: string): string => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!))
const inline = (node: DocumentNode): string => {
  if (node.type === 'paragraph' || node.type === 'heading') return node.content.map((item) => item.type === 'text' ? escape(item.text) : '<br>').join('')
  if (node.type === 'codeBlock') return `<pre><code>${escape(node.text)}</code></pre>`
  if (node.type === 'horizontalRule') return '<hr>'
  if (node.type === 'pageBreak') return '<div class="incantly-page-break" aria-hidden="true"></div>'
  if (node.type === 'image') return `<figure><img src="" alt="${escape(node.attrs.alt ?? '')}"><figcaption>${escape(node.attrs.caption ?? '')}</figcaption></figure>`
  return `<div data-incantly-node="${escape(node.type)}"></div>`
}
export function documentToHtml(document: IncantlyDocument, options: HtmlExportOptions = {}): string {
  const title = escape(options.title ?? document.metadata.title)
  const className = escape(options.className ?? 'incantly-document')
  return `<!doctype html><html lang="${escape(document.metadata.language)}"><head><meta charset="utf-8"><title>${title}</title><style>@page{size:${document.metadata.pageSetup.size};margin:${document.metadata.pageSetup.margins.top}pt ${document.metadata.pageSetup.margins.right}pt ${document.metadata.pageSetup.margins.bottom}pt ${document.metadata.pageSetup.margins.left}pt}.incantly-page-break{break-after:page}</style></head><body><main class="${className}">${document.content.map(inline).join('')}</main></body></html>`
}
