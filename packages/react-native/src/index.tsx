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
import type { DocumentBlock, ToolId } from '@incantly/canvas/headless'
import {
  validateDocumentBlocks,
  documentBlocksFingerprint,
  debounce,
} from '@incantly/canvas/headless'
import { DocumentScrollView } from './document/DocumentScrollView.js'
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

  const storeBlocks = validateDocumentBlocks(store.notebookDocumentBlocks())
  const [localBlocks, setLocalBlocks] = useState<DocumentBlock[]>(storeBlocks)
  const localFpRef = useRef(documentBlocksFingerprint(storeBlocks))

  // Sync from store when remote/undo/load changes fingerprint
  useEffect(() => {
    const fp = documentBlocksFingerprint(storeBlocks)
    if (fp !== localFpRef.current && fp !== lastFpRef.current) {
      localFpRef.current = fp
      setLocalBlocks(storeBlocks)
    }
  }, [storeBlocks])

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
      const blocks = validateDocumentBlocks(store.notebookDocumentBlocks())
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
    (blocks: DocumentBlock[]) => {
      const validated = validateDocumentBlocks(blocks)
      const fp = documentBlocksFingerprint(validated)
      if (fp === lastFpRef.current) return
      lastFpRef.current = fp
      store.setNotebookDocument(validated, 'user')
      notify()
    },
    [store, notify],
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
  }, [])

  const editable = documentMode && !readonly

  return (
    <View style={[styles.root, style]}>
      <DocumentScrollView
        blocks={localBlocks}
        readonly={!editable}
        onChangeBlocks={editable ? onChangeBlocks : undefined}
        onError={onError}
        formatBar={formatBar}
      />
    </View>
  )
})

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
})
