import { describe, expect, it } from 'vitest'
import {
  contrastDocumentText,
  defaultDocumentBackground,
  defaultDocumentPaperColor,
  normalizeCssColor,
  parseCssColorRgb,
} from '../src/document-background.js'

describe('document-background', () => {
  it('defaultDocumentBackground follows theme', () => {
    expect(defaultDocumentBackground('light')).toBe('#e8e4dc')
    expect(defaultDocumentBackground('dark')).toBe('#191713')
  })

  it('defaultDocumentPaperColor follows theme', () => {
    expect(defaultDocumentPaperColor('light')).toBe('#ffffff')
    expect(defaultDocumentPaperColor('dark')).toBe('#252219')
  })

  it('normalizeCssColor accepts hex and rgb', () => {
    expect(normalizeCssColor('#ff00aa')).toBe('#ff00aa')
    expect(normalizeCssColor('rgb(12, 34, 56)')).toBe('rgb(12, 34, 56)')
    expect(normalizeCssColor('not-a-color')).toBeNull()
  })

  it('contrastDocumentText picks readable ink', () => {
    expect(contrastDocumentText('#ffffff')).toBe('#1d1d1d')
    expect(contrastDocumentText('#111111')).toBe('rgba(255, 255, 255, 0.88)')
  })

  it('parseCssColorRgb parses hex', () => {
    expect(parseCssColorRgb('#ff8040')).toEqual({ r: 255, g: 128, b: 64 })
  })
})
