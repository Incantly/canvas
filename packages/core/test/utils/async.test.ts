import { describe, expect, it, vi } from 'vitest'
import { createMutex } from '../../src/utils/async/mutex.js'
import { createSerialQueue } from '../../src/utils/async/serial-queue.js'
import { debounce } from '../../src/utils/async/debounce.js'

describe('createMutex', () => {
  it('runs tasks serially', async () => {
    const mutex = createMutex()
    const order: number[] = []
    await Promise.all([
      mutex.run(async () => {
        await new Promise((r) => setTimeout(r, 10))
        order.push(1)
      }),
      mutex.run(async () => {
        order.push(2)
      }),
    ])
    expect(order).toEqual([1, 2])
    mutex.dispose()
  })

  it('rejects after dispose', async () => {
    const mutex = createMutex()
    mutex.dispose()
    await expect(mutex.run(async () => 1)).rejects.toThrow('disposed')
  })
})

describe('createSerialQueue', () => {
  it('coalesces to latest task', async () => {
    const queue = createSerialQueue()
    const results: number[] = []
    const p1 = queue.enqueue(async () => {
      await new Promise((r) => setTimeout(r, 20))
      results.push(1)
      return 1
    })
    const p2 = queue.enqueue(async () => {
      results.push(2)
      return 2
    })
    await expect(p1).resolves.toBe(1)
    await expect(p2).resolves.toBe(2)
    expect(results).toEqual([1, 2])
    queue.dispose()
  })
})

describe('debounce', () => {
  it('flushes pending call', async () => {
    vi.useFakeTimers()
    let n = 0
    const d = debounce(() => {
      n++
    }, 100)
    d()
    d()
    expect(n).toBe(0)
    d.flush()
    expect(n).toBe(1)
    d.dispose()
    vi.useRealTimers()
  })
})
