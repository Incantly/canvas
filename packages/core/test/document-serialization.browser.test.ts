// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import allMarks from './fixtures/documents/v1-all-marks.json'
import allNodes from './fixtures/documents/v1-all-nodes.json'
import nested from './fixtures/documents/v1-nested.json'
import {
  DocumentSerializationError,
  parseIncantlyDocument,
  serializeIncantlyDocument,
  type IncantlyDocument,
} from '../src/document/index.js'

describe('document fixtures in a browser environment', () => {
  it.each([allMarks, allNodes, nested])('round-trips fixture $id without DOM dependencies', (fixture) => {
    const serialized = serializeIncantlyDocument(fixture as IncantlyDocument)
    const parsed = parseIncantlyDocument(serialized)

    expect(parsed.ok).toBe(true)
    expect(serializeIncantlyDocument(parsed.document as IncantlyDocument)).toBe(serialized)
  })

  it('refuses DOM references instead of persisting them', () => {
    const withDomReference = {
      ...allMarks,
      editorElement: document.createElement('div'),
    } as unknown as IncantlyDocument

    expect(() => serializeIncantlyDocument(withDomReference)).toThrowError(expect.objectContaining({
      name: DocumentSerializationError.name,
      code: 'non_json_value',
    }))
  })
})
