import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { Store } from '../src/store.js'
import { NOTEBOOK_ID } from '../src/pages.js'
import { CURRENT_SCHEMA } from '../src/types/schema.js'
import type { Snapshot } from '../src/types/operations.js'
import type { NoteShapeRecord } from '../src/types/models.js'
import { migrateSnapshot, getMigrationsSince } from '../src/migrations/index.js'
import { allMigrations } from '../src/migrations/sequences.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadFixture(name: string): Snapshot {
  const raw = readFileSync(join(__dirname, 'fixtures', name), 'utf8')
  return JSON.parse(raw) as Snapshot
}

function storeJson(snap: Snapshot): string {
  return JSON.stringify(snap.document.store)
}

function firstPageBlocks(store: Record<string, any>): any[] {
  const pages = Object.values(store)
    .filter((r): r is any => !!r && r.typeName === 'page')
    .sort((a, b) => a.index - b.index || (a.id < b.id ? -1 : 1))
  return pages[0]?.document?.blocks ?? []
}

describe('migrateSnapshot', () => {
  describe('pre-schema loading', () => {
    it('migrates pre-schema snapshot through full migration chain', () => {
      const input = loadFixture('v0-pre-schema.json')
      const result = migrateSnapshot(input)

      expect(result.schema).toEqual(CURRENT_SCHEMA)
      expect(result.document.store[NOTEBOOK_ID]).toBeDefined()
      expect((result.document.store[NOTEBOOK_ID] as any).typeName).toBe('notebook')
    })

    it('stamps CURRENT_SCHEMA after migrateSnapshot', () => {
      const result = migrateSnapshot(loadFixture('v0-pre-schema.json'))
      expect(result.schema).toEqual(CURRENT_SCHEMA)
    })

    it('preserves legacy props.text as props.blocks on note shapes', () => {
      const result = migrateSnapshot(loadFixture('v0-pre-schema.json'))
      const note = result.document.store.n1 as NoteShapeRecord | undefined
      expect(note).toBeDefined()
      expect(note!.type).toBe('note')
      expect(note!.props.blocks).toBeDefined()
      expect(note!.props.blocks.some((b) => b.content?.[0]?.text === 'Hello legacy')).toBe(true)
      expect((note!.props as any).text).toBeUndefined()
    })
  })

  describe('partial schema', () => {
    it('runs only migrations needed for sequences behind CURRENT_SCHEMA', () => {
      const partial = loadFixture('v1-with-schema-partial.json')
      const steps = getMigrationsSince(partial.schema, CURRENT_SCHEMA)

      expect(steps.some((s) => s.sequenceId === 'com.incantly.store')).toBe(false)
      expect(steps.some((s) => s.sequenceId === 'com.incantly.shape.text')).toBe(false)
      expect(steps.filter((s) => s.sequenceId === 'com.incantly.page.document').map((s) => s.version)).toEqual([
        1, 2, 3,
      ])
      expect(steps.filter((s) => s.sequenceId === 'com.incantly.notebook.document').map((s) => s.version)).toEqual([
        1, 2, 3, 4,
      ])
    })

    it('applies only pending notebook.document migrations from partial schema fixture', () => {
      const input = loadFixture('v1-with-schema-partial.json')
      const beforeStore = storeJson(input)
      const result = migrateSnapshot(input)

      expect(result.schema).toEqual(CURRENT_SCHEMA)
      const pages = Object.values(result.document.store).filter((r: any) => r?.typeName === 'page') as any[]
      pages.sort((a, b) => a.index - b.index)
      expect(pages[0]?.document?.blocks?.length).toBeGreaterThan(0)
      expect((result.document.store[NOTEBOOK_ID] as any)?.document).toBeUndefined()
      expect(result.document.store.t1).toBeUndefined()
      expect(JSON.parse(beforeStore).t1).toBeDefined()
    })
  })

  describe('idempotency', () => {
    it('produces identical store JSON when run twice', () => {
      const input = loadFixture('v0-legacy-text-only.json')
      const once = migrateSnapshot(input)
      const twice = migrateSnapshot(once)
      expect(storeJson(twice)).toBe(storeJson(once))
    })

    it('is a no-op on an already-current snapshot', () => {
      const current = migrateSnapshot(loadFixture('v0-pre-schema.json'))
      const again = migrateSnapshot(current)
      expect(storeJson(again)).toBe(storeJson(current))
      expect(again.schema).toEqual(CURRENT_SCHEMA)
    })

    it('double migrateSnapshot on same input is stable across three passes', () => {
      const input = loadFixture('v0-pre-schema.json')
      const first = migrateSnapshot(input)
      const second = migrateSnapshot(first)
      const third = migrateSnapshot(second)
      expect(storeJson(second)).toBe(storeJson(first))
      expect(storeJson(third)).toBe(storeJson(first))
      expect(third.schema).toEqual(CURRENT_SCHEMA)
    })
  })

  describe('deep clone safety', () => {
    it('does not mutate the input snapshot object', () => {
      const input = loadFixture('v0-pre-schema.json')
      const storeRef = input.document.store
      const before = structuredClone(input)

      migrateSnapshot(input)

      expect(input.document.store).toBe(storeRef)
      expect(input).toEqual(before)
      expect(input.schema).toBeUndefined()
    })
  })

  describe('ImageBlock v3', () => {
    it('preserves ImageBlock with valid src', () => {
      const result = migrateSnapshot(loadFixture('v2-with-image-block.json'))
      const images = firstPageBlocks(result.document.store).filter((b: any) => b.type === 'image')
      expect(images).toHaveLength(1)
      expect(images[0].src).toBe('data:image/png;base64,iVBORw0KGgo=')
      expect(images[0].alt).toBe('Valid photo')
      expect(images[0].width).toBe(400)
      expect(images[0].height).toBe(300)
    })

    it('strips ImageBlock with empty or missing src in v3 migration', () => {
      const result = migrateSnapshot(loadFixture('v2-with-image-block.json'))
      const blocks = firstPageBlocks(result.document.store)
      expect(blocks.every((b: any) => b.type !== 'image' || b.src.trim().length > 0)).toBe(true)
      expect(blocks.filter((b: any) => b.type === 'image')).toHaveLength(1)
    })

    it('v3 migration is idempotent when run twice', () => {
      const once = migrateSnapshot(loadFixture('v2-with-image-block.json'))
      const twice = migrateSnapshot(once)
      expect(storeJson(twice)).toBe(storeJson(once))
    })
  })

  describe('migration order', () => {
    it('runs store migration before notebook.document so notebook exists', () => {
      const input: Snapshot = {
        document: {
          store: {
            p1: {
              id: 'p1',
              typeName: 'page',
              index: 0,
              x: 0,
              y: 0,
              width: 816,
              height: 1056,
              name: 'Lonely page',
              document: { blocks: [{ type: 'paragraph', content: [{ text: 'Body' }] }] },
            },
          },
        },
      }
      expect(input.document.store[NOTEBOOK_ID]).toBeUndefined()

      const result = migrateSnapshot(input)
      expect(result.document.store[NOTEBOOK_ID]).toBeDefined()
      expect((result.document.store[NOTEBOOK_ID] as any).document).toBeUndefined()
      expect(firstPageBlocks(result.document.store).length).toBeGreaterThan(0)
    })

    it('SEQUENCE_ORDER places store before notebook.document in registered steps', () => {
      const storeIdx = allMigrations().findIndex((s) => s.sequenceId === 'com.incantly.store')
      const nbIdx = allMigrations().findIndex((s) => s.sequenceId === 'com.incantly.notebook.document')
      expect(storeIdx).toBeGreaterThanOrEqual(0)
      expect(nbIdx).toBeGreaterThan(storeIdx)
    })
  })

  describe('corrupt data', () => {
    it('handles null document.store gracefully', () => {
      const input = { document: { store: null as any } } as Snapshot
      const result = migrateSnapshot(input)
      expect(result.document.store).toEqual(expect.any(Object))
      expect(result.schema).toEqual(CURRENT_SCHEMA)
    })

    it('handles missing document gracefully', () => {
      const input = {} as Snapshot
      const result = migrateSnapshot(input)
      expect(result.document.store).toEqual(expect.any(Object))
      expect(result.schema).toEqual(CURRENT_SCHEMA)
    })

    it('skips invalid store records without throwing', () => {
      const input = {
        document: {
          store: {
            garbage: 'not-a-record' as any,
            nullish: null as any,
            noId: { typeName: 'shape', type: 'geo' } as any,
            valid: {
              id: 'p1',
              typeName: 'page',
              index: 0,
              x: 0,
              y: 0,
              width: 816,
              height: 1056,
              name: 'Page 1',
            },
          },
        },
      } as Snapshot
      expect(() => migrateSnapshot(input)).not.toThrow()
      const result = migrateSnapshot(input)
      expect(result.document.store.p1).toBeDefined()
      expect(result.schema).toEqual(CURRENT_SCHEMA)
    })

    it('strips invalid drawing strokes via validateDocumentBlocks in notebook v2', () => {
      const input: Snapshot = {
        schema: {
          schemaVersion: 1,
          sequences: {
            'com.incantly.store': 1,
            'com.incantly.shape.text': 1,
            'com.incantly.page.document': 2,
            'com.incantly.notebook.document': 1,
          },
        },
        document: {
          store: {
            [NOTEBOOK_ID]: {
              id: NOTEBOOK_ID,
              typeName: 'notebook',
              pageLayout: 'vertical',
              document: {
                blocks: [
                  { type: 'paragraph', content: [{ text: 'Keep me' }] },
                  {
                    type: 'drawing',
                    height: -1,
                    strokes: [{ pts: [1], color: 'black', size: 'm', kind: 'draw' }],
                  },
                  {
                    type: 'drawing',
                    strokes: [{ pts: [0, 0, 0.5, 10, 20, 0.5], color: 'black', size: 'm', kind: 'draw' }],
                  },
                ],
              },
            },
            p1: {
              id: 'p1',
              typeName: 'page',
              index: 0,
              x: 0,
              y: 0,
              width: 816,
              height: 1056,
            },
          },
        },
      }
      const result = migrateSnapshot(input)
      const blocks = firstPageBlocks(result.document.store)
      expect(blocks.some((b: any) => b.type === 'paragraph' && b.content[0]?.text === 'Keep me')).toBe(true)
      const drawings = blocks.filter((b: any) => b.type === 'drawing')
      expect(drawings.length).toBe(1)
      expect(drawings[0].strokes.length).toBe(1)
      expect(drawings[0].strokes[0].pts.length).toBeGreaterThanOrEqual(3)
      expect(drawings[0].height).toBeGreaterThan(0)
    })
  })

  describe('Store integration', () => {
    it('loadSnapshot(v0 fixture) merges legacy text into notebook.document', () => {
      const s = new Store()
      s.loadSnapshot(loadFixture('v0-legacy-text-only.json'))
      const blocks = s.notebookDocumentBlocks()
      expect(s.get('t1')).toBeUndefined()
      expect(s.get('t2')).toBeUndefined()
      expect(blocks.some((b: any) => b.content?.[0]?.text === 'First line')).toBe(true)
      expect(blocks.some((b: any) => b.content?.[0]?.text === 'Second line')).toBe(true)
    })

    it('getSnapshot includes schema: CURRENT_SCHEMA', () => {
      const s = new Store()
      s.loadSnapshot(loadFixture('v0-pre-schema.json'))
      const snap = s.getSnapshot()
      expect(snap.schema).toEqual(CURRENT_SCHEMA)
    })

    it('loadSnapshot still migrates legacy text props to notebook document', () => {
      const s = new Store()
      s.loadSnapshot({
        document: {
          store: {
            p1: {
              id: 'p1',
              typeName: 'page',
              index: 0,
              x: 0,
              y: 0,
              width: 816,
              height: 1056,
              name: 'Page 1',
            },
            t1: {
              id: 't1',
              typeName: 'shape',
              type: 'text',
              parentId: 'p1',
              x: 0,
              y: 0,
              rot: 0,
              z: 1,
              props: { text: 'Legacy line', color: 'black', size: 'm', font: 'sans' },
            },
          },
        },
      })
      expect(s.get('t1')).toBeUndefined()
      const blocks = s.notebookDocumentBlocks()
      expect(blocks.some((b: any) => b.content?.[0]?.text === 'Legacy line')).toBe(true)
    })
  })
})
