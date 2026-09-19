import {
  createElement,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties,
  type ForwardedRef,
} from 'react'
import type { Editor, BoardUI, Diff, DiffSource, GridId, Snapshot, ThemeId } from '@incantly/canvas'
import { Editor as EditorCtor, Store, buildUI, buildWatermark } from '@incantly/canvas'
import type { CanvasProps, CanvasRef } from './types/index.js'

export * from '@incantly/canvas'
export type { CanvasProps, CanvasRef } from './types/index.js'

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
    store,
    initialSnapshot,
    snapshot,
    initialCamera,
    camera,
    initialStyles,
    styles,
    documentMode = false,
    uiTools,
    uiIcons,
    hidePagesBar,
    documentBackground,
    documentPaperColor,
    touchUi = false,
    documentUi,
    autoFit = false,
    fitOnMount = autoFit,
    fitOnResize = autoFit,
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
  const watermarkRef = useRef<HTMLElement | null>(null)

  const cbRef = useRef<{
    onMount?: (editor: Editor, ui: BoardUI) => void
    onChange?: (diff: Diff, source: DiffSource, editor: Editor) => void
    onSelectionChange?: (ids: string[], editor: Editor) => void
    onThemeChange?: (themeId: ThemeId, editor: Editor) => void
    onGridChange?: (gridId: GridId, editor: Editor) => void
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
      camera: initialCamera ?? camera,
      styles: initialStyles ?? styles,
      documentMode,
      documentBackground: documentBackground ?? undefined,
      documentPaperColor: documentPaperColor ?? undefined,
      touchUi,
      documentUi,
    })
    host.dataset.icTheme = editor.theme.id
    const ui = buildUI(editor, {
      hidden: hideUi || readonly,
      themeToggle,
      gridControl,
      tools: uiTools,
      icons: uiIcons,
      hidePagesBar,
      onSave: (blob: Blob, background: boolean) => {
        if (cbRef.current.onSave) return cbRef.current.onSave(blob, background)
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download =
          'incantly-' +
          new Date().toISOString().slice(0, 19).replaceAll(':', '.') +
          '.png'
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 5000)
      },
    })
    editorRef.current = editor
    uiRef.current = ui
    watermarkRef.current = watermark ? buildWatermark(editor) : null

    const startingSnapshot = initialSnapshot ?? snapshot
    if (!store && startingSnapshot) {
      editor.store.loadSnapshot(startingSnapshot, 'remote')
    }

    const unsubChange = editor.store.listen((diff: Diff, source: DiffSource) => {
      cbRef.current.onChange?.(diff, source, editor)
    })
    const unsubSel = editor.on('selection', () => {
      cbRef.current.onSelectionChange?.([...editor.selection], editor)
    })
    const unsubTheme = editor.on('theme', () => {
      host.dataset.icTheme = editor.theme.id
      cbRef.current.onThemeChange?.(editor.theme.id, editor)
    })
    const unsubGrid = editor.on('grid', () => {
      cbRef.current.onGridChange?.(editor.grid, editor)
    })

    cbRef.current.onMount?.(editor, ui)

    return () => {
      unsubChange()
      unsubSel()
      unsubTheme()
      unsubGrid()
      watermarkRef.current?.remove()
      watermarkRef.current = null
      ui.destroy()
      // Commit any deferred keystroke before teardown (R-02). destroy()
      // also flushes, but this makes the boundary explicit for hosts reading
      // the Store during unmount.
      try {
        editor.flushPendingEdits()
      } catch {
        /* best-effort during teardown */
      }
      editor.destroy()
      editorRef.current = null
      uiRef.current = null
    }
  }, [store])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || documentBackground === undefined) return
    editor.setDocumentBackground(documentBackground)
  }, [documentBackground])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || documentPaperColor === undefined) return
    editor.setDocumentPaperColor(documentPaperColor)
  }, [documentPaperColor])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    editor.setTheme(theme)
    if (hostRef.current) hostRef.current.dataset.icTheme = editor.theme.id
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
    uiRef.current?.setOptions({
      themeToggle,
      gridControl,
      tools: uiTools,
      icons: uiIcons,
      hidePagesBar,
    })
  }, [themeToggle, gridControl, uiTools, uiIcons, hidePagesBar])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    watermarkRef.current?.remove()
    watermarkRef.current = watermark ? buildWatermark(editor) : null
  }, [watermark])

  useEffect(() => {
    const editor = editorRef.current
    const host = hostRef.current
    if (!editor || !host) return
    if (fitOnMount) editor.fitContent()
    if (!fitOnResize) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const ro = new ResizeObserver(() => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        editor.resize()
        editor.fitContent()
      }, 100)
    })
    ro.observe(host)
    return () => {
      ro.disconnect()
      if (timer) clearTimeout(timer)
    }
  }, [store, fitOnMount, fitOnResize])

  useImperativeHandle(
    ref,
    () => ({
      get editor() {
        return editorRef.current
      },
      get ui() {
        return uiRef.current
      },
      getSnapshot() {
        const editor = editorRef.current
        return editor ? editor.getSnapshot() : null
      },
      loadSnapshot(next: Snapshot, fit = false) {
        const editor = editorRef.current
        if (!editor) return
        editor.flushPendingEdits()
        editor.store.loadSnapshot(next, 'remote')
        if (fit) editor.fitContent()
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

export function useCanvasStore(snapshot?: Parameters<Store['loadSnapshot']>[0]): Store {
  const ref = useRef<Store | null>(null)
  if (!ref.current) {
    ref.current = new Store()
    if (snapshot) ref.current.loadSnapshot(snapshot, 'remote')
  }
  return ref.current
}
