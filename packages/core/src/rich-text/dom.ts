import type { BlockType, InlineSpan, TextBlock } from './types.js'
import { mergeAdjacentSpans, validateBlocks } from './document.js'

const BLOCK_TAGS: Record<BlockType, string> = {
  paragraph: 'div',
  heading1: 'div',
  heading2: 'div',
  heading3: 'div',
  bulletList: 'div',
  numberedList: 'div',
  codeBlock: 'pre',
  quote: 'blockquote',
  divider: 'div',
}

function spanToHtml(span: InlineSpan): string {
  let html = escapeHtml(span.text)
  if (span.code) html = `<code>${html}</code>`
  if (span.bold) html = `<b>${html}</b>`
  if (span.italic) html = `<i>${html}</i>`
  if (span.underline) html = `<u>${html}</u>`
  if (span.strikethrough) html = `<s>${html}</s>`
  if (span.link?.href) {
    html = `<a href="${escapeAttr(span.link.href)}"${span.link.title ? ` title="${escapeAttr(span.link.title)}"` : ''}>${html}</a>`
  }
  const style: string[] = []
  if (span.fontSize) style.push(`font-size:${span.fontSize}px`)
  if (span.font) style.push(`font-family:var(--ic-font-${span.font})`)
  if (span.color) style.push(`color:var(--ic-color-${span.color})`)
  if (style.length) html = `<span style="${style.join(';')}">${html}</span>`
  return html || '<br>'
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;')
}

export function blocksToHtml(blocks: TextBlock[]): string {
  return blocks
    .map((block) => {
      const tag = BLOCK_TAGS[block.type]
      const cls = `ic-rt-block ic-rt-${block.type}`
      const indent = block.indent ? ` data-indent="${block.indent}"` : ''
      const inner =
        block.type === 'divider'
          ? '<hr contenteditable="false">'
          : block.content.map(spanToHtml).join('') || '<br>'
      return `<${tag} class="${cls}" data-block="${block.type}"${indent}>${inner}</${tag}>`
    })
    .join('')
}

function nodeToSpans(node: Node, inherited: InlineSpan = { text: '' }): InlineSpan[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? ''
    if (!text) return []
    return [{ ...inherited, text }]
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return []
  const el = node as HTMLElement
  const tag = el.tagName.toLowerCase()
  if (tag === 'br') return [{ ...inherited, text: '\n' }]
  const span: InlineSpan = { ...inherited, text: '' }
  if (tag === 'b' || tag === 'strong') span.bold = true
  if (tag === 'i' || tag === 'em') span.italic = true
  if (tag === 'u') span.underline = true
  if (tag === 's' || tag === 'strike') span.strikethrough = true
  if (tag === 'code') span.code = true
  if (tag === 'a') {
    const href = el.getAttribute('href')
    if (href) span.link = { href, title: el.getAttribute('title') || undefined }
    span.underline = true
  }
  const fs = el.style.fontSize
  if (fs && fs.endsWith('px')) {
    const n = parseFloat(fs)
    if (Number.isFinite(n)) span.fontSize = n
  }
  const out: InlineSpan[] = []
  for (const child of Array.from(el.childNodes)) out.push(...nodeToSpans(child, span))
  return out
}

function elementToBlock(el: HTMLElement): TextBlock | null {
  const type = (el.getAttribute('data-block') ||
    el.dataset.block ||
    'paragraph') as BlockType
  const indentRaw = el.getAttribute('data-indent')
  const indent = indentRaw ? parseInt(indentRaw, 10) : undefined
  const content = mergeAdjacentSpans(
    [...Array.from(el.childNodes)].flatMap((n) => nodeToSpans(n, { text: '' }))
  )
  const block: TextBlock = {
    type: type === 'codeBlock' && el.tagName === 'PRE' ? 'codeBlock' : type,
    content: content.length ? content : [{ text: '' }],
  }
  if (indent !== undefined && !Number.isNaN(indent)) block.indent = indent
  return block
}

export function htmlToBlocks(root: HTMLElement): TextBlock[] {
  const blocks: TextBlock[] = []
  for (const child of Array.from(root.children)) {
    const b = elementToBlock(child as HTMLElement)
    if (b) blocks.push(b)
  }
  if (!blocks.length) {
    const content = mergeAdjacentSpans(
      [...Array.from(root.childNodes)].flatMap((n) => nodeToSpans(n, { text: '' }))
    )
    blocks.push({
      type: 'paragraph',
      content: content.length ? content : [{ text: '' }],
    })
  }
  return validateBlocks(blocks)
}

export function createRichEditElement(): HTMLDivElement {
  const el = document.createElement('div')
  el.className = 'ic-rich-edit'
  el.contentEditable = 'true'
  el.spellcheck = true
  return el
}

export function execFormat(cmd: string, value?: string): void {
  if (cmd === 'createLink') {
    document.execCommand('createLink', false, value || 'https://')
    return
  }
  document.execCommand(cmd, false, value)
}

/** Apply pixel font size to the current non-collapsed selection (page doc + shape editors). */
export function applyInlineFontSize(px: number): boolean {
  if (!Number.isFinite(px) || px <= 0) return false
  const sel = window.getSelection()
  if (!sel?.rangeCount || sel.isCollapsed) return false
  const range = sel.getRangeAt(0)
  if (!range.toString()) return false

  const span = document.createElement('span')
  span.style.fontSize = `${px}px`

  try {
    range.surroundContents(span)
  } catch {
    const fragment = range.extractContents()
    if (!fragment.textContent && !fragment.childNodes.length) return false
    span.appendChild(fragment)
    range.insertNode(span)
    sel.removeAllRanges()
    const next = document.createRange()
    next.selectNodeContents(span)
    sel.addRange(next)
  }
  return true
}

export function getSelectionRect(): DOMRect | null {
  const sel = window.getSelection()
  if (!sel?.rangeCount) return null
  const range = sel.getRangeAt(0)
  if (range.collapsed) return null
  return range.getBoundingClientRect()
}
