import {
  createElement,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties,
  type ForwardedRef,
} from 'react'
import type { Editor, BoardUI } from '@quickdrawjs/core'
import { Editor as EditorCtor, Store, buildUI, buildWatermark } from '@quickdrawjs/core'
import type { QuickdrawProps, QuickdrawRef } from './types/index.js'

export * from '@quickdrawjs/core'
export type { QuickdrawProps, QuickdrawRef } from './types/index.js'

export const Quickdraw = forwardRef(function Quickdraw(
  props: QuickdrawProps,
  ref: ForwardedRef<QuickdrawRef>,
) {
  const {
    theme = 'light',
    grid = 'lines',
    readonly = false,
    hideUi = false,
    themeToggle = true,
    gridControl = true,
    watermark = true,
    store,
    snapshot,
    camera,
    styles,
    autoFit = false,
    onMount,
    onChange,
    onSelectionChange,
    onThemeChange,
    onGridChange,
    onSave,
    className,
    style,
  } = props

  const hostRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<Editor | null>(null)
  const uiRef = useRef<BoardUI | null>(null)

  const cbRef = useRef<{
    onMount?: (editor: Editor, ui: BoardUI) => void
    onChange?: (diff: any, source: any, editor: Editor) => void
    onSelectionChange?: (ids: string[], editor: Editor) => void
    onThemeChange?: (themeId: any, editor: Editor) => void
    onGridChange?: (gridId: any, editor: Editor) => void
    onSave?: (blob: Blob, background: boolean) => void
  }>({})
  cbRef.current = { onMount, onChange, onSelectionChange, onThemeChange, onGridChange, onSave }

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const editor = new EditorCtor({
      container: host,
      store: store || new Store(),
      theme,
      grid,
      readonly,
      camera,
      styles,
    } as any)
    host.dataset.qdTheme = editor.theme.id
    const ui = buildUI(editor, {
      hidden: hideUi || readonly,
      themeToggle,
      gridControl,
      onSave: (blob: Blob, background: boolean) => {
        if (cbRef.current.onSave) return cbRef.current.onSave(blob, background)
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download =
          'quickdraw-' +
          new Date().toISOString().slice(0, 19).replaceAll(':', '.') +
          '.png'
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 5000)
      },
    })
    editorRef.current = editor
    uiRef.current = ui
    const mark = watermark ? buildWatermark(editor) : null

    if (!store && snapshot) {
      editor.store.loadSnapshot(snapshot, 'remote')
      if (autoFit) editor.fitContent()
    }

    const unsubChange = editor.store.listen((diff: any, source: any) => {
      cbRef.current.onChange?.(diff, source, editor)
    })
    const unsubSel = editor.on('selection', () => {
      cbRef.current.onSelectionChange?.([...editor.selection], editor)
    })
    const unsubTheme = editor.on('theme', () => {
      host.dataset.qdTheme = editor.theme.id
      cbRef.current.onThemeChange?.(editor.theme.id, editor)
    })
    const unsubGrid = editor.on('grid', () => {
      cbRef.current.onGridChange?.(editor.grid, editor)
    })

    let ro: ResizeObserver | null = null
    if (autoFit) {
      editor.fitContent()
      ro = new ResizeObserver(() => {
        editor.resize()
        editor.fitContent()
      })
      ro.observe(host)
    }

    cbRef.current.onMount?.(editor, ui)

    return () => {
      ro?.disconnect()
      unsubChange()
      unsubSel()
      unsubTheme()
      unsubGrid()
      mark?.remove()
      ui.destroy()
      editor.destroy()
      editorRef.current = null
      uiRef.current = null
    }
  }, [store])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    editor.setTheme(theme)
    if (hostRef.current) hostRef.current.dataset.qdTheme = editor.theme.id
  }, [theme])

  useEffect(() => {
    editorRef.current?.setGrid(grid)
  }, [grid])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    editor.setReadonly(readonly)
    uiRef.current?.setHidden(hideUi || readonly)
  }, [readonly, hideUi])

  useEffect(() => {
    uiRef.current?.setOptions({ themeToggle, gridControl })
  }, [themeToggle, gridControl])

  useImperativeHandle(
    ref,
    () => ({
      get editor() {
        return editorRef.current
      },
      get ui() {
        return uiRef.current
      },
    }),
    [],
  )

  return createElement('div', {
    ref: hostRef,
    className,
    style: { width: '100%', height: '100%', ...(style as CSSProperties | undefined) },
  })
})

export function useQuickdrawStore(snapshot?: Parameters<Store['loadSnapshot']>[0]): Store {
  const ref = useRef<Store | null>(null)
  if (!ref.current) {
    ref.current = new Store()
    if (snapshot) ref.current.loadSnapshot(snapshot, 'remote')
  }
  return ref.current
}
