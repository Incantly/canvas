import { useEffect, useRef } from 'react'
import { createSubscriptionBag, type SubscriptionBag } from '@incantly/canvas/headless'

export function useDisposable(): SubscriptionBag {
  const bagRef = useRef<SubscriptionBag | null>(null)
  if (!bagRef.current) {
    bagRef.current = createSubscriptionBag()
  }
  useEffect(() => {
    const bag = bagRef.current!
    return () => {
      bag.dispose()
      bagRef.current = null
    }
  }, [])
  return bagRef.current!
}
