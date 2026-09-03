import { useEffect, useRef, useState, type ComponentType } from 'react'
import {
  TextInput,
  UIManager,
  View,
  StyleSheet,
  type NativeSyntheticEvent,
  type TextInputContentSizeChangeEventData,
  type TextInputSelectionChangeEventData,
} from 'react-native'
import type { DocumentBlock } from '@incantly/canvas/headless'
import {
  applyInlineMarkToPageRange,
  documentBlocksFingerprint,
  isTextBlock,
  mergeMarkdownIntoPageDocument,
  PAGE_DOC_FONT_SIZE,
  pageTextBlocksToMarkdown,
  pageTextBlocksToPlainLines,
  validateDocumentBlocks,
} from '@incantly/canvas/headless'
import {
  BlockFormatBar,
  type BlockFormatAction,
} from './TextBlockEditor.js'
import type { FormatBarConfig } from './format-bar-config.js'

const TEXT_MAX_CHARS = 256_000

type InlineMark = 'bold' | 'italic' | 'underline' | 'strikethrough' | 'code'

type EnrichedStyleState = {
  bold?: { isActive?: boolean }
  italic?: { isActive?: boolean }
  underline?: { isActive?: boolean }
  strikethrough?: { isActive?: boolean }
  heading?: { isActive?: boolean; level?: number }
  unorderedList?: { isActive?: boolean }
  orderedList?: { isActive?: boolean }
}

type EnrichedInstance = {
  toggleBold: () => void
  toggleItalic: () => void
  toggleUnderline: () => void
  toggleStrikethrough: () => void
  toggleHeading: (level: number) => void
  toggleUnorderedList: () => void
  toggleOrderedList: () => void
  setLink: (url: string) => void
  setValue: (markdown: string) => void
}

type EnrichedProps = {
  ref?: { current: EnrichedInstance | null }
  defaultValue?: string
  placeholder?: string
  placeholderTextColor?: string
  scrollEnabled?: boolean
  style?: object
  onChangeMarkdown?: (md: string) => void
  onChangeState?: (state: EnrichedStyleState) => void
  onFocus?: () => void
  onBlur?: () => void
}

/** True when the Fabric/native view is registered (false in Expo Go without a dev client). */
function isNativeEnrichedLinked(): boolean {
  const ui = UIManager as {
    hasViewManagerConfig?: (name: string) => boolean
    getViewManagerConfig?: (name: string) => unknown
  }
  try {
    if (typeof ui.hasViewManagerConfig === 'function') {
      return ui.hasViewManagerConfig('EnrichedMarkdownTextInput')
    }
    if (typeof ui.getViewManagerConfig === 'function') {
      return ui.getViewManagerConfig('EnrichedMarkdownTextInput') != null
    }
  } catch {
    return false
  }
  return false
}

function loadEnriched(): { EnrichedMarkdownTextInput: ComponentType<EnrichedProps> } | null {
  if (!isNativeEnrichedLinked()) return null
  try {
    // Literal require so Metro includes the optional native module in the demo bundle.
    const mod = require('react-native-enriched-markdown') as {
      EnrichedMarkdownTextInput?: ComponentType<EnrichedProps>
    }
    if (mod?.EnrichedMarkdownTextInput) {
      return { EnrichedMarkdownTextInput: mod.EnrichedMarkdownTextInput }
    }
  } catch {
    /* optional peer — fallback TextInput if the JS package is missing */
  }
  return null
}

const ENRICHED = loadEnriched()

export function isEnrichedMarkdownAvailable(): boolean {
  return !!ENRICHED
}

const ENRICHED_HIDDEN: FormatBarConfig = {
  quote: { hidden: true },
  codeBlock: { hidden: true },
  divider: { hidden: true },
  inlineCode: { hidden: true },
}

/** Screen-px height reserved for the format bar inside the paper content box. */
export const PAGE_FORMAT_BAR_HEIGHT = 44

