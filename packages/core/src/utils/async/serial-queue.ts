/** Serializes async tasks; coalesces pending runs to the latest enqueued task only. */
export interface SerialQueue {
  enqueue<T>(task: () => Promise<T>): Promise<T>
  dispose(): void
}

export function createSerialQueue(): SerialQueue {
  let disposed = false
  let running = false
  let pending: (() => Promise<unknown>) | null = null
  let pendingResolve: ((v: unknown) => void) | null = null
  let pendingReject: ((e: unknown) => void) | null = null

  async function drain(): Promise<void> {
    if (running || disposed) return
    while (pending && !disposed) {
      const task = pending
      const resolve = pendingResolve!
      const reject = pendingReject!
      pending = null
      pendingResolve = null
      pendingReject = null
      running = true
      try {
        resolve(await task())
      } catch (e) {
        reject(e)
      } finally {
        running = false
      }
    }
  }

  return {
    enqueue<T>(task: () => Promise<T>): Promise<T> {
      if (disposed) return Promise.reject(new Error('serial queue disposed'))
      return new Promise<T>((resolve, reject) => {
        pending = task as () => Promise<unknown>
        pendingResolve = resolve as (v: unknown) => void
        pendingReject = reject
        void drain()
      })
    },
    dispose() {
      disposed = true
      pending = null
      pendingResolve = null
      pendingReject = null
    },
  }
}
