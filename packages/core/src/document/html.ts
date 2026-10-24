import { FONT_FAMILY_STACKS } from './inline.js'
import type { DocumentNode, IncantlyDocument, InlineNode, TextAlignment, TextMark } from './types.js'

export interface HtmlExportOptions { title?: string; className?: string; assetUrls?: Readonly<Record<string, string>>; maxAssetUrlLength?: number }
const escape = (value: string): string => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!))
const escapeAttr = (value: string): string => escape(value).replace(/\n|\r/g, ' ')

function alignmentStyle(alignment: TextAlignment | undefined): string {
  return alignment && alignment !== 'left' ? ` style="text-align:${alignment}"` : ''
}

function renderMark(mark: TextMark, inner: string): string {
  switch (mark.type) {
    case 'bold': return `<strong>${inner}</strong>`
    case 'italic': return `<em>${inner}</em>`
    case 'underline': return `<u>${inner}</u>`
    case 'strike': return `<s>${inner}</s>`
    case 'code': return `<code>${inner}</code>`
    case 'link': return `<a href="${escapeAttr(mark.href)}"${mark.title ? ` title="${escapeAttr(mark.title)}"` : ''}>${inner}</a>`
    case 'textColor': return `<span style="color:${escapeAttr(mark.color)}">${inner}</span>`
    case 'highlight': return `<mark style="background-color:${escapeAttr(mark.color)}">${inner}</mark>`
    case 'fontFamily': return `<span style="font-family:${escapeAttr(FONT_FAMILY_STACKS[mark.family])}">${inner}</span>`
    case 'fontSize': return `<span style="font-size:${escapeAttr(String(mark.size))}pt">${inner}</span>`
    case 'citation': return `<cite data-citation-id="${escapeAttr(mark.citationId)}">${inner}</cite>`
    case 'inlineMath': return `<code class="math-inline" data-latex="${escapeAttr(mark.latex)}">${inner}</code>`
    default: return inner
  }
}

function renderInlineNode(node: InlineNode): string {
  if (node.type === 'hardBreak') return '<br>'
  if (node.type === 'inlineMath') return `<code class="math-inline" data-latex="${escapeAttr(node.latex)}">${escape(node.latex)}</code>`
  const text = escape(node.text)
  if (!text) return ''
  return (node.marks ?? []).reduceRight((inner, mark) => renderMark(mark, inner), text)
}

function renderInlineContent(content: InlineNode[] | undefined): string {
  return (content ?? []).map(renderInlineNode).join('')
}

function card(title: string, detail: string): string {
  return `<aside class="attachment"><strong>${escape(title)}</strong>${detail ? `<span>${escape(detail)}</span>` : ''}</aside>`
}

function renderChildren(nodes: DocumentNode[] | undefined, options: HtmlExportOptions): string {
  return (nodes ?? []).map((node) => renderBlock(node, options)).join('')
}

function renderTableCell(tag: 'th' | 'td', node: { attrs?: { colspan?: number; rowspan?: number; alignment?: TextAlignment }; content: DocumentNode[] }, options: HtmlExportOptions): string {
  const attrs = node.attrs ?? {}
  const span = `${typeof attrs.colspan === 'number' && attrs.colspan > 1 ? ` colspan="${attrs.colspan}"` : ''}${typeof attrs.rowspan === 'number' && attrs.rowspan > 1 ? ` rowspan="${attrs.rowspan}"` : ''}`
  const align = attrs.alignment && attrs.alignment !== 'left' ? ` style="text-align:${attrs.alignment}"` : ''
  return `<${tag}${span}${align}>${renderChildren(node.content, options)}</${tag}>`
}

