import { describe, it, expect, vi } from 'vitest'
import { encodeDispatch, createBridge } from '../src/bridge.js'

describe('encodeDispatch', () => {
  it('produces an injectable JS statement carrying the message', () => {
    const js = encodeDispatch({ type: 'setTool', tool: 'draw' })
    expect(js).toBe('window.__icDispatch({"type":"setTool","tool":"draw"}); true;')
  })

  it('escapes JS line terminators U+2028/U+2029', () => {
    const js = encodeDispatch({ type: 'x', text: 'a\u2028b\u2029c' })
    expect(js).not.toMatch(/[\u2028\u2029]/)
    expect(js).toContain('\\u2028')
    const json = js.slice('window.__icDispatch('.length, -'); true;'.length)
    expect(JSON.parse(json).text).toBe('a\u2028b\u2029c')
  })

  it('encodes document-mode bridge messages', () => {
    expect(encodeDispatch({ type: 'focusPageDocument' })).toBe(
      'window.__icDispatch({"type":"focusPageDocument"}); true;',
    )
    expect(encodeDispatch({ type: 'refreshPageDocument' })).toBe(
      'window.__icDispatch({"type":"refreshPageDocument"}); true;',
    )
    expect(encodeDispatch({ type: 'setDocumentBackground', color: '#fff8e7' })).toBe(
      'window.__icDispatch({"type":"setDocumentBackground","color":"#fff8e7"}); true;',
    )
  })
})

describe('createBridge', () => {
  it('post sends encoded commands', () => {
    const send = vi.fn()
    const b = createBridge(send)
    b.post({ type: 'undo' })
    expect(send).toHaveBeenCalledWith('window.__icDispatch({"type":"undo"}); true;')
  })

  it('request assigns ids and resolves on settle', async () => {
    const send = vi.fn()
    const b = createBridge(send)
    const p = b.request({ type: 'getSnapshot' })
    const sent = JSON.parse(send.mock.calls[0][0].slice('window.__icDispatch('.length, -'); true;'.length))
    expect(sent.id).toBe('r1')
    expect(b.settle(sent.id, { document: { store: {} } })).toBe(true)
    await expect(p).resolves.toEqual({ document: { store: {} } })
    expect(b.settle(sent.id, null)).toBe(false)
  })

  it('parallel requests settle independently', async () => {
    const send = vi.fn()
    const b = createBridge(send)
    const p1 = b.request({ type: 'getSnapshot' })
    const p2 = b.request({ type: 'exportPng' })
    b.settle('r2', 'png')
    b.settle('r1', 'snap')
    await expect(p1).resolves.toBe('snap')
    await expect(p2).resolves.toBe('png')
  })

  it('requests time out and dispose clears pending timers', async () => {
    vi.useFakeTimers()
    const b = createBridge(() => {}, { timeout: 50 })
    const p = b.request({ type: 'getSnapshot' })
    const caught = p.catch((e) => e)
    vi.advanceTimersByTime(60)
    const err = await caught
    expect(String(err)).toContain('timeout')

    const b2 = createBridge(() => {}, { timeout: 50 })
    b2.request({ type: 'x' }).catch(() => {})
    b2.dispose()
    vi.advanceTimersByTime(100)
    expect(b2.settle('r1', 1)).toBe(false)
    vi.useRealTimers()
  })
})
