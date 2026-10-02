import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CURRENT_DOCUMENT_SCHEMA_VERSION,
  DOCUMENT_MIGRATIONS,
  DOCUMENT_SCHEMA_BOUNDARIES,
  DocumentSerializationError,
  detectDocumentSchemaVersion,
  migrateDocumentToCurrent,
  parseIncantlyDocument,
  serializeIncantlyDocument,
  validateDocument,
  type DocumentNode,
  type IncantlyDocument,
  type LegacyCanvasPageDocumentAdapter,
} from '../src/document/index.js'

const fixtureNames = ['v1-all-marks.json', 'v1-all-nodes.json', 'v1-nested.json'] as const
const loadFixture = (name: typeof fixtureNames[number]): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/documents/${name}`, import.meta.url), 'utf8')) as unknown

describe('document golden fixtures', () => {
  it.each(fixtureNames)('strictly validates and parses %s in Node', (name) => {
    const fixture = loadFixture(name)
    const validation = validateDocument(fixture)
    const parsed = parseIncantlyDocument(fixture)

    expect(validation.issues).toEqual([])
    expect(parsed.ok).toBe(true)
    expect(parsed.document).toEqual(fixture)
  })

  it('covers every v1 block node and inline mark', () => {
    const nodeFixture = loadFixture('v1-all-nodes.json') as IncantlyDocument
    const markFixture = loadFixture('v1-all-marks.json') as IncantlyDocument
    const nodeTypes = new Set<string>()
    const visit = (nodes: readonly DocumentNode[]): void => {
      for (const node of nodes) {
        nodeTypes.add(node.type)
        if ('content' in node && Array.isArray(node.content) && !['paragraph', 'heading'].includes(node.type))
          visit(node.content as DocumentNode[])
      }
    }
    visit(nodeFixture.content)
    const marks = new Set(
      (markFixture.content[0] as Extract<DocumentNode, { type: 'paragraph' }>).content
        .flatMap((node) => node.type === 'text' ? (node.marks ?? []).map((mark) => mark.type) : []),
    )

    expect([...nodeTypes].sort()).toEqual([
      'audio', 'blockquote', 'bulletList', 'canvasEmbed', 'checklist', 'checklistItem',
      'codeBlock', 'fileAttachment', 'heading', 'horizontalRule', 'image', 'listItem',
      'mathBlock', 'orderedList', 'pageBreak', 'paragraph', 'pdfEmbed', 'table',
      'tableCell', 'tableHeaderCell', 'tableRow', 'videoEmbed',
    ].sort())
    expect([...marks].sort()).toEqual([
      'bold', 'citation', 'code', 'highlight', 'inlineMath', 'italic', 'link',
      'strike', 'textColor', 'underline',
    ].sort())
  })
})

describe('deterministic document serialization', () => {
  it('is stable across parse, normalize, and repeated serialization', () => {
    const source = loadFixture('v1-all-nodes.json') as IncantlyDocument
    const first = serializeIncantlyDocument(source)
    const parsed = parseIncantlyDocument(first)
    const second = serializeIncantlyDocument(parsed.document as IncantlyDocument)

    expect(second).toBe(first)
    expect(Object.keys(JSON.parse(first) as Record<string, unknown>)).toEqual([
      'content', 'createdAt', 'id', 'metadata', 'schemaVersion', 'type', 'updatedAt',
    ])
    expect(serializeIncantlyDocument(source, { space: 2 })).toContain('\n  "content"')
  })

  it('rejects functions, class instances, binary bodies, cycles, and invalid documents', () => {
    const source = loadFixture('v1-all-marks.json') as IncantlyDocument
    const withFunction = { ...source, runtime: () => undefined } as IncantlyDocument
    const withBinary = { ...source, assetBody: new Uint8Array([1, 2, 3]) } as IncantlyDocument
    class EditorInstance { state = 'runtime' }
    const withEditor = { ...source, editor: new EditorInstance() } as IncantlyDocument
    const cyclic = { ...source } as IncantlyDocument & { self?: unknown }
    cyclic.self = cyclic
    const invalid = { ...source, type: 'canvas' } as unknown as IncantlyDocument

    for (const value of [withFunction, withBinary, withEditor, cyclic]) {
      expect(() => serializeIncantlyDocument(value)).toThrow(DocumentSerializationError)
    }
    expect(() => serializeIncantlyDocument(invalid)).toThrowError(expect.objectContaining({
      code: 'invalid_document',
    }))
  })
})

describe('document schema detection and migrations', () => {
  it('registers the explicit v1 boundary and runs current JSON through the pipeline', () => {
    const fixture = loadFixture('v1-nested.json')
    const result = migrateDocumentToCurrent(fixture)

    expect(detectDocumentSchemaVersion(fixture)).toBe(CURRENT_DOCUMENT_SCHEMA_VERSION)
    expect(DOCUMENT_SCHEMA_BOUNDARIES.map((boundary) => boundary.version)).toEqual([1])
    expect(DOCUMENT_MIGRATIONS).toEqual([])
    expect(result).toMatchObject({
      fromVersion: 1,
      toVersion: 1,
      appliedVersions: [],
      document: fixture,
      issues: [],
    })
  })

  it('rejects missing and future versions instead of migrating backward', () => {
    const fixture = loadFixture('v1-all-marks.json') as Record<string, unknown>
    const { schemaVersion: _removed, ...withoutVersion } = fixture
    const future = { ...fixture, schemaVersion: CURRENT_DOCUMENT_SCHEMA_VERSION + 1 }

    expect(parseIncantlyDocument(withoutVersion)).toMatchObject({ ok: false, fromVersion: 0 })
    expect(parseIncantlyDocument(future)).toMatchObject({ ok: false, fromVersion: 2, toVersion: 1 })
    expect(parseIncantlyDocument('{bad json')).toMatchObject({ ok: false, fromVersion: 0 })
  })

  it('supports explicit recovery while strict parsing remains the default', () => {
    const fixture = loadFixture('v1-all-marks.json') as IncantlyDocument
    const malformed = { ...fixture, content: [{ id: 'node:unknown', type: 'futureWidget', text: 'Preserved' }] }

    expect(parseIncantlyDocument(malformed).ok).toBe(false)
    const recovered = parseIncantlyDocument(malformed, { recover: true })
    expect(recovered.ok).toBe(true)
    expect(recovered.document?.content[0]).toMatchObject({ type: 'paragraph' })
  })

  it('defines a non-destructive legacy canvas adapter boundary without an implementation', () => {
    const adapter: LegacyCanvasPageDocumentAdapter = {
      id: 'test-only',
      canAdapt: () => false,
      adapt: (value) => value,
    }
    expect(adapter.id).toBe('test-only')
  })
})
