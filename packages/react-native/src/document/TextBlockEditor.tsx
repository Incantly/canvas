import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  TextInput,
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  type TextStyle,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
  type TextInputSelectionChangeEventData,
} from 'react-native'
import type { BlockType, InlineSpan, TextBlock } from '@incantly/canvas/headless'
import {
  resolveFormatBarItems,
  type BlockFormatAction,
  type FormatBarConfig,
} from './format-bar-config.js'

const TEXT_MAX_CHARS = 256_000

export type { BlockFormatAction, FormatBarConfig } from './format-bar-config.js'

export type InlineMark = 'bold' | 'italic' | 'underline' | 'strikethrough' | 'code' | 'link'

export interface TextBlockEditorProps {
  block: TextBlock
  readonly?: boolean
  focused?: boolean
  /** Only the first empty paragraph of a blank page shows a hint. */
  showPlaceholder?: boolean
  /** 1-based index for numbered list rows. */
  listNumber?: number
  focusNonce?: number
  onFocus?: () => void
  /** Tap / press-in: parent should take focus ownership of this row. */
  onClaimFocus?: () => void
  onChangeBlock: (next: TextBlock) => void
  onSplit?: (before: TextBlock, after: TextBlock) => void
  onBackspaceEmpty?: () => void
  onError?: (message: string) => void
}

const FONT_FOR_TYPE: Partial<Record<BlockType, TextStyle>> = {
  heading1: { fontSize: 28, fontWeight: '700', lineHeight: 34 },
  heading2: { fontSize: 22, fontWeight: '700', lineHeight: 28 },
  heading3: { fontSize: 18, fontWeight: '600', lineHeight: 24 },
  codeBlock: {
    fontFamily: 'Menlo',
    fontSize: 14,
    lineHeight: 20,
    backgroundColor: '#f3f4f6',
  },
  quote: { fontStyle: 'italic', color: '#555', fontSize: 16, lineHeight: 24 },
  bulletList: { fontSize: 16, lineHeight: 24 },
  numberedList: { fontSize: 16, lineHeight: 24 },
  paragraph: { fontSize: 16, lineHeight: 24 },
  divider: { fontSize: 16, lineHeight: 24 },
}

function plainText(block: TextBlock): string {
  return block.content.map((s) => s.text).join('')
}

function blockHasMark(block: TextBlock, mark: InlineMark): boolean {
  const spans = block.content.filter((s) => s.text.length > 0)
  const check = (s: InlineSpan) => {
    if (mark === 'link') return !!s.link?.href
    if (mark === 'code') return !!s.code
    return !!s[mark]
  }
  if (spans.length === 0) return block.content.some(check)
  return spans.every(check)
}

function blockIsBold(block: TextBlock): boolean {
  return blockHasMark(block, 'bold')
}

function withPlainText(block: TextBlock, text: string): TextBlock {
  const marks: Partial<InlineSpan> = {}
  if (blockHasMark(block, 'bold')) marks.bold = true
  if (blockHasMark(block, 'italic')) marks.italic = true
  if (blockHasMark(block, 'underline')) marks.underline = true
  if (blockHasMark(block, 'strikethrough')) marks.strikethrough = true
  if (blockHasMark(block, 'code')) marks.code = true
  if (blockHasMark(block, 'link')) {
    const href = block.content.find((s) => s.link?.href)?.link?.href ?? 'https://'
    marks.link = { href }
  }
  return {
    ...block,
    content: [{ text, ...marks }],
  }
}

function toggleMark(block: TextBlock, mark: InlineMark): TextBlock {
  const nextOn = !blockHasMark(block, mark)
  return {
    ...block,
    content: block.content.map((s) => {
      const copy: InlineSpan = { ...s }
      if (mark === 'link') {
        if (nextOn) copy.link = { href: copy.link?.href ?? 'https://' }
        else delete copy.link
      } else if (mark === 'code') {
        if (nextOn) copy.code = true
        else delete copy.code
      } else if (mark === 'bold') {
        if (nextOn) copy.bold = true
        else delete copy.bold
      } else if (mark === 'italic') {
        if (nextOn) copy.italic = true
        else delete copy.italic
      } else if (mark === 'underline') {
        if (nextOn) copy.underline = true
        else delete copy.underline
      } else if (mark === 'strikethrough') {
        if (nextOn) copy.strikethrough = true
        else delete copy.strikethrough
      }
      return copy
    }),
  }
}

function applyFormat(block: TextBlock, action: BlockFormatAction): TextBlock {
  switch (action) {
    case 'bold':
      return toggleMark(block, 'bold')
    case 'italic':
      return toggleMark(block, 'italic')
    case 'underline':
      return toggleMark(block, 'underline')
    case 'strikethrough':
      return toggleMark(block, 'strikethrough')
    case 'inlineCode':
      return toggleMark(block, 'code')
    case 'link':
      return toggleMark(block, 'link')
    case 'divider':
      return { type: 'divider', content: [{ text: '' }] }
    case 'paragraph':
      return { ...block, type: 'paragraph' }
    default: {
      if (block.type === action) return { ...block, type: 'paragraph' }
      return { ...block, type: action }
    }
  }
}

