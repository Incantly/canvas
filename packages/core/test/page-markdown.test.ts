import { describe, expect, it } from 'vitest'
import {
  applyInlineMarkToPageRange,
  markdownToPageTextBlocks,
  mergeMarkdownIntoPageDocument,
  pageTextBlocksToMarkdown,
  pageTextBlocksToPlainLines,
} from '../src/rich-text/page-markdown.js'
import type { DocumentBlock } from '../src/rich-text/types.js'

describe('page markdown sync', () => {
  it('round-trips multi-paragraph marks', () => {
    const md = '**Hello**\n\nsecond *line*'
    const blocks = markdownToPageTextBlocks(md)
    expect(blocks).toHaveLength(2)
    expect(blocks[0]?.content[0]?.bold).toBe(true)
    expect(blocks[0]?.content[0]?.text).toBe('Hello')
    expect(blocks[1]?.content.some((s) => s.italic && s.text === 'line')).toBe(true)
    expect(pageTextBlocksToMarkdown(blocks)).toContain('**Hello**')
  })

  it('empty markdown yields one empty paragraph', () => {
    const blocks = markdownToPageTextBlocks('   ')
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.content[0]?.text).toBe('')
  })

  it('preserves trailing drawing on merge', () => {
    const existing: DocumentBlock[] = [
      { type: 'paragraph', content: [{ text: 'old' }] },
      { type: 'drawing', height: 80, strokes: [] },
    ]
    const next = mergeMarkdownIntoPageDocument(existing, 'fresh **ink**')
    expect(next.filter((b) => b.type === 'drawing')).toHaveLength(1)
    const text = next.find((b) => b.type === 'paragraph')
    expect(text && 'content' in text ? text.content[0]?.text : '').toBe('fresh ')
  })

  it('applies bold to a selection spanning two lines', () => {
    const blocks: DocumentBlock[] = [
      { type: 'paragraph', content: [{ text: 'Hello' }] },
      { type: 'paragraph', content: [{ text: 'World' }] },
    ]
    expect(pageTextBlocksToPlainLines(blocks)).toBe('Hello\nWorld')
    const next = applyInlineMarkToPageRange(blocks, 3, 8, 'bold')
    const texts = next.filter((b) => b.type !== 'drawing' && b.type !== 'image')
    expect(texts[0] && 'content' in texts[0] ? texts[0].content : []).toEqual([
      { text: 'Hel' },
      { text: 'lo', bold: true },
    ])
    expect(texts[1] && 'content' in texts[1] ? texts[1].content : []).toEqual([
      { text: 'Wo', bold: true },
      { text: 'rld' },
    ])
  })
})
