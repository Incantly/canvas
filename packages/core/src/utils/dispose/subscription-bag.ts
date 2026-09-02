export interface SubscriptionBag {
  add(unsub: () => void): void
  addTimer(timer: ReturnType<typeof setTimeout>): void
  dispose(): void
}

export function createSubscriptionBag(): SubscriptionBag {
  const unsubs: (() => void)[] = []
  const timers: ReturnType<typeof setTimeout>[] = []
  let disposed = false

  return {
    add(unsub: () => void) {
      if (disposed) {
        unsub()
        return
      }
      unsubs.push(unsub)
    },
    addTimer(timer: ReturnType<typeof setTimeout>) {
      if (disposed) {
        clearTimeout(timer)
        return
      }
      timers.push(timer)
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const t of timers) clearTimeout(t)
      timers.length = 0
      for (const u of unsubs) u()
      unsubs.length = 0
    },
  }
}
