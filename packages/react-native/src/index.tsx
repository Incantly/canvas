import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ForwardedRef,
} from 'react'
import { View, StyleSheet } from 'react-native'
import type { DocumentBlock, PaperSizeId, PaperStyleId, ToolId } from '@incantly/canvas/headless'
import {
  applyPageDocumentOverflow,
  pageContentRect,
  validateDocumentBlocks,
  documentBlocksFingerprint,
  debounce,
  pageTextBlocksToPlainLines,
} from '@incantly/canvas/headless'
import { PageViewport } from './document/PageViewport.js'
import { PAGE_FORMAT_BAR_HEIGHT } from './document/PageRichTextEditor.js'
import { useCanvasStore } from './store/use-canvas-store.js'
import { createStoreBridge } from './store/store-bridge.js'
import type { CanvasProps, CanvasRef } from './types/index.js'

export type { CanvasProps, CanvasRef, VersionSummary, SafeAreaInsets } from './types/index.js'

export {
  Store,
  migrateSnapshot,
  safeParseSnapshot,
  snapshotFingerprint,
  documentBlocksFingerprint,
  textBlockToMarkdown,
  markdownToTextBlock,
  pageTextBlocksToMarkdown,
  markdownToPageTextBlocks,
  mergeMarkdownIntoPageDocument,
  applyPageDocumentOverflow,
  validateDocumentBlocks,
  createVersionManager,
  MemoryVersionStorage,
  createMutex,
  createSerialQueue,
  debounce,
  createNotebookPersistence,
  createSqliteVersionStorage,
  createExpoSqliteDriver,
} from './headless-exports.js'

export type {
  Snapshot,
  Diff,
  DiffSource,
  DocumentBlock,
  TextBlock,
  ToolId,
  VersionManager,
  NotebookPersistence,
  NotebookPersistenceOptions,
  VersionStorage,
  DocumentVersion,
  SqliteDriver,
  ExpoSqliteLike,
  SqliteVersionStorageOptions,
} from './headless-exports.js'

export { TextBlockEditor, BlockFormatBar } from './document/TextBlockEditor.js'
export { DocumentScrollView } from './document/DocumentScrollView.js'
export {
  PageRichTextEditor,
  isEnrichedMarkdownAvailable,
  PAGE_FORMAT_BAR_HEIGHT,
} from './document/PageRichTextEditor.js'
export { PageViewport } from './document/PageViewport.js'
export { PaperBackground } from './document/PaperBackground.js'
export {
  DEFAULT_FORMAT_BAR_ITEMS,
  resolveFormatBarItems,
} from './document/format-bar-config.js'
export type {
  FormatBarConfig,
  FormatBarItemConfig,
  FormatBarItemId,
  BlockFormatAction,
} from './document/format-bar-config.js'

