# 08 — LaTeX shape

**Branch:** `feat/latex-shape`  
**Priority:** #6 feature  
**Depends on:** [03-rich-text-editor](./03-rich-text-editor.md), [02-page-based-canvas](./02-page-based-canvas.md)

## Problem

Formulas need structured representation for the DSL compiler — not ambiguous freeform text or raw ink. **LaTeX** is the standard math notation; **KaTeX** renders it fast in the browser.

## Scope

### Shape type

```typescript
interface LatexShapeRecord extends BaseShape {
  type: 'latex'
  parentId: string   // page id
  props: {
    source: string           // raw LaTeX, e.g. "E = mc^2"
    displayMode?: boolean    // block vs inline
    color?: ColorId
    scale?: number
  }
}
```

### Rendering

- **Hand-implement** a minimal LaTeX math subset renderer (fractions, superscript/subscript, greek, `\sum`, `\frac`) in canvas — no KaTeX/MathJax unless QA approves exception
- Error state: red text with parse error for unsupported/invalid LaTeX

### Editing

- Double-click → LaTeX source editor (monospace textarea or code input)
- Live preview while editing
- Insert from rich text: `/formula` or toolbar "Insert formula"

### Compiler contract

Snapshot exports `source` string verbatim. Compiler detects patterns like `P(x) = \sum y_i \ell_i(x)` and maps to simulation nodes.

## React Native

- KaTeX runs inside WebView — same bundle as web
- Lazy-load KaTeX in RN HTML bundle ([`build-html.mjs`](../packages/react-native/scripts/build-html.mjs))
- Monitor bundle size — target <150KB gzipped for KaTeX chunk
- Bridge: `insertLatex(source)`, standard shape CRUD via store
- Test: render `E=mc^2` and fraction on RN playground

## Playground demo

**Panel:** `LatexShapePanel.tsx`

- Insert formula tool
- Edit source with live preview
- Valid + invalid LaTeX examples
- Display mode toggle (inline vs block)
- Snapshot JSON shows raw `source`
- RN: same panel

## Acceptance criteria

- [ ] LaTeX shape renders common math (fractions, sums, greek letters)
- [ ] Invalid LaTeX shows error UI, doesn't crash
- [ ] `source` in snapshot is parseable by compiler stub test
- [ ] KaTeX lazy-loaded on web + RN
- [ ] Playground + RN demo

## Out of scope

- WYSIWYG equation editor (MathLive etc.)
- Handwriting → LaTeX (future Tier C in doc 07)
- `\ce{}` chemistry (KaTeX mhchem extension — optional later)

## Key files

- [`packages/core/src/types/models.ts`](../packages/core/src/types/models.ts)
- [`packages/core/src/shapes.ts`](../packages/core/src/shapes.ts)
- [`packages/core/src/editor.ts`](../packages/core/src/editor.ts)
- `packages/core/src/latex/` (new — KaTeX loader + render)