function isStyledBlock(type: BlockType): boolean {
  return (
    type === 'bulletList' ||
    type === 'numberedList' ||
    type === 'quote' ||
    type === 'heading1' ||
    type === 'heading2' ||
    type === 'heading3' ||
    type === 'codeBlock'
  )
}

function marksStyle(block: TextBlock): TextStyle {
  return {
    fontWeight: blockHasMark(block, 'bold') ? '700' : undefined,
    fontStyle: blockHasMark(block, 'italic') ? 'italic' : undefined,
    textDecorationLine: (() => {
      const u = blockHasMark(block, 'underline') || blockHasMark(block, 'link')
      const s = blockHasMark(block, 'strikethrough')
      if (u && s) return 'underline line-through'
      if (u) return 'underline'
      if (s) return 'line-through'
      return undefined
    })(),
    fontFamily: blockHasMark(block, 'code') ? 'Menlo' : undefined,
    color: blockHasMark(block, 'link') ? '#1967d2' : undefined,
  }
}

export function TextBlockEditor({
  block,
  readonly,
  focused,
  showPlaceholder = false,
  listNumber = 1,
  focusNonce = 0,
  onFocus,
  onClaimFocus,
  onChangeBlock,
  onSplit,
  onBackspaceEmpty,
  onError,
}: TextBlockEditorProps) {
  const inputRef = useRef<TextInput>(null)
  const [draft, setDraft] = useState(() => plainText(block))
  const draftRef = useRef(draft)
  const lastNonce = useRef(0)
  const didMount = useRef(false)
  const splittingRef = useRef(false)
  const focusedRef = useRef(!!focused)
  const selectionRef = useRef({ start: 0, end: 0 })
  focusedRef.current = !!focused

  useEffect(() => {
    const t = plainText(block)
    if (t === draftRef.current) return
    setDraft(t)
    draftRef.current = t
  }, [block])

  useLayoutEffect(() => {
    if (focused) splittingRef.current = false
    const isMount = !didMount.current
    didMount.current = true
    if (!focused || focusNonce === 0 || focusNonce === lastNonce.current) return
    lastNonce.current = focusNonce
    // New rows mount with autoFocus. Don't call focus() again — that shakes the caret.
    if (isMount) return
    inputRef.current?.focus()
  }, [focused, focusNonce])

  const commitText = (text: string) => {
    if (text.length > TEXT_MAX_CHARS) {
      onError?.(`Text exceeds ${TEXT_MAX_CHARS} characters`)
      return
    }
    onChangeBlock(withPlainText(block, text))
  }

  const claim = () => {
    focusedRef.current = true
    onClaimFocus?.()
    onFocus?.()
  }

  const splitDraft = (text: string, caret: number): boolean => {
    if (!onSplit || splittingRef.current) return false
    if (!focusedRef.current) return false
    const safeCaret = Math.max(0, Math.min(caret, text.length))
    const beforeText = text.slice(0, safeCaret)
    const afterText = text.slice(safeCaret).replace(/^\n+/, '')
    if (!beforeText && !afterText && isStyledBlock(block.type)) {
      const next = { type: 'paragraph' as const, content: [{ text: '' }] }
      setDraft('')
      draftRef.current = ''
      onChangeBlock(next)
      return true
    }
    if (beforeText.length > TEXT_MAX_CHARS || afterText.length > TEXT_MAX_CHARS) {
      onError?.(`Text exceeds ${TEXT_MAX_CHARS} characters`)
      return true
    }
    const before = withPlainText(block, beforeText)
    const afterType: BlockType =
      block.type === 'bulletList' || block.type === 'numberedList'
        ? block.type
        : 'paragraph'
    const after: TextBlock = {
      type: afterType,
      content: [{ text: afterText }],
    }
    splittingRef.current = true
    focusedRef.current = false
    setDraft(beforeText)
    draftRef.current = beforeText
    onSplit(before, after)
    return true
  }

  const typeStyle = FONT_FOR_TYPE[block.type] ?? FONT_FOR_TYPE.paragraph
  const markStyle = marksStyle(block)
  const isList = block.type === 'bulletList' || block.type === 'numberedList'
  const isQuote = block.type === 'quote'

  if (block.type === 'divider') {
    return (
      <Pressable
        style={styles.dividerWrap}
        onPress={() => {
          claim()
          onBackspaceEmpty?.()
        }}
        accessibilityLabel="Divider — tap to remove"
      >
        <View style={styles.dividerLine} />
      </Pressable>
    )
  }

  if (readonly) {
    return (
      <View style={[styles.wrap, isQuote && styles.quoteWrap]}>
        {isList ? (
          <Text style={styles.bullet}>
            {block.type === 'numberedList' ? `${listNumber}.` : '•'}
          </Text>
        ) : null}
        <Text style={[styles.input, typeStyle, markStyle, styles.readonlyFlex]}>
          {draft || ' '}
        </Text>
      </View>
    )
  }

  return (
    <Pressable
      style={[styles.wrap, isQuote && styles.quoteWrap]}
      onPress={() => {
        claim()
        inputRef.current?.focus()
      }}
    >
      {isList ? (
        <Text style={styles.bullet}>
          {block.type === 'numberedList' ? `${listNumber}.` : '•'}
        </Text>
      ) : null}
      <TextInput
        ref={inputRef}
        value={draft}
        editable
        showSoftInputOnFocus
        autoFocus={!!focused}
        submitBehavior="submit"
        onFocus={onFocus}
        onPressIn={claim}
        onSelectionChange={(e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
          selectionRef.current = e.nativeEvent.selection
        }}
        onSubmitEditing={() => {
          splitDraft(draftRef.current, selectionRef.current.start)
        }}
        onKeyPress={(e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
          if (e.nativeEvent.key === 'Backspace' && draftRef.current.length === 0) {
            onBackspaceEmpty?.()
          }
        }}
        onChangeText={(text) => {
          if (onSplit && text.includes('\n')) {
            if (!focusedRef.current || splittingRef.current) {
              const stripped = text.replace(/\n/g, '')
              setDraft(stripped)
              draftRef.current = stripped
              return
            }
            splitDraft(text, text.indexOf('\n'))
            return
          }
          setDraft(text)
          draftRef.current = text
          if (text === '' && isStyledBlock(block.type)) {
            onChangeBlock({ type: 'paragraph', content: [{ text: '' }] })
            return
          }
          commitText(text)
        }}
        onBlur={() => {
          if (splittingRef.current) return
          if (draftRef.current === plainText(block)) return
          commitText(draftRef.current)
        }}
        multiline
        scrollEnabled={false}
        textAlignVertical="top"
        placeholder={showPlaceholder ? 'Start writing…' : undefined}
        placeholderTextColor="#ccc"
        style={[styles.input, typeStyle, markStyle]}
        autoCorrect
        autoCapitalize="sentences"
      />
    </Pressable>
  )
}

