export interface DebouncedFn<T extends (...args: never[]) => void> {
  (...args: Parameters<T>): void
  flush(): void
  cancel(): void
  dispose(): void
}

export function debounce<T extends (...args: never[]) => void>(
  fn: T,
  ms: number,
): DebouncedFn<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastArgs: Parameters<T> | null = null
  let disposed = false

  const flush = (): void => {
    if (disposed || !lastArgs) return
    const args = lastArgs
    lastArgs = null
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    fn(...args)
  }

  const cancel = (): void => {
    lastArgs = null
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  const wrapped = ((...args: Parameters<T>) => {
    if (disposed) return
    lastArgs = args
    if (timer) clearTimeout(timer)
    timer = setTimeout(flush, ms)
  }) as DebouncedFn<T>

  wrapped.flush = flush
  wrapped.cancel = cancel
  wrapped.dispose = () => {
    disposed = true
    cancel()
  }

  return wrapped
}
