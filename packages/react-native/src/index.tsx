import {
  createElement,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type ForwardedRef,
} from 'react'
import type { WebView as WebViewType } from 'react-native-webview'
import { WebView } from 'react-native-webview'
import { BOARD_HTML } from './board-html.generated.js'
import { createBridge, encodeDispatch } from './bridge.js'

export { BOARD_HTML } from './board-html.generated.js'
export { createBridge, encodeDispatch } from './bridge.js'
export type { CanvasProps, CanvasRef } from './types/index.js'

import type { CanvasProps, CanvasRef } from './types/index.js'

type Bridge = ReturnType<typeof createBridge>

interface State {
  ready: boolean
  queue: string[]
  send: (js: string) => void
  bridge: Bridge
}

export const Canvas = forwardRef(function Canvas(
  props: CanvasProps,
  ref: ForwardedRef<CanvasRef>,
) {
  const {
    theme = 'light',
    grid = 'lines',
    readonly = false,
    hideUi = false,
    themeToggle = true,
    gridControl = true,
    watermark = true,
    snapshot,
    styles,
    onReady,
    onChange,
    onSelectionChange,
    onThemeChange,
    onGridChange,
    onSave,
    onError,
    style,
    webviewProps,
  } = props

  const webRef = useRef<WebViewType | null>(null)
  const stateRef = useRef<State | null>(null)
  if (!stateRef.current) {
    const queue: string[] = []
    const send = (js: string) => {
      if (stateRef.current!.ready) webRef.current?.injectJavaScript(js)
      else queue.push(js)
    }
    stateRef.current = {
      ready: false,
      queue,
      send,
      bridge: createBridge(send),
    }
  }
  const st = stateRef.current

  const cbRef = useRef<{
    onReady?: () => void
    onChange?: (diff: any, source: any) => void
    onSelectionChange?: (ids: string[]) => void
    onThemeChange?: (theme: any) => void
    onGridChange?: (grid: any) => void
    onSave?: (dataUrl: string, background: boolean) => void
    onError?: (message: string) => void
  }>({})
  cbRef.current = { onReady, onChange, onSelectionChange, onThemeChange, onGridChange, onSave, onError }

  const initRef = useRef<any>(null)
  if (!initRef.current) {
    initRef.current = { theme, grid, readonly, hideUi, themeToggle, gridControl, watermark, snapshot, styles }
  }

  const onMessage = (e: any): void => {
    let m: any
    try {
      m = JSON.parse(e.nativeEvent.data)
    } catch {
      return
    }
    switch (m.type) {
      case 'ready': {
        st.ready = true
        webRef.current?.injectJavaScript(
          `window.__icDispatch(${JSON.stringify({ type: 'init', ...initRef.current })}); true;`,
        )
        for (const js of st.queue.splice(0)) webRef.current?.injectJavaScript(js)
        break
      }
      case 'mounted':
        cbRef.current.onReady?.()
        break
      case 'change':
        cbRef.current.onChange?.(m.diff, m.source)
        break
      case 'selection':
        cbRef.current.onSelectionChange?.(m.ids)
        break
      case 'theme':
        cbRef.current.onThemeChange?.(m.theme)
        break
      case 'grid':
        cbRef.current.onGridChange?.(m.grid)
        break
      case 'save':
        cbRef.current.onSave?.(m.dataUrl, m.background)
        break
      case 'snapshot':
        st.bridge.settle(m.id, m.snapshot)
        break
      case 'export':
        st.bridge.settle(m.id, m.dataUrl)
        break
      case 'error':
        cbRef.current.onError?.(m.message)
        break
    }
  }

  useEffect(() => {
    st.bridge.post({ type: 'setTheme', theme })
  }, [theme])
  useEffect(() => {
    st.bridge.post({ type: 'setGrid', grid })
  }, [grid])
  useEffect(() => {
    st.bridge.post({ type: 'setReadonly', readonly })
  }, [readonly])
  useEffect(() => () => st.bridge.dispose(), [])

  useImperativeHandle(
    ref,
    () => ({
      loadSnapshot: (snap, fit) => st.bridge.post({ type: 'loadSnapshot', snapshot: snap, fit }),
      applyDiff: (diff) => st.bridge.post({ type: 'applyDiff', diff }),
      setTool: (tool) => st.bridge.post({ type: 'setTool', tool }),
      setStyle: (key, value) => st.bridge.post({ type: 'setStyle', key, value }),
      setDocumentBackground: (color) =>
        st.bridge.post({ type: 'setDocumentBackground', color }),
      setGrid: (g) => st.bridge.post({ type: 'setGrid', grid: g }),
      undo: () => st.bridge.post({ type: 'undo' }),
      redo: () => st.bridge.post({ type: 'redo' }),
      clear: () => st.bridge.post({ type: 'clear' }),
      fitContent: (animate) => st.bridge.post({ type: 'fitContent', animate }),
      getSnapshot: () => st.bridge.request({ type: 'getSnapshot' }),
      exportPng: (opts) => st.bridge.request({ type: 'exportPng', opts }),
    }),
    [],
  )

  return createElement(WebView, {
    ref: webRef,
    source: { html: BOARD_HTML },
    originWhitelist: ['*'],
    onMessage,
    javaScriptEnabled: true,
    scrollEnabled: false,
    bounces: false,
    overScrollMode: 'never',
    setSupportMultipleWindows: false,
    hideKeyboardAccessoryView: true,
    style: [{ flex: 1, backgroundColor: 'transparent' }, style],
    ...webviewProps,
  })
})