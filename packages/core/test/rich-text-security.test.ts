// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import {
  validateBlocks,
  migrateTextProps,
  sanitizeLinkHref,
  sanitizeImageSrc,
} from '../src/rich-text/document.js'
import { blocksToHtml, createBlockElement, createSpanElement } from '../src/rich-text/dom.js'
import {
  validateDocumentBlocks,
  createDocumentBlockElement,
  documentBlocksToDomHtml,
} from '../src/page-document-blocks.js'

function renderedDoc(html: string): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = html
  return root
}

describe('R-01 hostile snapshots are inert', () => {
  it('drops arbitrary color ids from spans', () => {
    const evil = 'red"></span><img src=x onerror=alert(1)>'
    const blocks = validateBlocks([
      { type: 'paragraph', content: [{ text: 'x', color: evil }] },
    ])
    expect(blocks[0]!.content[0]!.color).toBeUndefined()
  })

  it('keeps valid color ids', () => {
    const blocks = validateBlocks([
      { type: 'paragraph', content: [{ text: 'x', color: 'red' }] },
    ])
    expect(blocks[0]!.content[0]!.color).toBe('red')
  })

  it('drops arbitrary font ids and clamps font size', () => {
    const blocks = validateBlocks([
      {
        type: 'paragraph',
        content: [
          { text: 'a', font: 'sans"></span><svg onload=alert(1)>', bold: true },
          { text: 'b', fontSize: 1000000, italic: true },
          { text: 'c', fontSize: -5, underline: true },
          { text: 'd', fontSize: NaN, code: true },
          { text: 'e', fontSize: 'large', strikethrough: true },
        ],
      },
    ])
    const content = blocks[0]!.content
    // Distinct inline flags prevent mergeAdjacentSpans from collapsing them.
    expect(content.find((s) => s.text === 'a')!.font).toBeUndefined()
    expect(content.find((s) => s.text === 'b')!.fontSize).toBeUndefined()
    expect(content.find((s) => s.text === 'c')!.fontSize).toBeUndefined()
    expect(content.find((s) => s.text === 'd')!.fontSize).toBeUndefined()
    expect(content.find((s) => s.text === 'e')!.fontSize).toBeUndefined()
  })

  it('allows sane font sizes', () => {
    const blocks = validateBlocks([
      { type: 'paragraph', content: [{ text: 'x', fontSize: 24, font: 'mono' }] },
    ])
    expect(blocks[0]!.content[0]!.fontSize).toBe(24)
    expect(blocks[0]!.content[0]!.font).toBe('mono')
  })

  it('drops scriptable link hrefs but keeps safe schemes', () => {
    expect(sanitizeLinkHref('javascript:alert(1)')).toBeNull()
    expect(sanitizeLinkHref('JaVaScRiPt:alert(1)')).toBeNull()
    expect(sanitizeLinkHref('data:text/html,<svg onload=alert(1)>')).toBeNull()
    expect(sanitizeLinkHref('vbscript:msgbox(1)')).toBeNull()
    expect(sanitizeLinkHref('file:///etc/passwd')).toBeNull()
    expect(sanitizeLinkHref('https://example.com')).toBe('https://example.com')
    expect(sanitizeLinkHref('http://example.com/a?b=c')).toBe('http://example.com/a?b=c')
    expect(sanitizeLinkHref('mailto:a@b.com')).toBe('mailto:a@b.com')
    expect(sanitizeLinkHref('tel:+123')).toBe('tel:+123')
  })

  it('drops hostile links during validation', () => {
    const blocks = validateBlocks([
      {
        type: 'paragraph',
        content: [
          { text: 'click', link: { href: 'javascript:alert(1)', title: '"><svg onload=alert(1)>' } },
        ],
      },
    ])
    expect(blocks[0]!.content[0]!.link).toBeUndefined()
  })

  it('blocksToHtml cannot create nodes from color/font/link/title', () => {
    const evilColor = 'x)"></span><img src=x onerror=alert(1)><span style="color:'
    const blocks = [
      {
        type: 'paragraph' as const,
        // Bypass validation to prove the renderer itself is safe.
        content: [
          {
            text: 'hello',
            color: evilColor as never,
            font: 'sans"><svg onload=alert(1)' as never,
            fontSize: 20,
            link: { href: 'https://example.com', title: '"><img src=x onerror=alert(2)>' },
          },
        ],
      },
    ]
    const html = blocksToHtml(blocks)
    const root = renderedDoc(html)
    expect(root.querySelector('img')).toBeNull()
    expect(root.querySelector('svg')).toBeNull()
    expect(root.querySelectorAll('[onerror]').length).toBe(0)
    expect(root.querySelectorAll('[onload]').length).toBe(0)
    const link = root.querySelector('a')
    expect(link?.getAttribute('href')).toBe('https://example.com')
    expect(link?.getAttribute('rel')).toContain('noopener')
    // Title is preserved as text, not markup.
    expect(link?.getAttribute('title')).toContain('"><img')
    expect(root.querySelectorAll('img').length).toBe(0)
    expect(root.textContent).toContain('hello')
  })

  it('blocksToHtml drops javascript: links even without validation', () => {
    const html = blocksToHtml([
      {
        type: 'paragraph' as const,
        content: [{ text: 'x', link: { href: 'javascript:alert(1)' as never } }],
      },
    ])
    const root = renderedDoc(html)
    expect(root.querySelector('a')).toBeNull()
    expect(html).not.toContain('javascript:')
  })

  it('createSpanElement assigns text via textContent, not HTML', () => {
    const el = createSpanElement({
      text: '<img src=x onerror=alert(1)>',
      bold: true,
      color: 'red',
    })
    expect(el.textContent).toContain('<img src=x onerror=alert(1)>')
    expect((el as HTMLElement).querySelector?.('img') ?? null).toBeNull()
  })

  it('createBlockElement never interpolates model strings into markup', () => {
    const el = createBlockElement({
      type: 'paragraph',
      content: [{ text: 'hi', color: 'red"></div><script>alert(1)</script>' as never }],
    })
    expect(el.querySelector('script')).toBeNull()
    expect(el.innerHTML).not.toContain('<script>')
  })

  it('rejects hostile image sources and clamps dimensions', () => {
    expect(sanitizeImageSrc('javascript:alert(1)')).toBeNull()
    expect(sanitizeImageSrc('data:text/html,<svg onload=alert(1)>')).toBeNull()
    expect(sanitizeImageSrc('data:application/octet-stream;base64,xx')).toBeNull()
    expect(sanitizeImageSrc('data:image/png;base64,abc')).toContain('data:image/png')
    expect(sanitizeImageSrc('https://example.com/a.png')).toContain('https://')
    expect(sanitizeImageSrc('blob:https://example.com/uuid')).toContain('blob:')

    const blocks = validateDocumentBlocks([
      { type: 'image', src: 'javascript:alert(1)', alt: '"><svg onload=alert(1)>', width: -10, height: 1e9 },
    ])
    // Hostile image is dropped; fallback paragraph remains.
    expect(blocks.some((b) => b.type === 'image')).toBe(false)
  })

  it('image DOM builder escapes alt and drops hostile src', () => {
    const el = createDocumentBlockElement(
      { type: 'image', src: 'javascript:alert(1)', alt: '"><img src=x onerror=alert(1)>', width: -5, height: 1e9 },
      0,
    )
    expect(el.querySelector('img')).toBeNull()
    const ok = createDocumentBlockElement(
      { type: 'image', src: 'https://example.com/a.png', alt: '"><b>hi</b>', width: 100, height: 50 },
      1,
    )
    expect(ok.querySelector('img')?.getAttribute('src')).toBe('https://example.com/a.png')
    expect(ok.querySelector('img')?.getAttribute('alt')).toBe('"><b>hi</b>')
    expect(ok.querySelectorAll('b').length).toBe(0)
  })

  it('documentBlocksToDomHtml output is inert for hostile snapshots', () => {
    const raw = [
      { type: 'paragraph', content: [{ text: 'x', color: 'red"></span><img src=x onerror=alert(1)>' }] },
      { type: 'image', src: 'javascript:alert(1)' },
      { type: 'paragraph', content: [{ text: 'y', link: { href: 'javascript:alert(1)' } }] },
    ]
    const validated = validateDocumentBlocks(raw)
    const html = documentBlocksToDomHtml(validated)
    const root = renderedDoc(html)
    expect(root.querySelector('img')).toBeNull()
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('onerror')
  })

  it('drawing strokes fall back to safe color/size', () => {
    const blocks = validateDocumentBlocks([
      {
        type: 'drawing',
        height: 140,
        strokes: [
          { pts: [0, 0, 0.5, 10, 10, 0.5], color: 'evil"><svg', size: 'huge', kind: 'draw' },
        ],
      },
    ])
    const drawing = blocks.find((b) => b.type === 'drawing')
    expect(drawing?.type).toBe('drawing')
    if (drawing?.type === 'drawing') {
      expect(drawing.strokes[0]!.color).toBe('black')
      expect(drawing.strokes[0]!.size).toBe('m')
    }
  })

  it('migrateTextProps defaults hostile shape color/size/font', () => {
    const migrated = migrateTextProps({
      blocks: [{ type: 'paragraph', content: [{ text: 'hi' }] }],
      color: 'evil"></span>',
      size: 'xxl',
      font: '<script>',
    })
    expect(migrated.color).toBe('black')
    expect(migrated.size).toBe('m')
    expect(migrated.font).toBe('sans')
  })
})
