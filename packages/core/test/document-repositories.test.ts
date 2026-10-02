import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  assetId,
  assetsHaveSameContent,
  contentAddressedAssetKey,
  createDocument,
  type AssetRecord,
  type AssetRepository,
  type DocumentRepository,
} from '../src/document/index.js'

describe('document assets and repositories', () => {
  it('derives deterministic content-addressed storage keys', () => {
    expect(contentAddressedAssetKey('sha256:ABCDEF1234')).toBe('sha256/ab/abcdef1234')
  })

  it('deduplicates by hash and byte length', () => {
    const first = { hash: 'sha256:abc' as const, byteLength: 100 }
    expect(assetsHaveSameContent(first, { ...first })).toBe(true)
    expect(assetsHaveSameContent(first, { hash: 'sha256:def', byteLength: 100 })).toBe(false)
    expect(assetsHaveSameContent(first, { hash: 'sha256:abc', byteLength: 101 })).toBe(false)
  })

  it('keeps records portable and binary data outside document JSON', () => {
    const record: AssetRecord = {
      id: assetId('asset:one'),
      hash: 'sha256:abc',
      storageKey: 'sha256/ab/abc',
      filename: 'paper.pdf',
      mimeType: 'application/pdf',
      byteLength: 42,
      createdAt: '2026-09-20T10:00:00.000Z',
    }
    expect(JSON.parse(JSON.stringify(record))).toEqual(record)
    expect(record).not.toHaveProperty('data')
    expect(record).not.toHaveProperty('file')
    expect(record).not.toHaveProperty('blob')
  })

  it('defines framework-neutral repository contracts', () => {
    expectTypeOf<AssetRepository['put']>().toBeFunction()
    expectTypeOf<DocumentRepository['saveCheckpoint']>().toBeFunction()
    const document = createDocument({ id: 'document:repository' })
    expect(document.content[0]).not.toHaveProperty('data')
  })
})