function renderBlock(node: DocumentNode, options: HtmlExportOptions): string {
  switch (node.type) {
    case 'paragraph': {
      const body = renderInlineContent(node.content) || '<br>'
      return `<p${alignmentStyle(node.attrs?.alignment)}>${body}</p>`
    }
    case 'heading': {
      const level = Math.min(6, Math.max(1, node.attrs.level))
      return `<h${level}${alignmentStyle(node.attrs.alignment)}>${renderInlineContent(node.content) || '<br>'}</h${level}>`
    }
    case 'blockquote': return `<blockquote>${renderChildren(node.content, options) || '<br>'}</blockquote>`
    case 'bulletList': return `<ul>${node.content.map((item) => `<li>${renderChildren(item.content, options)}</li>`).join('')}</ul>`
    case 'orderedList': {
      const start = typeof node.attrs?.start === 'number' && node.attrs.start !== 1 ? ` start="${node.attrs.start}"` : ''
      return `<ol${start}>${node.content.map((item) => `<li>${renderChildren(item.content, options)}</li>`).join('')}</ol>`
    }
    case 'checklist':
      return `<ul class="checklist">${node.content.map((item) => `<li><input type="checkbox" disabled${item.attrs.checked ? ' checked' : ''}>${renderChildren(item.content, options)}</li>`).join('')}</ul>`
    case 'listItem':
    case 'checklistItem':
      return `<li>${renderChildren(node.content, options)}</li>`
    case 'horizontalRule': return '<hr>'
    case 'details': {
      const open = node.attrs.open === true ? ' open' : ''
      const summary = escape(node.attrs.summary) || '<br>'
      return `<details${open}><summary>${summary}</summary>${renderChildren(node.content, options) || '<br>'}</details>`
    }
    case 'codeBlock': {
      const language = node.attrs?.language ? ` class="language-${escapeAttr(node.attrs.language)}"` : ''
      return `<pre><code${language}>${escape(node.text)}</code></pre>`
    }
    case 'mathBlock': {
      const label = node.attrs.label ? `<figcaption>${escape(node.attrs.label)}</figcaption>` : ''
      return `<figure class="math"><pre><code data-latex="${escapeAttr(node.attrs.latex)}">${escape(node.attrs.latex)}</code></pre>${label}</figure>`
    }
    case 'table': {
      const headerRows = node.content.filter((row) => row.content.length > 0 && row.content.every((cell) => cell.type === 'tableHeaderCell'))
      const bodyRows = node.content.filter((row) => !(row.content.length > 0 && row.content.every((cell) => cell.type === 'tableHeaderCell')))
      const renderRow = (row: (typeof node.content)[number]): string =>
        `<tr>${row.content.map((cell) => renderTableCell(cell.type === 'tableHeaderCell' ? 'th' : 'td', cell, options)).join('')}</tr>`
      const caption = node.attrs?.caption ? `<caption>${escape(node.attrs.caption)}</caption>` : ''
      const thead = headerRows.length > 0 ? `<thead>${headerRows.map(renderRow).join('')}</thead>` : ''
      return `<table>${caption}${thead}<tbody>${bodyRows.map(renderRow).join('')}</tbody></table>`
    }
    case 'tableRow':
      return `<tr>${node.content.map((cell) => renderTableCell(cell.type === 'tableHeaderCell' ? 'th' : 'td', cell, options)).join('')}</tr>`
    case 'tableHeaderCell': return renderTableCell('th', node, options)
    case 'tableCell': return renderTableCell('td', node, options)
    case 'image': {
      const src = options.assetUrls?.[String(node.attrs.assetId)] ?? ''
      const usable = src.length <= (options.maxAssetUrlLength ?? 2_000_000) ? src : ''
      const dims = `${typeof node.attrs.width === 'number' ? ` width="${Math.round(node.attrs.width)}"` : ''}${typeof node.attrs.height === 'number' ? ` height="${Math.round(node.attrs.height)}"` : ''}`
      const img = `<img src="${escapeAttr(usable)}" alt="${escapeAttr(node.attrs.alt ?? '')}"${dims}>`
      const align = node.attrs.alignment ? ` data-align="${escapeAttr(node.attrs.alignment)}"` : ''
      return node.attrs.display === 'inline' ? img : `<figure${align}>${img}${node.attrs.caption ? `<figcaption>${escape(node.attrs.caption)}</figcaption>` : ''}</figure>`
    }
    case 'fileAttachment':
      return card(node.attrs.filename ?? 'Attachment', [node.attrs.mimeType, `id:${node.attrs.assetId}`].filter(Boolean).join(' · '))
    case 'audio':
      return card(node.attrs.title ?? 'Audio', node.attrs.caption ?? `id:${node.attrs.assetId}`)
    case 'videoEmbed': {
      const watch = node.attrs.provider === 'youtube'
        ? `https://www.youtube.com/watch?v=${encodeURIComponent(node.attrs.videoId)}`
        : `https://vimeo.com/${encodeURIComponent(node.attrs.videoId)}`
      return `<aside class="attachment"><strong>${escape(node.attrs.title ?? `${node.attrs.provider} video`)}</strong><a href="${escapeAttr(watch)}" rel="noopener noreferrer">Watch video</a>${node.attrs.caption ? `<span>${escape(node.attrs.caption)}</span>` : ''}</aside>`
    }
    case 'pdfEmbed':
      return card('PDF document', `id:${node.attrs.assetId}${typeof node.attrs.page === 'number' ? ` · page ${node.attrs.page}` : ''}`)
    case 'canvasEmbed':
      return card('Canvas embed', node.attrs.caption ?? `id:${node.attrs.canvasId}`)
    case 'pageBreak': return '<div class="incantly-page-break" aria-hidden="true"></div>'
    default: return ''
  }
}

