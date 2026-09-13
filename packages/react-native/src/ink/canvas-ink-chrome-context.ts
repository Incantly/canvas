import { createContext, useContext } from 'react'
import type { InkToolbarProps } from './InkToolbar.js'

/** Ink toolbar state + handlers wired to the parent `<Canvas>`. */
export type CanvasInkChromeProps = InkToolbarProps

export interface CanvasInkChromeContextValue extends CanvasInkChromeProps {
  readonly: boolean
}

export const CanvasInkChromeContext =
  createContext<CanvasInkChromeContextValue | null>(null)

/** Read ink tool/color/size state from a parent `<Canvas>`. */
export function useCanvasInkChrome(): CanvasInkChromeContextValue {
  const ctx = useContext(CanvasInkChromeContext)
  if (!ctx) {
    throw new Error('useCanvasInkChrome must be used within <Canvas>')
  }
  return ctx
}
