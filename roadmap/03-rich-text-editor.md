# 03 — Rich text editor

**Branch:** `feat/rich-text-editor`  
**Priority:** #1 feature (after pages)  
**Depends on:** [02-page-based-canvas](./02-page-based-canvas.md)

## Problem

Quickdraw supports plain multi-line text via a `<textarea>` overlay and canvas `fillText`. Incantly needs a **real typing experience** — structured, formatted, compiler-readable content on each page. This is the primary input surface for the DSL compiler.

Reference UX benchmark: [opennote.com](https://opennote.com) — rich text alongside canvas/AI features.

## Scope

### Data model

Replace `text: string` on text shapes with a structured document. Blocks for structure, spans for inline formatting:

```typescript
type BlockType =
  | 'paragraph'
  | 'heading1' | 'heading2' | 'heading3'
  | 'bulletList' | 'numberedList'
  | 'codeBlock'

interface InlineSpan {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  code?: boolean          // inline code
  link?: { href: string; title?: string }
  font?: FontId
  fontSize?: number       // px override per span
  color?: ColorId
}

interface TextBlock {
  type: BlockType
  content: InlineSpan[]   // for list blocks, one block per item OR nested blocks (pick one, document in impl)
  indent?: number
}

interface RichTextShapeProps {
  blocks: TextBlock[]
  width: number           // text box width on page
  align?: 'left' | 'center' | 'right'
  scale?: number
}
```

**Compiler requirement:** snapshot JSON must be parseable without DOM — block types and spans are first-class, not HTML strings.

Sticky notes (`note` shape) may start with simplified rich text (paragraph + spans only) or plain text migrated later.

### Text enrichments (required)

| Feature | Priority |
|---------|----------|
| Font family | Required |
| **Font size** (per block or span) | Required |
| Bold, italic | Required |
| **Underline**, strikethrough | Required |
| Headings H1/H2/H3 | Required |
| **Bullet list**, numbered list | Required |
| **Inline code** | Required |
| **Links / URLs** (clickable, editable) | Required |
| Text alignment (left/center/right) | Required |
| Markdown shortcuts (`**bold**`, `# `, `- `, `` `code` ``) | Required |
| Font picker UI | Required |

### Fonts & licensing

- Bundle fonts from **Google Fonts** with **SIL OFL** or **Apache 2.0** licenses only
- Maintain allowed-font manifest: `packages/core/src/fonts/manifest.json`
- No "personal use only" or ambiguous licenses
- Default stack: system sans + one handwriting + one mono for code

### Editing UX

Replace [`editor._startTextEdit`](../packages/core/src/editor.ts) textarea with:

- **Hand-rolled contentEditable** div with custom format handlers (no Tiptap/ProseMirror unless QA approves package exception)
- Floating **formatting toolbar** on selection (bold, size, link, list, etc.)
- **Keyboard shortcuts:** Cmd+B/I/U, Cmd+K for link
- Click existing text shape → enter edit mode at click position
- Escape / blur → commit to store

### Rendering

[`packages/core/src/shapes.ts`](../packages/core/src/shapes.ts):

- Layout pass: measure each span with `CanvasRenderingContext2D.measureText`
- Draw runs with correct weight/style/decoration
- Underline/strikethrough as line segments below text
- Inline code: mono font + subtle background pill
- Links: color + underline; click handler in editor (not in static export render)
- Lists: bullet/number prefix per item, hanging indent

Fix existing `align` bug (`left/center/right` vs `start/middle/end` mismatch).

### Toolbar

[`packages/core/src/ui.ts`](../packages/core/src/ui.ts):

- Expose font family + size in style popover
- Context toolbar appears during edit mode

## React Native

- Rich text edit runs **inside WebView** (same as today) — contentEditable works in WKWebView/Android WebView
- Bridge: no special messages unless edit state needs RN chrome (prefer web toolbar inside WebView)
- Test: type bold heading + bullet list + link on RN playground
- Verify keyboard doesn't get swallowed by WebView (existing RN component props)
- Bundle size: lazy-load editor lib if used

## Playground demo

**Panel:** `RichTextPanel.tsx`

- Insert rich text shape on page
- Demo each enrichment: H1, bold/italic/underline, bullet list, inline code, hyperlink
- Toggle font size + family
- Export snapshot JSON — verify structured blocks, not HTML
- Side-by-side: rendered canvas vs JSON tree

## Acceptance criteria

- [ ] All enrichments in table above work in edit + render
- [ ] Snapshot contains structured `blocks[]`, not HTML
- [ ] Markdown shortcuts work for common patterns
- [ ] Only licensed fonts in manifest
- [ ] Playground panel covers all enrichments
- [ ] RN playground: create formatted text, reload, persists correctly

## Out of scope

- Tables, embeds, images inline in text (future)
- Collaborative cursors in text (doc 11)
- Full Notion block nesting / toggles

## Key files

- [`packages/core/src/types/models.ts`](../packages/core/src/types/models.ts)
- [`packages/core/src/editor.ts`](../packages/core/src/editor.ts) — edit mode
- [`packages/core/src/shapes.ts`](../packages/core/src/shapes.ts) — layout + render
- [`packages/core/src/ui.ts`](../packages/core/src/ui.ts) — toolbar
- [`packages/core/src/palette.ts`](../packages/core/src/palette.ts) — font registry
