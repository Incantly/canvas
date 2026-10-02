import { getSchema } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import {
  findDocumentNodeIdRepairs,
  incantlyDocumentExtensions,
} from '../src/document/index.js'

const NODE_NAMES = [
  'doc', 'text', 'paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList',
  'listItem', 'checklist', 'checklistItem', 'horizontalRule', 'codeBlock', 'mathBlock',
  'table', 'tableRow', 'tableHeaderCell', 'tableCell', 'image', 'fileAttachment',
  'audio', 'videoEmbed', 'pdfEmbed', 'canvasEmbed', 'pageBreak', 'hardBreak',
]

const MARK_NAMES = [
  'bold', 'italic', 'underline', 'strike', 'code', 'link', 'textColor', 'highlight',
  'citation', 'inlineMath',
]

describe('Incantly Tiptap v1 schema', () => {
  const schema = getSchema(incantlyDocumentExtensions)

  it('registers every canonical node and mark intentionally', () => {
    for (const name of NODE_NAMES) expect(schema.nodes[name], `node ${name}`).toBeDefined()
    for (const name of MARK_NAMES) expect(schema.marks[name], `mark ${name}`).toBeDefined()
  })

  it('mirrors canonical list, checklist, table, and code nesting rules', () => {
    expect(schema.nodes.bulletList.contentMatch.matchType(schema.nodes.listItem)).not.toBeNull()
    expect(schema.nodes.bulletList.contentMatch.matchType(schema.nodes.checklistItem)).toBeNull()
    expect(schema.nodes.checklist.contentMatch.matchType(schema.nodes.checklistItem)).not.toBeNull()
    expect(schema.nodes.table.contentMatch.matchType(schema.nodes.tableRow)).not.toBeNull()
    expect(schema.nodes.tableRow.contentMatch.matchType(schema.nodes.tableCell)).not.toBeNull()
    expect(schema.nodes.tableRow.contentMatch.matchType(schema.nodes.paragraph)).toBeNull()
    expect(schema.nodes.codeBlock.spec.marks).toBe('')
  })

  it('defines the complete attribute contract for rich and embedded nodes', () => {
    expect(Object.keys(schema.nodes.heading.attrs)).toEqual(expect.arrayContaining(['id', 'level', 'alignment']))
    expect(Object.keys(schema.nodes.tableCell.attrs)).toEqual(expect.arrayContaining(['id', 'colspan', 'rowspan', 'alignment']))
    expect(Object.keys(schema.nodes.image.attrs)).toEqual(expect.arrayContaining(['id', 'assetId', 'alt', 'caption', 'width', 'height', 'display']))
    expect(Object.keys(schema.nodes.pdfEmbed.attrs)).toEqual(expect.arrayContaining(['id', 'assetId', 'page', 'display', 'extractedDocumentId']))
  })

  it('repairs missing and duplicate IDs while retaining the first stable ID', () => {
    const doc = schema.nodeFromJSON({
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { id: 'node:stable' } },
        { type: 'paragraph', attrs: { id: 'node:stable' } },
        { type: 'heading', attrs: { id: null, level: 2 } },
      ],
    })
    const repairs = findDocumentNodeIdRepairs(doc)

    expect(repairs).toHaveLength(2)
    expect(new Set(repairs.map((repair) => repair.id)).size).toBe(2)
    expect(repairs.every((repair) => repair.id.startsWith('node:'))).toBe(true)
  })
})
