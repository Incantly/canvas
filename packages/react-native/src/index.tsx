import {
  createElement,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type ForwardedRef,
} from 'react'
import { Alert, Platform } from 'react-native'
import type { WebView as WebViewType } from 'react-native-webview'
import { WebView } from 'react-native-webview'
import { BOARD_HTML } from './board-html.generated.js'
import { createBridge, encodeDispatch } from './bridge.js'

export { BOARD_HTML } from './board-html.generated.js'
export { createBridge, encodeDispatch } from './bridge.js'
export type { CanvasProps, CanvasRef, SafeAreaInsets, VersionSummary } from './types/index.js'

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
    documentMode = false,
    documentBackground,
    documentPaperColor,
    uiTools,
    uiIcons,
    hidePagesBar,
    touchUi = true,
    safeAreaInsets,
    onReady,
    onChange,
    onSelectionChange,
    onThemeChange,
    onGridChange,
    onEdit,
    onKeyboard,
    onSave,
    onError,
    onPromptLink,
    onReadClipboard,
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
    onEdit?: () => void
    onKeyboard?: (height: number) => void
    onSave?: (dataUrl: string, background: boolean) => void
    onError?: (message: string) => void
    onPromptLink?: (respond: (url: string | null) => void) => void
    onReadClipboard?: (respond: (text: string) => void) => void
  }>({})
  cbRef.current = {
    onReady,
    onChange,
    onSelectionChange,
    onThemeChange,
    onGridChange,
    onEdit,
    onKeyboard,
    onSave,
    onError,
    onPromptLink,
    onReadClipboard,
  }

  const initRef = useRef<any>(null)
  if (!initRef.current) {
    initRef.current = {
      theme,
      grid,
      readonly,
      hideUi,
      themeToggle,
      gridControl,
      watermark,
      snapshot,
      styles,
      documentMode,
      documentBackground,
    documentPaperColor,
      uiTools,
      uiIcons,
      hidePagesBar,
      touchUi,
      safeAreaInsets,
    }
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
      case 'edit':
        cbRef.current.onEdit?.()
        break
      case 'keyboard':
        cbRef.current.onKeyboard?.(typeof m.height === 'number' ? m.height : 0)
        break
      case 'promptLink':
        if (cbRef.current.onPromptLink) {
          cbRef.current.onPromptLink((url) =>
            st.bridge.post({ type: 'promptLinkResult', url }),
          )
        } else if (Platform.OS === 'ios') {
          Alert.prompt('Link URL', undefined, (url) =>
            st.bridge.post({ type: 'promptLinkResult', url: url || null }),
          )
        } else {
          st.bridge.post({ type: 'promptLinkResult', url: null })
        }
        break
      case 'readClipboard':
        if (cbRef.current.onReadClipboard) {
          cbRef.current.onReadClipboard((text) =>
            st.bridge.post({ type: 'clipboardResult', id: m.id, text }),
          )
        } else {
          st.bridge.post({ type: 'clipboardResult', id: m.id, text: '' })
        }
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
      case 'versions':
        st.bridge.settle(m.id, m.versions)
        break
      case 'reverted':
        st.bridge.settle(m.id, undefined)
        break
      case 'versionSaved':
        st.bridge.settle(m.id, {
          id: m.versionId,
          createdAt: m.createdAt,
          label: m.label,
          kind: m.kind,
        })
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
  useEffect(() => {
    if (documentBackground !== undefined) {
      st.bridge.post({ type: 'setDocumentBackground', color: documentBackground })
    }
  }, [documentBackground])

  useEffect(() => {
    if (documentPaperColor !== undefined) {
      st.bridge.post({ type: 'setDocumentPaperColor', color: documentPaperColor })
    }
  }, [documentPaperColor])
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
      setDocumentPaperColor: (color) =>
        st.bridge.post({ type: 'setDocumentPaperColor', color }),
      setGrid: (g) => st.bridge.post({ type: 'setGrid', grid: g }),
      undo: () => st.bridge.post({ type: 'undo' }),
      redo: () => st.bridge.post({ type: 'redo' }),
      clear: () => st.bridge.post({ type: 'clear' }),
      fitContent: (animate) => st.bridge.post({ type: 'fitContent', animate }),
      focusPageDocument: () => st.bridge.post({ type: 'focusPageDocument' }),
      refreshPageDocument: () => st.bridge.post({ type: 'refreshPageDocument' }),
      setPage: (pageId, opts) =>
        st.bridge.post({
          type: 'setPage',
          pageId,
          fit: opts?.fit,
          animate: opts?.animate,
        }),
      addPage: (opts) => st.bridge.post({ type: 'addPage', opts }),
      removePage: (pageId) => st.bridge.post({ type: 'removePage', pageId }),
      getSnapshot: () => st.bridge.request({ type: 'getSnapshot' }),
      exportPng: (opts) => st.bridge.request({ type: 'exportPng', opts }),
      listVersions: () => st.bridge.request({ type: 'listVersions' }),
      revertVersion: (versionId) => st.bridge.request({ type: 'revertVersion', versionId }),
      saveVersion: (label) => st.bridge.request({ type: 'saveVersion', label }),
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
    hideKeyboardAccessoryView: false,
    style: [{ flex: 1, backgroundColor: 'transparent' }, style],
    ...webviewProps,
  })
})
