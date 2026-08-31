# 10 — Deep links

**Branch:** `feat/deep-links`  
**Priority:** #8 feature  
**Depends on:** [03-rich-text-editor](./03-rich-text-editor.md), [08-latex-shape](./08-latex-shape.md)

## Problem

Notebooks contain related content — a formula in text linking to its live simulation, or a note pointing to a diagram. Users need **in-notebook navigation** without leaving the app.

## Scope

### Link types

**Inline (rich text):** extend link span from doc 03:

```typescript
link?: {
  href: string              // external URL
  internal?: {
    shapeId: string         // target shape on any page
    pageId?: string         // optional page hint
  }
}
```

**Standalone link shape (optional):** arrow/label pointing to target.

### Navigation behavior

Click internal link:

1. If target on different page → `editor.setPage(pageId)`
2. `editor.select([shapeId])`
3. `editor.zoomToFit([shapeId], { animate: 300 })`
4. Brief highlight pulse on target

### URL scheme (web app)

```
/notebook/:notebookId#page/:pageId/shape/:shapeId
```

[`apps/web`](./14-apps-web-shell.md) parses hash on load and navigates.

### RN deep links

```
incantly://notebook/:id#page/:pageId/shape/:shapeId
```

Expo linking config in [`apps/mobile`](./15-apps-mobile-shell.md).

### Compiler integration

Compiler can emit `internal` links when generating simulations from LaTeX/text patterns.

## React Native

- Link click handled in WebView; postMessage to RN if parent chrome needs to update nav bar
- Expo Linking opens notebook at shape
- Test: tap link on page 1 → jumps to shape on page 3

## Playground demo

**Panel:** `DeepLinksPanel.tsx`

- Two pages: formula on page 1, diagram on page 2
- Insert internal link in rich text
- Click → navigates + highlights
- Copy deep link URL; paste in new tab → opens at shape
- RN: universal link test

## Acceptance criteria

- [ ] Internal links navigate cross-page
- [ ] External URLs open in new tab / RN browser
- [ ] URL hash restores position on load
- [ ] Links persist in rich text snapshot
- [ ] Playground + RN demo

## Out of scope

- Cross-notebook links
- Backlink panel / graph view

## Key files

- [`packages/core/src/editor.ts`](../packages/core/src/editor.ts) — navigation
- Rich text link handler (doc 03)
- [`apps/web`](../apps/web) — URL routing
- [`apps/mobile`](../apps/mobile) — Expo linking