export const Canvas = forwardRef(function Canvas(
  props: CanvasProps,
  ref: ForwardedRef<CanvasRef>,
) {
  const {
    snapshot,
    readonly = false,
    documentMode = true,
    onReady,
    onChange,
    onError,
    formatBar,
    versionStorage,
    notebookId,
    style,
  } = props

  const toolRef = useRef<ToolId>('select')
  const lastFpRef = useRef('')
  const { store, versionManager, loadSnapshot, getSnapshot, notify } = useCanvasStore({
    onChange,
    versionStorage,
    notebookId,
  })

  const pages = store.pages()
  const [currentPageId, setCurrentPageId] = useState(() => pages[0]?.id ?? '')
  const currentPageIdRef = useRef(currentPageId)
  currentPageIdRef.current = currentPageId

  const [zoom, setZoom] = useState(0.75)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const [caretAtEnd, setCaretAtEnd] = useState(false)
  const overflowQuietUntilRef = useRef(0)

  const activeId = store.page(currentPageId) ? currentPageId : pages[0]?.id ?? ''
  const storeBlocks = validateDocumentBlocks(
    activeId ? store.pageDocumentBlocks(activeId) : store.notebookDocumentBlocks(),
  )
  const [localBlocks, setLocalBlocks] = useState<DocumentBlock[]>(storeBlocks)
  const localFpRef = useRef(documentBlocksFingerprint(storeBlocks))
  const lastPlainLenRef = useRef(pageTextBlocksToPlainLines(storeBlocks).length)

  const syncLocalFromPage = useCallback(
    (pageId: string) => {
      const trimmed = validateDocumentBlocks(store.pageDocumentBlocks(pageId))
      const trimmedFp = documentBlocksFingerprint(trimmed)
      lastFpRef.current = trimmedFp
      localFpRef.current = trimmedFp
      lastPlainLenRef.current = pageTextBlocksToPlainLines(trimmed).length
      setLocalBlocks(trimmed)
    },
    [store],
  )

  const followOverflowPage = useCallback(
    (overflowPageId?: string) => {
      if (!overflowPageId || !store.page(overflowPageId)) return false
      if (overflowPageId === currentPageIdRef.current) return false
      setCaretAtEnd(true)
      overflowQuietUntilRef.current = Date.now() + 500
      setCurrentPageId(overflowPageId)
      currentPageIdRef.current = overflowPageId
      syncLocalFromPage(overflowPageId)
      return true
    },
    [store, syncLocalFromPage],
  )

  useEffect(() => {
    const fp = documentBlocksFingerprint(storeBlocks)
    if (fp !== localFpRef.current && fp !== lastFpRef.current) {
      localFpRef.current = fp
      setLocalBlocks(storeBlocks)
    }
  }, [storeBlocks, activeId])

  useImperativeHandle(
    ref,
    () =>
      createStoreBridge({
        store,
        versionManager,
        getSnapshot,
        loadSnapshot,
        notify,
        toolRef,
        currentPageIdRef,
      }),
    [store, versionManager, getSnapshot, loadSnapshot, notify],
  )

  useEffect(() => {
    if (!snapshot) {
      onReady?.()
      return
    }
    try {
      loadSnapshot(snapshot, 'remote')
      const first = store.pages()[0]
      if (first) {
        setCurrentPageId(first.id)
        currentPageIdRef.current = first.id
      }
      const blocks = validateDocumentBlocks(
        first ? store.pageDocumentBlocks(first.id) : store.notebookDocumentBlocks(),
      )
      const fp = documentBlocksFingerprint(blocks)
      lastFpRef.current = fp
      localFpRef.current = fp
      setLocalBlocks(blocks)
      onReady?.()
    } catch (e) {
      onError?.(e instanceof Error ? e.message : String(e))
    }
    // Only re-run when snapshot identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot])

  const writeStore = useCallback(
    (blocks: DocumentBlock[], overflowOpts?: { maxContentHeight?: number }) => {
      const pageId = currentPageIdRef.current
      if (!pageId || !store.page(pageId)) return
      const validated = validateDocumentBlocks(blocks)
      const fp = documentBlocksFingerprint(validated)
      if (fp === lastFpRef.current && !overflowOpts?.maxContentHeight) return
      lastFpRef.current = fp
      store.setPageDocument(pageId, validated, 'user')
      const inset = PAGE_FORMAT_BAR_HEIGHT / Math.max(0.35, zoomRef.current)
      const overflow = applyPageDocumentOverflow(store, pageId, 'user', {
        contentInsetBottom: inset,
        maxContentHeight: overflowOpts?.maxContentHeight,
      })
      const trimmed = validateDocumentBlocks(store.pageDocumentBlocks(pageId))
      const trimmedFp = documentBlocksFingerprint(trimmed)
      lastFpRef.current = trimmedFp
      if (overflow.changed && followOverflowPage(overflow.overflowPageId)) {
        notify()
        return
      }
      if (overflow.changed || trimmedFp !== fp) {
        localFpRef.current = trimmedFp
        lastPlainLenRef.current = pageTextBlocksToPlainLines(trimmed).length
        setLocalBlocks(trimmed)
      }
      notify()
    },
    [store, notify, followOverflowPage],
  )

  const debouncedWrite = useRef(
    debounce((...args: unknown[]) => {
      writeStore(args[0] as DocumentBlock[])
    }, 300),
  )

  useEffect(() => {
    const d = debouncedWrite.current
    return () => {
      d.flush()
      d.dispose()
    }
  }, [])

  const onChangeBlocks = useCallback((blocks: DocumentBlock[]) => {
    const validated = validateDocumentBlocks(blocks)
    localFpRef.current = documentBlocksFingerprint(validated)
    setLocalBlocks(validated)
    debouncedWrite.current(validated)
    // Large paste: don't wait for the debounce — reflow onto the next page immediately.
    const plainLen = pageTextBlocksToPlainLines(validated).length
    if (plainLen - lastPlainLenRef.current > 180) {
      debouncedWrite.current.flush()
    }
    lastPlainLenRef.current = plainLen
  }, [])

  const onOverflowRequest = useCallback(
    (measuredHeight: number, boxHeight: number) => {
      if (Date.now() < overflowQuietUntilRef.current) return
      const pageId = currentPageIdRef.current
      if (!pageId || !store.page(pageId)) return
      debouncedWrite.current.flush()
      const page = store.page(pageId)
      if (!page) return
      const rect = pageContentRect(page)
      const inset = PAGE_FORMAT_BAR_HEIGHT / Math.max(0.35, zoomRef.current)
      if (measuredHeight <= boxHeight + 8) return
      const overflow = applyPageDocumentOverflow(store, pageId, 'user', {
        contentInsetBottom: inset,
        maxContentHeight: Math.max(80, rect.h - inset),
      })
      if (overflow.changed) {
        if (!followOverflowPage(overflow.overflowPageId)) {
          syncLocalFromPage(pageId)
        }
        notify()
      }
    },
    [store, notify, syncLocalFromPage, followOverflowPage],
  )

  const editable = documentMode && !readonly

  const selectPage = useCallback(
    (pageId: string) => {
      if (!store.page(pageId)) return
      setCaretAtEnd(false)
      setCurrentPageId(pageId)
      currentPageIdRef.current = pageId
      const blocks = validateDocumentBlocks(store.pageDocumentBlocks(pageId))
      const fp = documentBlocksFingerprint(blocks)
      lastFpRef.current = fp
      localFpRef.current = fp
      setLocalBlocks(blocks)
      notify()
    },
    [store, notify],
  )

  const addPage = useCallback(() => {
    const page = store.addPage({ paperSize: 'letter' })
    notify()
    selectPage(page.id)
  }, [store, notify, selectPage])

  const removePage = useCallback(() => {
    const id = currentPageIdRef.current
    if (!id) return
    store.removePage(id)
    const next = store.pages()[0]
    notify()
    if (next) selectPage(next.id)
  }, [store, notify, selectPage])

  const setPaperSize = useCallback(
    (paperSize: PaperSizeId) => {
      const id = currentPageIdRef.current
      if (!id) return
      store.setPagePaper(id, { paperSize })
      const inset = PAGE_FORMAT_BAR_HEIGHT / Math.max(0.35, zoomRef.current)
      applyPageDocumentOverflow(store, id, 'user', { contentInsetBottom: inset })
      syncLocalFromPage(id)
      notify()
    },
    [store, notify, syncLocalFromPage],
  )

  const setPaperStyle = useCallback(
    (paperStyle: PaperStyleId) => {
      const id = currentPageIdRef.current
      if (!id) return
      store.setPagePaper(id, { paperStyle })
      notify()
    },
    [store, notify],
  )

  return (
    <View style={[styles.root, style]}>
      <PageViewport
        pages={pages}
        currentPageId={activeId}
        blocks={localBlocks}
        zoom={zoom}
        readonly={!editable}
        formatBar={formatBar}
        onChangeBlocks={editable ? onChangeBlocks : undefined}
        onSelectPage={selectPage}
        onAddPage={addPage}
        onRemovePage={removePage}
        onPaperSize={setPaperSize}
        onPaperStyle={setPaperStyle}
        onZoom={setZoom}
        onError={onError}
        onOverflowRequest={editable ? onOverflowRequest : undefined}
        caretAtEnd={caretAtEnd}
      />
    </View>
  )
})

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#e8e4dc' },
})
