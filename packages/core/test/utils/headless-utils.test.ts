import { describe, expect, it } from 'vitest'
import { shouldAppendPoint, DEFAULT_INK_MIN_DIST } from '../../src/utils/ink/point-filter.js'
import { documentBlocksFingerprint } from '../../src/utils/document/block-fingerprint.js'
import { createLruCache } from '../../src/utils/cache/lru.js'
import { createSubscriptionBag } from '../../src/utils/dispose/subscription-bag.js'
import { snapshotFingerprint } from '../../src/utils/snapshot/fingerprint.js'
import { safeParseSnapshot } from '../../src/utils/snapshot/parse-json.js'

describe('shouldAppendPoint', () => {
  it('filters points closer than minDist', () => {
    expect(shouldAppendPoint({ x: 0, y: 0 }, { x: 0.5, y: 0, pressure: 0.5 }, DEFAULT_INK_MIN_DIST)).toBe(
      false,
    )
    expect(shouldAppendPoint({ x: 0, y: 0 }, { x: 2, y: 0, pressure: 0.5 }, DEFAULT_INK_MIN_DIST)).toBe(true)
  })
})

describe('documentBlocksFingerprint', () => {
  it('is stable for same blocks', () => {
    const blocks = [{ type: 'paragraph' as const, content: [{ text: 'hi' }] }]
    expect(documentBlocksFingerprint(blocks)).toBe(documentBlocksFingerprint(blocks))
  })
})

describe('createLruCache', () => {
  it('evicts oldest entry', () => {
    const cache = createLruCache<string, number>(2)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)
    expect(cache.has('a')).toBe(false)
    expect(cache.get('b')).toBe(2)
    cache.dispose()
  })
})

describe('createSubscriptionBag', () => {
  it('disposes listeners on dispose', () => {
    const bag = createSubscriptionBag()
    let called = false
    bag.add(() => {
      called = true
    })
    bag.dispose()
    expect(called).toBe(true)
    called = false
    bag.add(() => {
      called = true
    })
    expect(called).toBe(true)
  })
})

describe('snapshotFingerprint', () => {
  it('fingerprints store records', () => {
    const snap = { document: { store: { 'page:1': { id: 'page:1' } } } }
    expect(snapshotFingerprint(snap as never)).toContain('page:1')
  })
})

describe('safeParseSnapshot', () => {
  it('returns empty for blank input', () => {
    expect(safeParseSnapshot('')).toEqual({ ok: false, code: 'empty' })
  })

  it('returns parse error for invalid json', () => {
    expect(safeParseSnapshot('{bad').ok).toBe(false)
  })
})
