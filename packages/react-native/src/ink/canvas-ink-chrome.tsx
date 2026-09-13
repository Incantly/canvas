import type { ReactNode } from 'react'
import type { ViewStyle } from 'react-native'
import { InkToolbar } from './InkToolbar.js'
import type { InkBarConfig } from './ink-bar-config.js'
import {
  CanvasInkChromeContext,
  useCanvasInkChrome,
  type CanvasInkChromeContextValue,
} from './canvas-ink-chrome-context.js'

export type { CanvasInkChromeProps, CanvasInkChromeContextValue } from './canvas-ink-chrome-context.js'
export { useCanvasInkChrome } from './canvas-ink-chrome-context.js'

export function CanvasInkChromeProvider({
  value,
  children,
}: {
  value: CanvasInkChromeContextValue
  children: ReactNode
}) {
  return (
    <CanvasInkChromeContext.Provider value={value}>
      {children}
    </CanvasInkChromeContext.Provider>
  )
}

/**
 * `<InkToolbar>` bound to the nearest `<Canvas>` — render anywhere inside
 * `Canvas` children (bottom dock, side rail, floating pill, etc.).
 */
export function CanvasInkToolbar({
  inkBar,
  style,
}: {
  inkBar?: InkBarConfig
  style?: ViewStyle
}) {
  const chrome = useCanvasInkChrome()
  if (chrome.readonly) return null
  return (
    <InkToolbar
      tool={chrome.tool}
      color={chrome.color}
      size={chrome.size}
      pens={chrome.pens}
      inkBar={inkBar ?? chrome.inkBar}
      mode={chrome.mode}
      geoKind={chrome.geoKind}
      fill={chrome.fill}
      showFill={chrome.showFill}
      onTool={chrome.onTool}
      onColor={chrome.onColor}
      onSize={chrome.onSize}
      onGeoKind={chrome.onGeoKind}
      onFill={chrome.onFill}
      style={style}
    />
  )
}