export interface PageRichTextEditorProps {
  blocks: DocumentBlock[]
  readonly?: boolean
  onChangeBlocks?: (blocks: DocumentBlock[]) => void
  onError?: (message: string) => void
  formatBar?: FormatBarConfig
  placeholder?: string
  /** Sheet zoom — fonts scale with the paper so overflow math matches the visible box. */
  zoom?: number
  /** Content box height in screen px (paper content rect × zoom). */
  contentBoxHeight?: number
  /**
   * Fired when measured editor content exceeds the paper content box.
   * Host should flush pending writes and reflow overflow onto the next page.
   */
  onOverflowRequest?: (measuredHeight: number, boxHeight: number) => void
}

export function PageRichTextEditor({
  blocks,
  readonly,
  onChangeBlocks,
  onError,
  formatBar,
  placeholder = 'Start writing…',
  zoom = 1,
  contentBoxHeight,
  onOverflowRequest,
}: PageRichTextEditorProps) {
  const editable = !readonly && !!onChangeBlocks
  if (ENRICHED && editable) {
    return (
      <EnrichedPageEditor
        blocks={blocks}
        onChangeBlocks={onChangeBlocks}
        onError={onError}
        formatBar={{ ...ENRICHED_HIDDEN, ...formatBar }}
        placeholder={placeholder}
        zoom={zoom}
        contentBoxHeight={contentBoxHeight}
        onOverflowRequest={onOverflowRequest}
      />
    )
  }
  return (
    <FallbackPageEditor
      blocks={blocks}
      readonly={!editable}
      onChangeBlocks={onChangeBlocks}
      onError={onError}
      formatBar={formatBar}
      placeholder={placeholder}
      zoom={zoom}
      contentBoxHeight={contentBoxHeight}
      onOverflowRequest={onOverflowRequest}
    />
  )
}

function EnrichedPageEditor({
  blocks,
  onChangeBlocks,
  onError,
  formatBar,
  placeholder,
  zoom,
  contentBoxHeight,
  onOverflowRequest,
}: {
  blocks: DocumentBlock[]
  onChangeBlocks: (blocks: DocumentBlock[]) => void
  onError?: (message: string) => void
  formatBar?: FormatBarConfig
  placeholder: string
  zoom: number
  contentBoxHeight?: number
  onOverflowRequest?: (measuredHeight: number, boxHeight: number) => void
}) {
  const Input = ENRICHED!.EnrichedMarkdownTextInput
  const ref = useRef<EnrichedInstance | null>(null)
  const [state, setState] = useState<EnrichedStyleState | null>(null)
  const [focused, setFocused] = useState(false)
  const lastMd = useRef(pageTextBlocksToMarkdown(blocks))
  const lastFp = useRef(documentBlocksFingerprint(blocks))
  const internalRef = useRef(false)
  const defaultValue = useRef(lastMd.current)

  useEffect(() => {
    const md = pageTextBlocksToMarkdown(blocks)
    const fp = documentBlocksFingerprint(blocks)
    if (fp === lastFp.current) return
    lastFp.current = fp
    if (internalRef.current && md === lastMd.current) {
      internalRef.current = false
      return
    }
    internalRef.current = false
    if (md !== lastMd.current) {
      lastMd.current = md
      ref.current?.setValue(md)
    }
  }, [blocks])

  const apply = (action: BlockFormatAction) => {
    const ed = ref.current
    if (!ed) return
    switch (action) {
      case 'bold':
        ed.toggleBold()
        return
      case 'italic':
        ed.toggleItalic()
        return
      case 'underline':
        ed.toggleUnderline()
        return
      case 'strikethrough':
        ed.toggleStrikethrough()
        return
      case 'heading1':
        ed.toggleHeading(1)
        return
      case 'heading2':
        ed.toggleHeading(2)
        return
      case 'heading3':
        ed.toggleHeading(3)
        return
      case 'bulletList':
        ed.toggleUnorderedList()
        return
      case 'numberedList':
        ed.toggleOrderedList()
        return
      case 'paragraph':
        if (state?.heading?.isActive && state.heading.level) {
          ed.toggleHeading(state.heading.level)
        } else if (state?.unorderedList?.isActive) {
          ed.toggleUnorderedList()
        } else if (state?.orderedList?.isActive) {
          ed.toggleOrderedList()
        }
        return
      case 'link':
        ed.setLink('https://')
        return
      default:
        return
    }
  }

  const z = Math.max(0.35, zoom)
  const fontSize = PAGE_DOC_FONT_SIZE * z
  const lineHeight = Math.round(fontSize * 1.45)
  const boxH = contentBoxHeight ?? 0
  const textBudget = Math.max(0, boxH - PAGE_FORMAT_BAR_HEIGHT)

  return (
    <View
      style={styles.flex}
      onLayout={(e) => {
        if (!onOverflowRequest || textBudget <= 0) return
        const h = e.nativeEvent.layout.height
        if (h > textBudget + 8) onOverflowRequest(h, textBudget)
      }}
    >
      <View style={styles.toolbar}>
        <BlockFormatBar
          disabled={!focused}
          formatBar={formatBar}
          activeType={
            state?.heading?.isActive
              ? state.heading.level === 1
                ? 'heading1'
                : state.heading.level === 2
                  ? 'heading2'
                  : 'heading3'
              : state?.unorderedList?.isActive
                ? 'bulletList'
                : state?.orderedList?.isActive
                  ? 'numberedList'
                  : 'paragraph'
          }
          marks={{
            bold: !!state?.bold?.isActive,
            italic: !!state?.italic?.isActive,
            underline: !!state?.underline?.isActive,
            strikethrough: !!state?.strikethrough?.isActive,
          }}
          onFormat={apply}
        />
      </View>
      <Input
        ref={ref}
        defaultValue={defaultValue.current}
        placeholder={placeholder}
        placeholderTextColor="#bbb"
        scrollEnabled={false}
        style={[styles.input, { fontSize, lineHeight }]}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChangeState={setState}
        onChangeMarkdown={(md) => {
          if (md.length > TEXT_MAX_CHARS) {
            onError?.(`Text exceeds ${TEXT_MAX_CHARS} characters`)
            return
          }
          const next = mergeMarkdownIntoPageDocument(blocks, md)
          lastMd.current = pageTextBlocksToMarkdown(next)
          lastFp.current = documentBlocksFingerprint(next)
          internalRef.current = true
          onChangeBlocks(validateDocumentBlocks(next))
        }}
      />
    </View>
  )
}

