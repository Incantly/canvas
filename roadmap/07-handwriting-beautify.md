# 07 — Handwriting beautify

**Branch:** `feat/handwriting-beautify`  
**Priority:** #5 feature  
**Depends on:** [04-canvas-pen-design](./04-canvas-pen-design.md), [03-rich-text-editor](./03-rich-text-editor.md) (for output shape)

## Problem

Users write with a digital pen. The ink is messy. Incantly should offer to **beautify** — convert handwriting into clean typed text in a chosen font — keeping the SDK **lightweight** (no heavy cloud OCR by default).

This is **not** full handwriting recognition for arbitrary content extraction. It is: finish writing → beautify → readable text on the page.

## Scope

### User flow

```
1. User draws ink strokes with pen (on current page)
2. User taps "Beautify" (or auto-prompt on pen-up if setting enabled)
3. System processes ink → proposed text
4. User confirms/edits in modal
5. Ink replaced (or hidden) by rich text shape in selected font
```

### Lightweight pipeline (v1 — no MyScript)

Keep deps minimal:

1. **Segment** — group nearby strokes into a line/block (bounding box clustering)
2. **Recognize (light)** — optional tiers:
   - **Tier A (default):** user types correction in modal (ink stays as reference thumbnail) — zero ML
   - **Tier B:** browser `Handwriting Recognition API` where available (Chrome, experimental)
   - **Tier C (future opt-in):** cloud OCR / MyScript — behind feature flag, not v1 default
3. **Render** — create [`RichTextShape`](./03-rich-text-editor.md) with confirmed text + user-selected font/size
4. **Cleanup** — remove original ink shapes (undoable batch)

### Font selection

Beautify modal includes font picker (same licensed fonts as rich text doc).

### Relationship to smoothing (doc 06)

Baseline correction + PF smoothing run **before** beautify offer — cleaner ink helps user confirm text.

### Settings

```typescript
interface BeautifySettings {
  promptOnPenUp: boolean   // default false
  defaultFont: FontId
  defaultSize: SizeId
  removeInkOnConfirm: boolean  // default true
}
```

## React Native

- Entire flow inside WebView (modal + rich text output)
- Apple Pencil input already supported
- No native ML kit in v1 — Tier A (manual confirm) must work fully on RN
- Tier B: skip gracefully on iOS WebView if API unavailable
- Test: draw "hello" scribble → beautify → rich text shape on RN playground

## Playground demo

**Panel:** `HandwritingBeautifyPanel.tsx`

- Draw sample ink word
- Trigger beautify modal
- Select font ( serif / sans / mono )
- Confirm → see rich text replace ink
- Undo restores ink
- Toggle prompt-on-pen-up
- RN: identical flow

## Acceptance criteria

- [ ] Beautify flow completes without external API (Tier A)
- [ ] Output is rich text shape with chosen font
- [ ] Original ink removed/restored via undo
- [ ] No required network calls
- [ ] Playground + RN playground demo
- [ ] Document Tier B/C as future opt-in in code comments

## Out of scope

- Math handwriting → LaTeX (see doc 08 + optional Tier C later)
- Real-time recognition while drawing
- MyScript/iink-js as default dependency

## Key files

- `packages/core/src/beautify/` (new)
- [`packages/core/src/editor.ts`](../packages/core/src/editor.ts) — selection + modal trigger
- [`packages/core/src/types/models.ts`](../packages/core/src/types/models.ts)
