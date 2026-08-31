// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import {
  textToBlocks,
  blocksToPlainText,
  isEmptyDocument,
  validateBlocks,
  migrateTextProps,
  emptyDocument,
} from '../src/rich-text/document.js'
import { applyLineMarkdown, applyInlineMarkdown } from '../src/rich-text/markdown.js'
import { layoutRichText } from '../src/rich-text/layout.js'
import { themeOf } from '../src/palette.js'

describe('rich text document', () => {
  it('migrates legacy text string to blocks', () => {
    const migrated = migrateTextProps({ text: 'Hello\nWorld', color: 'blue', size: 'm', font: 'sans' })
    expect(migrated.blocks).toHaveLength(2)
    expect(blocksToPlainText(migrated.blocks)).toBe('Hello\nWorld')
    expect((migrated as { text?: string }).text).toBeUndefined()
  })

  it('validates corrupt blocks safely', () => {
    expect(validateBlocks(null)).toEqual(emptyDocument())
    expect(validateBlocks([{ type: 'nope', content: [{ text: 'x' }] }])).toEqual(emptyDocument())
    expect(validateBlocks([{ type: 'paragraph', content: [{ text: 'ok' }] }])).toHaveLength(1)
  })

  it('detects empty documents', () => {
    expect(isEmptyDocument(emptyDocument())).toBe(true)
    expect(isEmptyDocument(textToBlocks('  \n  '))).toBe(true)
    expect(isEmptyDocument(textToBlocks('hi'))).toBe(false)
  })
})

describe('rich text markdown', () => {
  it('applies line-start heading markdown', () => {
    expect(applyLineMarkdown('#')?.type).toBe('heading1')
    expect(applyLineMarkdown('##')?.type).toBe('heading2')
    expect(applyLineMarkdown('-')?.type).toBe('bulletList')
  })

  it('applies inline bold markdown', () => {
    const spans = applyInlineMarkdown('hello **world** ')
    expect(spans).not.toBeNull()
    expect(spans!.some((s) => s.bold && s.text === 'world')).toBe(true)
  })
})

describe('rich text layout', () => {
  it('measures wrapped text width', () => {
    const theme = themeOf('light')
    const layout = layoutRichText({
      blocks: [
        {
          type: 'paragraph',
          content: [{ text: 'Hello rich text', bold: true }],
        },
      ],
      maxW: 0,
      defaultFont: 'sans',
      baseFontSize: 26,
      defaultColor: 'black',
      theme,
      align: 'left',
    })
    expect(layout.w).toBeGreaterThan(8)
    expect(layout.h).toBeGreaterThan(20)
    expect(layout.runs.length).toBeGreaterThan(0)
  })

  it('lays out heading blocks larger than paragraph', () => {
    const theme = themeOf('light')
    const para = layoutRichText({
      blocks: [{ type: 'paragraph', content: [{ text: 'Title' }] }],
      maxW: 0,
      defaultFont: 'sans',
      baseFontSize: 20,
      defaultColor: 'black',
      theme,
    })
    const h1 = layoutRichText({
      blocks: [{ type: 'heading1', content: [{ text: 'Title' }] }],
      maxW: 0,
      defaultFont: 'sans',
      baseFontSize: 20,
      defaultColor: 'black',
      theme,
    })
    expect(h1.runs[0].fontSize).toBeGreaterThan(para.runs[0].fontSize)
  })
})