function FallbackPageEditor({
  blocks,
  readonly,
  onChangeBlocks,
  onError,
  formatBar,
  placeholder,
  zoom,
  contentBoxHeight,
  onOverflowRequest,
}: {
  blocks: DocumentBlock[]
  readonly: boolean
  onChangeBlocks?: (blocks: DocumentBlock[]) => void
  onError?: (message: string) => void
  formatBar?: FormatBarConfig
  placeholder: string
  zoom: number
  contentBoxHeight?: number
  onOverflowRequest?: (measuredHeight: number, boxHeight: number) => void
}) {
  const [draft, setDraft] = useState(() => pageTextBlocksToPlainLines(blocks))
  const draftRef = useRef(draft)
  const selRef = useRef({ start: 0, end: 0 })
  const [focused, setFocused] = useState(false)
  const lastFp = useRef(documentBlocksFingerprint(blocks))
  const overflowArmed = useRef(false)
  const z = Math.max(0.35, zoom)
  const fontSize = PAGE_DOC_FONT_SIZE * z
  const lineHeight = Math.round(fontSize * 1.45)
  const boxH = contentBoxHeight ?? 0
  const textBudget = Math.max(0, boxH - PAGE_FORMAT_BAR_HEIGHT)

  useEffect(() => {
    const fp = documentBlocksFingerprint(blocks)
    if (fp === lastFp.current) return
    lastFp.current = fp
    const next = pageTextBlocksToPlainLines(blocks)
    if (next !== draftRef.current) {
      setDraft(next)
      draftRef.current = next
    }
  }, [blocks])

  const commitPlain = (text: string) => {
    if (!onChangeBlocks) return
    if (text.length > TEXT_MAX_CHARS) {
      onError?.(`Text exceeds ${TEXT_MAX_CHARS} characters`)
      return
    }
    const md = text
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line) => line)
      .join('\n\n')
    const next = mergeMarkdownIntoPageDocument(blocks, md)
    lastFp.current = documentBlocksFingerprint(next)
    onChangeBlocks(next)
  }

  const apply = (action: BlockFormatAction) => {
    if (!onChangeBlocks) return
    const { start, end } = selRef.current
    const mark: InlineMark | null =
      action === 'bold'
        ? 'bold'
        : action === 'italic'
          ? 'italic'
          : action === 'underline'
            ? 'underline'
            : action === 'strikethrough'
              ? 'strikethrough'
              : action === 'inlineCode'
                ? 'code'
                : null
    if (mark && end > start) {
      const next = applyInlineMarkToPageRange(blocks, start, end, mark)
      lastFp.current = documentBlocksFingerprint(next)
      onChangeBlocks(next)
      return
    }
    const textBlocks = blocks.filter(isTextBlock)
    if (!textBlocks.length) return
    let offset = 0
    let target = 0
    for (let i = 0; i < textBlocks.length; i++) {
      const len = textBlocks[i]!.content.reduce((n, s) => n + s.text.length, 0)
      if (start <= offset + len) {
        target = i
        break
      }
      offset += len + 1
      target = i
    }
    const current = textBlocks[target]
    if (!current) return
    let type = current.type
    if (action === 'heading1' || action === 'heading2' || action === 'heading3') {
      type = type === action ? 'paragraph' : action
    } else if (action === 'bulletList' || action === 'numberedList' || action === 'quote' || action === 'codeBlock') {
      type = type === action ? 'paragraph' : action
    } else if (action === 'paragraph') {
      type = 'paragraph'
    } else if (action === 'divider') {
      type = 'divider'
    } else {
      return
    }
    const nextText = textBlocks.slice()
    nextText[target] = { ...current, type }
    const nonText = blocks.filter((b) => !isTextBlock(b))
    const next = validateDocumentBlocks([...nextText, ...nonText])
    lastFp.current = documentBlocksFingerprint(next)
    onChangeBlocks(next)
  }

  const first = blocks.find(isTextBlock)
  const marks = first
    ? {
        bold: !!first.content[0]?.bold,
        italic: !!first.content[0]?.italic,
        underline: !!first.content[0]?.underline,
        strikethrough: !!first.content[0]?.strikethrough,
        code: !!first.content[0]?.code,
        link: !!first.content[0]?.link,
      }
    : undefined

  return (
    <View style={styles.flex}>
      {onChangeBlocks && !readonly ? (
        <View style={styles.toolbar}>
          <BlockFormatBar
            disabled={!focused}
            formatBar={formatBar}
            activeType={first?.type}
            marks={marks}
            onFormat={apply}
          />
        </View>
      ) : null}
      <TextInput
        value={draft}
        editable={!readonly && !!onChangeBlocks}
        multiline
        scrollEnabled={false}
        textAlignVertical="top"
        placeholder={placeholder}
        placeholderTextColor="#bbb"
        style={[styles.input, { fontSize, lineHeight }]}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          if (draftRef.current !== pageTextBlocksToPlainLines(blocks)) {
            commitPlain(draftRef.current)
          }
        }}
        onSelectionChange={(e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
          selRef.current = e.nativeEvent.selection
        }}
        onContentSizeChange={(e: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => {
          if (!onOverflowRequest || textBudget <= 0) return
          const h = e.nativeEvent.contentSize.height
          if (h > textBudget + 8) {
            if (overflowArmed.current) return
            overflowArmed.current = true
            onOverflowRequest(h, textBudget)
            // Re-arm after layout settles from the host reflow.
            setTimeout(() => {
              overflowArmed.current = false
            }, 400)
          }
        }}
        onChangeText={(text) => {
          setDraft(text)
          draftRef.current = text
          commitPlain(text)
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minHeight: 0 },
  toolbar: { marginBottom: 4 },
  input: {
    flexGrow: 0,
    flexShrink: 0,
    minHeight: 0,
    color: '#111',
    padding: 0,
    textAlignVertical: 'top',
  },
})
