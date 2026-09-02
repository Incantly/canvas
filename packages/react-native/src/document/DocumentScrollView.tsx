import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ScrollView,
  Text,
  View,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import type { DocumentBlock, TextBlock } from '@incantly/canvas/headless'
import {
  isDrawingBlock,
  isTextBlock,
  validateDocumentBlocks,
  documentBlocksFingerprint,
} from '@incantly/canvas/headless'
import {
  TextBlockEditor,
  BlockFormatBar,
  applyFormat,
  blockHasMark,
  isStyledBlock,
  plainText,
  type BlockFormatAction,
} from './TextBlockEditor.js'
import type { FormatBarConfig } from './format-bar-config.js'

export interface DocumentScrollViewProps {
  blocks: DocumentBlock[]
  readonly?: boolean
  onChangeBlocks?: (blocks: DocumentBlock[]) => void
  onError?: (message: string) => void
  /** Per-item name + icon overrides for the format bar. */
  formatBar?: FormatBarConfig
}

let keySeq = 0
function nextKey(): string {
  keySeq += 1
  return `b${keySeq}`
}

function DrawingBlockRow() {
  return (
    <View style={styles.drawingBlock}>
      <Text style={styles.drawingLabel}>Drawing region (Skia ink — Phase 2)</Text>
    </View>
  )
}

function insertBeforeDrawing(blocks: DocumentBlock[], block: TextBlock): DocumentBlock[] {
  const drawingIdx = blocks.findIndex(isDrawingBlock)
  const insertAt = drawingIdx >= 0 ? drawingIdx : blocks.length
  return [...blocks.slice(0, insertAt), block, ...blocks.slice(insertAt)]
}

function firstTextIndex(blocks: DocumentBlock[]): number {
  const i = blocks.findIndex(isTextBlock)
  return i >= 0 ? i : -1
}

function lastTextIndex(blocks: DocumentBlock[]): number {
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (isTextBlock(blocks[i]!)) return i
  }
  return -1
}

function keysForBlocks(blocks: DocumentBlock[]): string[] {
  return blocks.map(() => nextKey())
}

