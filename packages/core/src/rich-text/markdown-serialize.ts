import type { BlockType, InlineSpan, TextBlock } from './types.js'
import { mergeAdjacentSpans, validateBlocks } from './document.js'

const HEADING_PREFIX: Record<string, BlockType> = {
  '# ': 'heading1',
  '## ': 'heading2',
  '### ': 'heading3',
}

function escapeMarkdownText(text: string): string {
  return text.replace(/([\\`*_{}[\]()#+\-.!|>])/g, '\\$1')
}

function spanToMarkdown(span: InlineSpan): string {
  let t = span.text
  if (!t) return ''
  if (span.code) return '`' + t.replace(/`/g, '\\`') + '`'
  if (span.link?.href) {
    const label = t.replace(/]/g, '\\]')
    return `[${label}](${span.link.href})`
  }
  if (span.bold && span.italic) t = `***${t}***`
  else if (span.bold) t = `**${t}**`
  else if (span.italic) t = `*${t}*`
  if (span.strikethrough) t = `~~${t}~~`
  if (span.underline) t = `<u>${t}</u>`
  return t
}

function blockPrefix(type: BlockType): string {
  switch (type) {
    case 'heading1':
      return '# '
    case 'heading2':
      return '## '
    case 'heading3':
      return '### '
    case 'bulletList':
      return '- '
    case 'numberedList':
      return '1. '
    case 'quote':
      return '> '
    case 'codeBlock':
      return '```\n'
    case 'divider':
      return '---'
    default:
      return ''
  }
}

/** Serialize a single TextBlock to a markdown string for Enriched Markdown. */
export function textBlockToMarkdown(block: TextBlock): string {
  if (block.type === 'divider') return '---'
  if (block.type === 'codeBlock') {
    const body = block.content.map((s) => s.text).join('')
    return '```\n' + body + '\n```'
  }
  const prefix = blockPrefix(block.type)
  const body = block.content.map(spanToMarkdown).join('')
  if (block.type === 'quote') {
    return body
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n')
  }
  return prefix + body
}

function parseInlineMarkdown(text: string): InlineSpan[] {
  const spans: InlineSpan[] = []
  let i = 0
  while (i < text.length) {
    if (text.startsWith('***', i)) {
      const end = text.indexOf('***', i + 3)
      if (end !== -1) {
        spans.push({ text: text.slice(i + 3, end), bold: true, italic: true })
        i = end + 3
        continue
      }
    }
    if (text.startsWith('**', i)) {
      const end = text.indexOf('**', i + 2)
      if (end !== -1) {
        spans.push({ text: text.slice(i + 2, end), bold: true })
        i = end + 2
        continue
      }
    }
    if (text[i] === '*' && text[i + 1] !== '*') {
      const end = text.indexOf('*', i + 1)
      if (end !== -1) {
        spans.push({ text: text.slice(i + 1, end), italic: true })
        i = end + 1
        continue
      }
    }
    if (text.startsWith('~~', i)) {
      const end = text.indexOf('~~', i + 2)
      if (end !== -1) {
        spans.push({ text: text.slice(i + 2, end), strikethrough: true })
        i = end + 2
        continue
      }
    }
    const linkMatch = text.slice(i).match(/^\[([^\]]+)\]\(([^)]+)\)/)
    if (linkMatch) {
      spans.push({ text: linkMatch[1]!, link: { href: linkMatch[2]! } })
      i += linkMatch[0].length
      continue
    }
    const codeMatch = text.slice(i).match(/^`([^`]+)`/)
    if (codeMatch) {
      spans.push({ text: codeMatch[1]!, code: true })
      i += codeMatch[0].length
      continue
    }
    const nextSpecial = text.slice(i).search(/[\[*`~]/)
    const end = nextSpecial === -1 ? text.length : i + nextSpecial
    if (end > i) {
      spans.push({ text: text.slice(i, end) })
      i = end
    } else {
      spans.push({ text: text[i]! })
      i++
    }
  }
  return mergeAdjacentSpans(spans.length ? spans : [{ text: '' }])
}

function detectBlockType(line: string): { type: BlockType; rest: string } {
  if (line === '---' || line === '***') return { type: 'divider', rest: '' }
  if (line.startsWith('```')) return { type: 'codeBlock', rest: '' }
  for (const [prefix, type] of Object.entries(HEADING_PREFIX)) {
    if (line.startsWith(prefix)) return { type, rest: line.slice(prefix.length) }
  }
  if (line.startsWith('- ') || line.startsWith('* ')) {
    return { type: 'bulletList', rest: line.slice(2) }
  }
  const num = line.match(/^(\d+)\.\s+(.*)$/)
  if (num) return { type: 'numberedList', rest: num[2]! }
  if (line.startsWith('> ')) return { type: 'quote', rest: line.slice(2) }
  return { type: 'paragraph', rest: line }
}

/** Parse markdown string into a TextBlock (type hint used when line has no block prefix). */
export function markdownToTextBlock(md: string, fallbackType: BlockType = 'paragraph'): TextBlock {
  const trimmed = md.trim()
  if (!trimmed) return { type: fallbackType, content: [{ text: '' }] }

  if (trimmed.startsWith('```') && trimmed.endsWith('```')) {
    const body = trimmed.slice(3, -3).replace(/^\n/, '').replace(/\n$/, '')
    return { type: 'codeBlock', content: [{ text: body }] }
  }

  const firstLine = trimmed.split('\n')[0] ?? ''
  const { type, rest } = detectBlockType(firstLine)
  const body =
    type === 'codeBlock'
      ? trimmed
      : trimmed.includes('\n')
        ? trimmed
            .split('\n')
            .map((line, idx) => {
              if (idx === 0) return rest
              if (type === 'quote' && line.startsWith('> ')) return line.slice(2)
              return line
            })
            .join('\n')
        : rest

  return {
    type: type === 'paragraph' && fallbackType !== 'paragraph' ? fallbackType : type,
    content: parseInlineMarkdown(body),
  }
}

/** Serialize text blocks only (excludes drawing/image). */
export function textBlocksToMarkdown(blocks: TextBlock[]): string[] {
  return blocks.map(textBlockToMarkdown)
}

/** Parse markdown lines back to validated text blocks. */
export function markdownLinesToTextBlocks(lines: string[]): TextBlock[] {
  const blocks = lines.map((line) => markdownToTextBlock(line))
  return validateBlocks(blocks)
}