const DEFAULT_STYLESHEET = [
  '.incantly-document{font-family:Inter,ui-sans-serif,system-ui,sans-serif;font-size:1rem;line-height:1.65;color:#202124;overflow-wrap:anywhere}',
  '.incantly-document h1,.incantly-document h2,.incantly-document h3,.incantly-document h4,.incantly-document h5,.incantly-document h6{line-height:1.3;margin:1.2em 0 0.5em}',
  '.incantly-document h1{font-size:1.875rem}.incantly-document h2{font-size:1.5rem}.incantly-document h3{font-size:1.25rem}',
  '.incantly-document p{margin:0 0 0.75rem}',
  '.incantly-document ul,.incantly-document ol{margin:0 0 0.75rem;padding-inline-start:1.5rem}',
  '.incantly-document ul.checklist{list-style:none;padding-inline-start:0}',
  '.incantly-document ul.checklist input{margin-inline-end:0.5rem;accent-color:#4f7cff}',
  '.incantly-document blockquote{margin:0 0 0.75rem;padding-inline-start:1rem;border-inline-start:0.22rem solid #dfe2e7;color:#5b6068}',
  '.incantly-document pre{overflow:auto;padding:0.9rem 1rem;border-radius:0.5rem;background:#f1f3f6}',
  '.incantly-document code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:0.9em}',
  '.incantly-document table{width:100%;border-collapse:collapse;margin:0 0 0.75rem}',
  '.incantly-document th,.incantly-document td{min-width:4rem;padding:0.45rem 0.65rem;border:1px solid #dfe2e7;vertical-align:top}',
  '.incantly-document th{background:#f1f3f6;text-align:start}',
  '.incantly-document figure{margin:0 0 0.75rem}.incantly-document figcaption{font-size:0.85rem;color:#5b6068}',
  '.incantly-document img{max-width:100%;height:auto}',
  '.incantly-document hr{border:0;border-top:1px solid #dfe2e7;margin:1.5rem 0}',
  '.incantly-document .attachment{display:grid;gap:0.25rem;padding:0.8rem 1rem;margin:0 0 0.75rem;border:1px solid #dfe2e7;border-radius:0.5rem;background:#f7f8fa;font-size:0.9rem}',
  '.incantly-document .incantly-page-break{break-after:page}',
  '.incantly-document p{orphans:2;widows:2}.incantly-document table,.incantly-document figure,.incantly-document pre{break-inside:avoid}',
].join('')

export function documentToHtml(document: IncantlyDocument, options: HtmlExportOptions = {}): string {
  const title = escape(options.title ?? document.metadata.title)
  const className = escapeAttr(options.className ?? 'incantly-document')
  const setup = document.metadata.pageSetup
  const size = setup.size === 'custom' ? `${setup.width}pt ${setup.height}pt` : setup.size
  const printRules = `@page{size:${size} ${setup.orientation};margin:${setup.margins.top}pt ${setup.margins.right}pt ${setup.margins.bottom}pt ${setup.margins.left}pt;@top-center{content:string(document-title)}@bottom-center{content:counter(page) " / " counter(pages)}}h1{string-set:document-title content()}`
  return `<!doctype html><html lang="${escapeAttr(document.metadata.language)}"><head><meta charset="utf-8"><title>${title}</title><style>${printRules}${DEFAULT_STYLESHEET}</style></head><body><main class="${className}">${renderChildren(document.content, options)}</main></body></html>`
}