export function DocumentScrollView({
  blocks,
  readonly,
  onChangeBlocks,
  onError,
  formatBar,
}: DocumentScrollViewProps) {
  // No line focused until the user taps — iOS won't show keyboard from mount focus
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const [focusNonce, setFocusNonce] = useState(0)
  const [rowKeys, setRowKeys] = useState(() => keysForBlocks(blocks))
  const externalFp = useRef(documentBlocksFingerprint(blocks))
  const focusOwnerRef = useRef(-1)

  const claimFocus = useCallback((index: number) => {
    focusOwnerRef.current = index
    setFocusedIndex(index)
    setFocusNonce((n) => n + 1)
  }, [])

  const releaseFocus = useCallback(() => {
    focusOwnerRef.current = -1
    setFocusedIndex(-1)
  }, [])

  useEffect(() => {
    const fp = documentBlocksFingerprint(blocks)
    if (fp !== externalFp.current && blocks.length !== rowKeys.length) {
      externalFp.current = fp
      setRowKeys(keysForBlocks(blocks))
      releaseFocus()
    } else if (fp !== externalFp.current && !onChangeBlocks) {
      externalFp.current = fp
      setRowKeys(keysForBlocks(blocks))
    }
  }, [blocks, rowKeys.length, onChangeBlocks, releaseFocus])

  // Guarantee at least one empty paragraph so the page is always writable
  useEffect(() => {
    if (!onChangeBlocks || readonly) return
    if (blocks.some(isTextBlock)) return
    const empty: TextBlock = { type: 'paragraph', content: [{ text: '' }] }
    const next = validateDocumentBlocks(insertBeforeDrawing(blocks, empty))
    externalFp.current = documentBlocksFingerprint(next)
    setRowKeys(keysForBlocks(next))
    onChangeBlocks(next)
  }, [blocks, onChangeBlocks, readonly])

  const replaceTextAt = useCallback(
    (index: number, next: TextBlock) => {
      const copy = blocks.slice()
      copy[index] = next
      const validated = validateDocumentBlocks(copy)
      externalFp.current = documentBlocksFingerprint(validated)
      onChangeBlocks?.(validated)
    },
    [blocks, onChangeBlocks],
  )

  const splitAt = useCallback(
    (index: number, before: TextBlock, after: TextBlock) => {
      const current = blocks[index]
      if (!current || !isTextBlock(current)) return
      const copy = blocks.slice()
      copy[index] = before
      copy.splice(index + 1, 0, after)
      const validated = validateDocumentBlocks(copy)
      externalFp.current = documentBlocksFingerprint(validated)
      setRowKeys((prev) => {
        const keys = prev.slice()
        while (keys.length < blocks.length) keys.push(nextKey())
        keys.splice(index + 1, 0, nextKey())
        return keys
      })
      onChangeBlocks?.(validated)
      claimFocus(index + 1)
    },
    [blocks, onChangeBlocks, claimFocus],
  )

  const applyToFocused = useCallback(
    (action: BlockFormatAction) => {
      if (focusedIndex < 0) return
      const current = blocks[focusedIndex]
      if (!current || !isTextBlock(current)) return
      replaceTextAt(focusedIndex, applyFormat(current, action))
    },
    [blocks, focusedIndex, replaceTextAt],
  )

  const backspaceEmptyAt = useCallback(
    (index: number) => {
      const current = blocks[index]
      if (!current || !isTextBlock(current)) return

      // Exit list / heading / quote / code → normal paragraph
      if (isStyledBlock(current.type) || current.type === 'divider') {
        replaceTextAt(index, { type: 'paragraph', content: [{ text: '' }] })
        claimFocus(index)
        return
      }

      // Empty paragraph: delete the line (keep at least one text block)
      const textCount = blocks.filter(isTextBlock).length
      if (textCount <= 1) return

      const copy = blocks.slice()
      copy.splice(index, 1)
      const validated = validateDocumentBlocks(copy)
      externalFp.current = documentBlocksFingerprint(validated)
      setRowKeys((prev) => {
        const keys = prev.slice()
        while (keys.length < blocks.length) keys.push(nextKey())
        keys.splice(index, 1)
        return keys
      })
      onChangeBlocks?.(validated)

      let prevText = -1
      for (let i = index - 1; i >= 0; i--) {
        if (isTextBlock(validated[i]!)) {
          prevText = i
          break
        }
      }
      if (prevText < 0) prevText = firstTextIndex(validated)
      if (prevText >= 0) claimFocus(prevText)
      else releaseFocus()
    },
    [blocks, replaceTextAt, claimFocus, releaseFocus, onChangeBlocks],
  )

  const addWritableLine = useCallback(
    (andFocus: boolean) => {
      if (!onChangeBlocks) return
      const last = lastTextIndex(blocks)
      if (last >= 0) {
        const b = blocks[last] as TextBlock
        const empty = b.content.every((s) => !s.text)
        if (empty && andFocus) {
          claimFocus(last)
          return
        }
      }
      const block: TextBlock = { type: 'paragraph', content: [{ text: '' }] }
      const next = validateDocumentBlocks(insertBeforeDrawing(blocks, block))
      externalFp.current = documentBlocksFingerprint(next)
      const drawingIdx = next.findIndex(isDrawingBlock)
      const insertAt = drawingIdx >= 0 ? drawingIdx - 1 : next.length - 1
      setRowKeys((prev) => {
        const keys = prev.slice()
        while (keys.length < blocks.length) keys.push(nextKey())
        const at = insertAt >= 0 ? insertAt : keys.length
        keys.splice(at, 0, nextKey())
        return keys
      })
      onChangeBlocks(next)
      if (andFocus) claimFocus(insertAt >= 0 ? insertAt : firstTextIndex(next))
    },
    [blocks, onChangeBlocks, claimFocus],
  )

  const editable = !readonly && !!onChangeBlocks
  const focusedBlock =
    focusedIndex >= 0 && isTextBlock(blocks[focusedIndex]!)
      ? (blocks[focusedIndex] as TextBlock)
      : undefined

  const onlyEmptyPage =
    blocks.filter(isTextBlock).length === 1 &&
    isTextBlock(blocks[firstTextIndex(blocks)]!) &&
    plainText(blocks[firstTextIndex(blocks)] as TextBlock).length === 0

  const numberedIndexAt = (index: number): number => {
    let n = 0
    for (let i = 0; i <= index; i++) {
      const b = blocks[i]
      if (b && isTextBlock(b) && b.type === 'numberedList') n += 1
      else if (b && isTextBlock(b)) n = 0
    }
    return Math.max(1, n)
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={64}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="none"
      >
        {editable ? (
          <View style={styles.toolbar}>
            <BlockFormatBar
              disabled={!focusedBlock}
              activeType={focusedBlock?.type}
              formatBar={formatBar}
              marks={
                focusedBlock
                  ? {
                      bold: blockHasMark(focusedBlock, 'bold'),
                      italic: blockHasMark(focusedBlock, 'italic'),
                      underline: blockHasMark(focusedBlock, 'underline'),
                      strikethrough: blockHasMark(focusedBlock, 'strikethrough'),
                      code: blockHasMark(focusedBlock, 'code'),
                      link: blockHasMark(focusedBlock, 'link'),
                    }
                  : undefined
              }
              onFormat={applyToFocused}
            />
          </View>
        ) : null}

        {blocks.map((block, i) => {
          const key = rowKeys[i] ?? `fallback-${i}`
          if (isTextBlock(block)) {
            const isOnlyEmpty =
              onlyEmptyPage && i === firstTextIndex(blocks) && plainText(block).length === 0
            return (
              <TextBlockEditor
                key={key}
                block={block}
                readonly={readonly || !onChangeBlocks}
                focused={editable && focusedIndex === i}
                focusNonce={editable && focusedIndex === i ? focusNonce : 0}
                showPlaceholder={isOnlyEmpty}
                listNumber={
                  block.type === 'numberedList' ? numberedIndexAt(i) : 1
                }
                onFocus={() => {
                  if (focusOwnerRef.current >= 0 && focusOwnerRef.current !== i) return
                  focusOwnerRef.current = i
                  setFocusedIndex(i)
                }}
                onClaimFocus={() => claimFocus(i)}
                onError={onError}
                onChangeBlock={(next) => replaceTextAt(i, next)}
                onBackspaceEmpty={() => backspaceEmptyAt(i)}
                onSplit={
                  editable
                    ? (before, after) => {
                        splitAt(i, before, after)
                      }
                    : undefined
                }
              />
            )
          }
          if (isDrawingBlock(block)) {
            return <DrawingBlockRow key={key} />
          }
          return null
        })}

        {editable ? (
          <Pressable
            style={styles.tapToWrite}
            onPress={() => addWritableLine(true)}
            accessibilityLabel="Continue writing"
          />
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 200, flexGrow: 1 },
  toolbar: { marginBottom: 4 },
  tapToWrite: {
    minHeight: 280,
    flexGrow: 1,
  },
  drawingBlock: {
    minHeight: 120,
    backgroundColor: '#f4f4f5',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 8,
  },
  drawingLabel: { fontSize: 12, opacity: 0.6 },
})
