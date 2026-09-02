export interface LruCache<K, V> {
  get(key: K): V | undefined
  set(key: K, value: V): void
  has(key: K): boolean
  delete(key: K): void
  clear(): void
  dispose(): void
  readonly size: number
}

export function createLruCache<K, V>(max: number): LruCache<K, V> {
  const map = new Map<K, V>()
  let disposed = false

  return {
    get size() {
      return map.size
    },
    get(key: K): V | undefined {
      if (disposed) return undefined
      const v = map.get(key)
      if (v === undefined) return undefined
      map.delete(key)
      map.set(key, v)
      return v
    },
    set(key: K, value: V): void {
      if (disposed) return
      if (map.has(key)) map.delete(key)
      map.set(key, value)
      if (map.size > max) {
        const first = map.keys().next().value
        if (first !== undefined) map.delete(first)
      }
    },
    has(key: K): boolean {
      return !disposed && map.has(key)
    },
    delete(key: K): void {
      map.delete(key)
    },
    clear(): void {
      map.clear()
    },
    dispose(): void {
      disposed = true
      map.clear()
    },
  }
}
