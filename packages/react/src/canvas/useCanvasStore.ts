import { useRef } from 'react'
import { Store } from '@incantly/canvas'

export function useCanvasStore(snapshot?: Parameters<Store['loadSnapshot']>[0]): Store {
  const ref = useRef<Store | null>(null)
  if (!ref.current) {
    ref.current = new Store()
    if (snapshot) ref.current.loadSnapshot(snapshot, 'remote')
  }
  return ref.current
}
