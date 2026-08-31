export const encodeDispatch = (msg: object): string => {
  const json = JSON.stringify(msg)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
  return `window.__icDispatch(${json}); true;`
}

export function createBridge(
  send: (js: string) => void,
  { timeout = 10000 }: { timeout?: number } = {},
): {
  post(msg: object): void
  request<T = any>(msg: object): Promise<T>
  settle(id: string, value: any): boolean
  dispose(): void
} {
  let seq = 0
  const pending = new Map<string, { resolve: (value: any) => void; t: ReturnType<typeof setTimeout> }>()
  return {
    post(msg: object) {
      send(encodeDispatch(msg))
    },
    request<T = any>(msg: object): Promise<T> {
      const id = 'r' + ++seq
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => {
          pending.delete(id)
          reject(new Error('incantly canvas bridge timeout: ' + (msg as any).type))
        }, timeout)
        pending.set(id, { resolve, t })
        send(encodeDispatch({ ...(msg as any), id }))
      })
    },
    settle(id: string, value: any): boolean {
      const p = pending.get(id)
      if (!p) return false
      pending.delete(id)
      clearTimeout(p.t)
      p.resolve(value)
      return true
    },
    dispose() {
      for (const { t } of pending.values()) clearTimeout(t)
      pending.clear()
    },
  }
}
