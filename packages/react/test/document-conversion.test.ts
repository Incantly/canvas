import { readFileSync } from 'node:fs'
import { getSchema, type JSONContent } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import type { IncantlyDocument } from '@incantly/canvas/document'
import {
  incantlyDocumentExtensions,
  incantlyDocumentToProseMirror,
  proseMirrorToIncantlyDocument,
} from '../src/document/index.js'

const fixture = (name: string): IncantlyDocument => JSON.parse(readFileSync(
  new URL(`../../core/test/fixtures/documents/${name}`, import.meta.url),
  'utf8',
)) as IncantlyDocument

const FIXTURES = ['v1-all-nodes.json', 'v1-all-marks.json', 'v1-nested.json']

const semanticDocument = (document: IncantlyDocument): unknown => {
  const clone = structuredClone(document) as IncantlyDocument
  const visit = (nodes: IncantlyDocument['content']) => {
    for (const node of nodes) {
      if ((node.type === 'orderedList' && node.attrs?.start === 1)) delete node.attrs
      if (node.type === 'tableCell' || node.type === 'tableHeaderCell') {
        if (node.attrs?.colspan === 1) delete node.attrs.colspan
        if (node.attrs?.rowspan === 1) delete node.attrs.rowspan
        if (node.attrs && !Object.keys(node.attrs).length) delete node.attrs
      }
      if ('attrs' in node && node.attrs && !Object.keys(node.attrs).length) delete node.attrs
      if ('content' in node && Array.isArray(node.content) && node.type !== 'paragraph' && node.type !== 'heading')
        visit(node.content as IncantlyDocument['content'])
    }
  }
  visit(clone.content)
  return clone
}

const collectIds = (document: IncantlyDocument): string[] => {
  const ids: string[] = []
  const visit = (nodes: IncantlyDocument['content']) => {
    for (const node of nodes) {
      ids.push(node.id)
      if ('content' in node && Array.isArray(node.content) && node.type !== 'paragraph' && node.type !== 'heading')
        visit(node.content as IncantlyDocument['content'])
    }
  }
  visit(document.content)
  return ids
}

describe('Incantly and ProseMirror conversion', () => {
  const schema = getSchema(incantlyDocumentExtensions)

  it.each(FIXTURES)('round-trips Incantly fixture %s with semantic equality', (name) => {
    const original = fixture(name)
    const encoded = incantlyDocumentToProseMirror(original)
    const schemaDocument = schema.nodeFromJSON(encoded.value)
    const decoded = proseMirrorToIncantlyDocument(schemaDocument.toJSON())

    expect(encoded.report.issues).toEqual([])
    expect(decoded.report.issues).toEqual([])
    expect(semanticDocument(decoded.value)).toEqual(semanticDocument(original))
    expect(collectIds(decoded.value)).toEqual(collectIds(original))
  })

  it.each(FIXTURES)('round-trips ProseMirror generated from %s', (name) => {
    const first = incantlyDocumentToProseMirror(fixture(name)).value
    const canonical = proseMirrorToIncantlyDocument(first)
    const second = incantlyDocumentToProseMirror(canonical.value).value

    expect(schema.nodeFromJSON(second).toJSON()).toEqual(schema.nodeFromJSON(first).toJSON())
  })

  it('reports unsupported content and never copies raw HTML into the canonical model', () => {
    const input: JSONContent = {
      type: 'doc',
      content: [
        { type: 'rawHtml', attrs: { html: '<script>alert(1)</script>' } },
        { type: 'paragraph', attrs: { id: 'node:safe' }, content: [{ type: 'text', text: 'Safe', marks: [{ type: 'mystery', attrs: { html: '<b>bad</b>' } }] }] },
      ],
    }
    const converted = proseMirrorToIncantlyDocument(input)
    const serialized = JSON.stringify(converted.value)

    expect(converted.report.unsupported).toBe(true)
    expect(converted.report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'unsupported_node', path: '$.content[0]' }),
      expect.objectContaining({ code: 'unsupported_mark', path: '$.content[1].content[0].marks[0]' }),
    ]))
    expect(serialized).not.toContain('<script>')
    expect(serialized).not.toContain('<b>')
    expect(converted.value.content).toEqual([expect.objectContaining({ id: 'node:safe', type: 'paragraph' })])
  })

  it('reports and repairs missing or duplicate node IDs', () => {
    const converted = proseMirrorToIncantlyDocument({
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { id: 'node:duplicate' } },
        { type: 'paragraph', attrs: { id: 'node:duplicate' } },
        { type: 'heading', attrs: { level: 2 } },
      ],
    })
    const ids = collectIds(converted.value)

    expect(converted.report.repaired).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids[0]).toBe('node:duplicate')
  })
})
