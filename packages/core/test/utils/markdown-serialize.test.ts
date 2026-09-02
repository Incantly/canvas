import { describe, expect, it } from 'vitest'
import { textBlockToMarkdown, markdownToTextBlock } from '../../src/rich-text/markdown-serialize.js'

describe('markdown-serialize', () => {
  it('serializes bold paragraph', () => {
    const md = textBlockToMarkdown({
      type: 'paragraph',
      content: [{ text: 'hello', bold: true }],
    })
    expect(md).toBe('**hello**')
  })

  it('serializes heading', () => {
    const md = textBlockToMarkdown({
      type: 'heading1',
      content: [{ text: 'Title' }],
    })
    expect(md).toBe('# Title')
  })

  it('round-trips bold text', () => {
    const block = markdownToTextBlock('**hello**', 'paragraph')
    expect(block.type).toBe('paragraph')
    expect(block.content[0]?.bold).toBe(true)
    expect(block.content[0]?.text).toBe('hello')
  })

  it('round-trips heading', () => {
    const block = markdownToTextBlock('# Title', 'paragraph')
    expect(block.type).toBe('heading1')
    expect(block.content[0]?.text).toBe('Title')
  })

  it('serializes bullet list', () => {
    const md = textBlockToMarkdown({
      type: 'bulletList',
      content: [{ text: 'item' }],
    })
    expect(md).toBe('- item')
  })
})
