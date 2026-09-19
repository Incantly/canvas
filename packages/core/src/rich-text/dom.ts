import type { BlockType, InlineSpan, TextBlock } from './types.js'
import {
  mergeAdjacentSpans,
  sanitizeColorId,
  sanitizeFontId,
  sanitizeFontSize,
  sanitizeLinkHref,
  sanitizeLinkTitle,
  validateBlocks,
} from './document.js'

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

/**
 * Build a span element through DOM APIs only. Text is assigned via
 * `textContent`, styles via the `style` object, and link attributes via
 * `setAttribute` after allowlist validation — never via HTML strings.
 */
export function createSpanElement(span: InlineSpan): Node {
  // Base text node — safe by construction.
  let node: Node = document.createTextNode(span.text ?? '')
  const wrap = (tag: string): void => {
    const el = document.createElement(tag)
    el.appendChild(node)
    node = el
  }
  if (span.code) wrap('code')
  if (span.bold) wrap('b')
  if (span.italic) wrap('i')
  if (span.underline) wrap('u')
  if (span.strikethrough) wrap('s')
  if (span.link) {
    const href = sanitizeLinkHref(span.link.href)
    if (href) {
      const a = document.createElement('a')
      a.setAttribute('href', href)
      const title = sanitizeLinkTitle(span.link.title)
      if (title !== undefined) a.setAttribute('title', title)
      // Links from snapshots never get scriptable targets; when a host opens
      // them in a new context, `noopener` prevents window.opener abuse.
      a.setAttribute('rel', 'noopener noreferrer')
      a.appendChild(node)
      node = a
    }
  }
  const color = sanitizeColorId(span.color)
  const font = sanitizeFontId(span.font)
  const fontSize = sanitizeFontSize(span.fontSize)
  if (color !== undefined || font !== undefined || fontSize !== undefined) {
    const outer = document.createElement('span')
    if (fontSize !== undefined) outer.style.fontSize = `${fontSize}px`
    if (font !== undefined) outer.style.fontFamily = `var(--ic-font-${font})`
    if (color !== undefined) outer.style.color = `var(--ic-color-${color})`
    outer.appendChild(node)
    node = outer
  }
  return node
}

export function createBlockElement(block: TextBlock): HTMLElement {
  const tag = BLOCK_TAGS[block.type] ?? 'div'
  const el = document.createElement(tag)
  el.className = `ic-rt-block ic-rt-${block.type}`
  el.setAttribute('data-block', block.type)
  if (typeof block.indent === 'number' && Number.isFinite(block.indent) && block.indent > 0) {
    el.setAttribute('data-indent', String(Math.floor(block.indent)))
  }
  if (block.type === 'divider') {
    const hr = document.createElement('hr')
    hr.setAttribute('contenteditable', 'false')
    el.appendChild(hr)
    return el
  }
  if (!block.content.length || block.content.every((s) => !s.text)) {
    el.appendChild(document.createElement('br'))
    return el
  }
  for (const span of block.content) {
    if (!span.text) continue
    el.appendChild(createSpanElement(span))
  }
  if (!el.hasChildNodes()) el.appendChild(document.createElement('br'))
  return el
}

export function blocksToHtml(blocks: TextBlock[]): string {
  // Compat serializer: builds via DOM APIs above, then serializes. The
  // resulting HTML cannot contain nodes/attributes outside the validated
  // model because the DOM was constructed element-by-element.
  const container = document.createElement('div')
  for (const block of blocks) container.appendChild(createBlockElement(block))
  return container.innerHTML
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
    const clean = href ? sanitizeLinkHref(href) : null
    if (clean) span.link = { href: clean, title: sanitizeLinkTitle(el.getAttribute('title')) }
    span.underline = true
  }
  const fs = el.style.fontSize
  if (fs && fs.endsWith('px')) {
    const n = parseFloat(fs)
    const clean = sanitizeFontSize(n)
    if (clean !== undefined) span.fontSize = clean
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
    const clean = value ? sanitizeLinkHref(value) : null
    document.execCommand('createLink', false, clean ?? 'https://')
    return
  }
  document.execCommand(cmd, false, value)
}

/** Apply pixel font size to the current non-collapsed selection (page doc + shape editors). */
export function applyInlineFontSize(px: number): boolean {
  const clean = sanitizeFontSize(px)
  if (clean === undefined) return false
  const sel = window.getSelection()
  if (!sel?.rangeCount || sel.isCollapsed) return false
  const range = sel.getRangeAt(0)
  if (!range.toString()) return false

  const span = document.createElement('span')
  span.style.fontSize = `${clean}px`

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