export interface BlockFormatBarProps {
  activeType?: BlockType
  marks?: Partial<Record<InlineMark, boolean>>
  disabled?: boolean
  /** Per-item name + icon overrides from the host app. */
  formatBar?: FormatBarConfig
  onFormat: (action: BlockFormatAction) => void
}

/** Full SDK format surface — block types + inline marks (icons/names overridable). */
export function BlockFormatBar({
  activeType,
  marks,
  disabled,
  formatBar,
  onFormat,
}: BlockFormatBarProps) {
  const items = resolveFormatBarItems(formatBar)

  const isActive = (id: BlockFormatAction): boolean => {
    switch (id) {
      case 'bold':
        return !!marks?.bold
      case 'italic':
        return !!marks?.italic
      case 'underline':
        return !!marks?.underline
      case 'strikethrough':
        return !!marks?.strikethrough
      case 'inlineCode':
        return !!marks?.code
      case 'link':
        return !!marks?.link
      default:
        return activeType === id
    }
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="always"
      contentContainerStyle={styles.bar}
    >
      {items.map((item) => {
        const active = isActive(item.id)
        return (
          <Pressable
            key={item.id}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={item.name}
            accessibilityState={{ selected: active, disabled: !!disabled }}
            style={[styles.barBtn, active && styles.barBtnActive, disabled && styles.barBtnDisabled]}
            onPress={() => onFormat(item.id)}
          >
            {item.icon ? <View style={styles.barIcon}>{item.icon}</View> : null}
            <Text style={[styles.barBtnText, active && styles.barBtnTextActive]} numberOfLines={1}>
              {item.name}
            </Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

export {
  applyFormat,
  blockIsBold,
  blockHasMark,
  plainText,
  withPlainText,
  isStyledBlock,
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 2,
    paddingHorizontal: 0,
    minHeight: 36,
  },
  quoteWrap: {
    borderLeftWidth: 3,
    borderLeftColor: '#c5cad3',
    paddingLeft: 10,
    marginLeft: 2,
  },
  bullet: {
    width: 28,
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
    marginTop: 8,
  },
  readonlyFlex: { flex: 1 },
  input: {
    flex: 1,
    minHeight: 36,
    paddingVertical: 6,
    paddingHorizontal: 0,
    color: '#111',
    width: '100%',
  },
  dividerWrap: {
    paddingVertical: 14,
    paddingHorizontal: 0,
  },
  dividerLine: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#c5cad3',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingRight: 8,
  },
  barBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#eef1f6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  barIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  barBtnActive: {
    backgroundColor: '#1967d2',
  },
  barBtnDisabled: {
    opacity: 0.4,
  },
  barBtnText: { color: '#333', fontWeight: '600', fontSize: 12 },
  barBtnTextActive: { color: '#fff' },
})
