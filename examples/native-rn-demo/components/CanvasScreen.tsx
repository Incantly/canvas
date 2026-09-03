import { useRef } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import {
  Canvas,
  type CanvasRef,
  type Snapshot,
  type FormatBarConfig,
  type InkBarConfig,
  type InkPenDefinition,
  type VersionStorage,
} from '@incantly/canvas-react-native'

interface CanvasScreenProps {
  snapshot?: Snapshot
  formatBar?: FormatBarConfig
  inkBar?: InkBarConfig
  inkPens?: readonly InkPenDefinition[]
  versionStorage?: VersionStorage
  notebookId?: string
  documentMode?: boolean
  onReady?: (ref: CanvasRef) => void
  onError?: (message: string) => void
}

function Glyph({ children }: { children: string }) {
  return <Text style={styles.glyph}>{children}</Text>
}

/** Example host overrides — apps pass their own SVG/Image icons the same way. */
export const DEMO_FORMAT_BAR: FormatBarConfig = {
  paragraph: { name: 'Text', icon: <Glyph>T</Glyph> },
  heading1: { name: 'Heading 1', icon: <Glyph>H1</Glyph> },
  heading2: { name: 'Heading 2', icon: <Glyph>H2</Glyph> },
  heading3: { name: 'Heading 3', icon: <Glyph>H3</Glyph> },
  bulletList: { name: 'Bullet list', icon: <Glyph>•</Glyph> },
  numberedList: { name: 'Numbered list', icon: <Glyph>1.</Glyph> },
  quote: { name: 'Quote', icon: <Glyph>“</Glyph> },
  codeBlock: { name: 'Code block', icon: <Glyph>{'</>'}</Glyph> },
  divider: { name: 'Divider', icon: <Glyph>—</Glyph> },
  bold: { name: 'Bold', icon: <Glyph>B</Glyph> },
  italic: { name: 'Italic', icon: <Glyph>I</Glyph> },
  underline: { name: 'Underline', icon: <Glyph>U</Glyph> },
  strikethrough: { name: 'Strikethrough', icon: <Glyph>S</Glyph> },
  inlineCode: { name: 'Inline code', icon: <Glyph>`</Glyph> },
  link: { name: 'Link', icon: <Glyph>🔗</Glyph> },
}

/** Example host ink chrome — same icon override pattern as `formatBar`. */
export const DEMO_INK_BAR: InkBarConfig = {
  type: { icon: <Glyph>T</Glyph> },
  select: { name: 'Cursor', icon: <Glyph>↖</Glyph> },
  draw: { name: 'Ballpoint', icon: <Glyph>✎</Glyph> },
  pencil: { name: 'Pencil', icon: <Glyph>✏</Glyph> },
  highlight: { icon: <Glyph>▮</Glyph> },
  eraser: { icon: <Glyph>⌫</Glyph> },
  line: { icon: <Glyph>/</Glyph> },
  arrow: { icon: <Glyph>→</Glyph> },
  geo: { icon: <Glyph>□</Glyph> },
  hand: { icon: <Glyph>✋</Glyph> },
  text: { icon: <Glyph>Aa</Glyph> },
}

/** Built-in pens plus a pressure-sensitive pencil the host owns. */
export const DEMO_INK_PENS: InkPenDefinition[] = [
  { id: 'draw', name: 'Pen', style: { kind: 'draw', widthScale: 0.75, cap: 'round' } },
  {
    id: 'highlight',
    name: 'Highlight',
    style: { kind: 'highlight', widthScale: 4.5, opacity: 0.55, cap: 'round' },
  },
  {
    id: 'pencil',
    name: 'Pencil',
    style: {
      kind: 'draw',
      widthScale: 0.55,
      pressureWidth: true,
      pressureMin: 0.3,
      pressureMax: 1.4,
      cap: 'round',
    },
  },
]

export function CanvasScreen({
  snapshot,
  formatBar,
  inkBar,
  inkPens,
  versionStorage,
  notebookId,
  documentMode = true,
  onReady,
  onError,
}: CanvasScreenProps) {
  const ref = useRef<CanvasRef>(null)

  return (
    <View style={styles.root}>
      <Canvas
        ref={ref}
        style={styles.canvas}
        documentMode={documentMode}
        hidePagesBar
        touchUi
        snapshot={snapshot}
        formatBar={formatBar}
        inkBar={inkBar}
        inkPens={inkPens}
        versionStorage={versionStorage}
        notebookId={notebookId}
        onError={onError}
        onReady={() => {
          if (ref.current) onReady?.(ref.current)
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  canvas: { flex: 1 },
  glyph: { fontSize: 11, fontWeight: '700', color: '#333' },
})
