export interface PaginationSchedulerOptions { schedule?: (callback: () => void) => void; cancel?: (handle: unknown) => void }
export interface PaginationScheduler { request(callback: () => void): void; dispose(): void }
export function createPaginationScheduler(options: PaginationSchedulerOptions = {}): PaginationScheduler {
  const schedule = options.schedule ?? ((callback) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(callback)
    else setTimeout(callback, 0)
  })
  let disposed = false
  let pending = false
  return { request(callback) { if (disposed || pending) return; pending = true; schedule(() => { pending = false; if (!disposed) callback() }) }, dispose() { disposed = true } }
}
