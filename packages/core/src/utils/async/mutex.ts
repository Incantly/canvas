/** Single-flight async mutex — prevents overlapping checkpoints/saves. */
export interface Mutex {
  run<T>(fn: () => Promise<T>): Promise<T>
  dispose(): void
}

export function createMutex(): Mutex {
  let chain: Promise<unknown> = Promise.resolve()
  let disposed = false

  return {
    run<T>(fn: () => Promise<T>): Promise<T> {
      if (disposed) return Promise.reject(new Error('mutex disposed'))
      const next = chain.then(fn, fn)
      chain = next.then(
        () => undefined,
        () => undefined,
      )
      return next
    },
    dispose() {
      disposed = true
    },
  }
}
