import { useEffect, useRef } from 'react'
import { debounce, type DebouncedFn } from '@incantly/canvas/headless'

export function useDebouncedCallback<T extends (...args: any[]) => void>(
  fn: T,
  ms: number,
): DebouncedFn<T> {
  const fnRef = useRef(fn)
  fnRef.current = fn
  const debouncedRef = useRef<DebouncedFn<T> | null>(null)
  if (!debouncedRef.current) {
    debouncedRef.current = debounce(((...args: Parameters<T>) => {
      fnRef.current(...args)
    }) as T, ms)
  }
  useEffect(() => {
    return () => {
      debouncedRef.current?.dispose()
      debouncedRef.current = null
    }
  }, [])
  return debouncedRef.current!
}
