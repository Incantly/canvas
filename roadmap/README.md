# Incantly Canvas SDK — Roadmap

Full implementation specs for the Incantly fork of Quickdraw. Each doc is the source of truth for its feature branch.

**Workflow:** spec doc → `feat/<slug>` branch → playground demo → PR → merge

**Cross-cutting requirements (every feature):**
- **Hand-implement by default** — no new npm packages unless approved in the feature doc ([QA_CHECKLIST](./QA_CHECKLIST.md))
- Works on **web** and **React Native** (WebView)
- **Playground demo** in [`apps/playground`](../apps/playground)
- **QA gates** — agent pipeline + verifier ([QA_CHECKLIST](./QA_CHECKLIST.md), [cursor-rules](./cursor-rules.md))
- Tests in `packages/core/test/`

---

| Doc | Purpose |
|-----|---------|
| [QA_CHECKLIST.md](./QA_CHECKLIST.md) | Agent pipeline, verifier gates, hand-impl rules, error/data-risk |
| [cursor-rules.md](./cursor-rules.md) | Copy to `.cursor/rules/` — plan-mode QA, no Cursor commits, hand-implement |

## Foundation

| # | Feature | Branch | Doc |
|---|---------|--------|-----|
| 00 | Package rename | `feat/rename-incantly-canvas` | [00-rename-incantly-canvas.md](./00-rename-incantly-canvas.md) |
| 01 | Playground app | `feat/playground-app` | [01-playground-app.md](./01-playground-app.md) |
| 13 | Sync package | `feat/sync-package` | [13-sync-package.md](./13-sync-package.md) |
| 14 | Web product shell | `feat/apps-web-shell` | [14-apps-web-shell.md](./14-apps-web-shell.md) |
| 15 | Mobile product shell | `feat/apps-mobile-shell` | [15-apps-mobile-shell.md](./15-apps-mobile-shell.md) |

## Core model

| # | Feature | Branch | Doc |
|---|---------|--------|-----|
| 02 | Page-based canvas | `feat/page-based-canvas` | [02-page-based-canvas.md](./02-page-based-canvas.md) |

## Features (priority order)

| # | Feature | Branch | Doc |
|---|---------|--------|-----|
| 03 | Rich text editor | `feat/rich-text-editor` | [03-rich-text-editor.md](./03-rich-text-editor.md) |
| 04 | Canvas pen design | `feat/canvas-pen-design` | [04-canvas-pen-design.md](./04-canvas-pen-design.md) |
| 05 | Shape snapping | `feat/shape-snapping` | [05-shape-snapping.md](./05-shape-snapping.md) |
| 06 | Ink smoothing | `feat/ink-smoothing` | [06-ink-smoothing.md](./06-ink-smoothing.md) |
| 07 | Handwriting beautify | `feat/handwriting-beautify` | [07-handwriting-beautify.md](./07-handwriting-beautify.md) |
| 08 | LaTeX shape | `feat/latex-shape` | [08-latex-shape.md](./08-latex-shape.md) |
| 09 | Grid backgrounds | `feat/grid-backgrounds` | [09-grid-backgrounds.md](./09-grid-backgrounds.md) |
| 10 | Deep links | `feat/deep-links` | [10-deep-links.md](./10-deep-links.md) |
| 11 | Collaboration | `feat/collaboration` | [11-collaboration.md](./11-collaboration.md) |
| 12 | AI presence (v2) | `feat/ai-presence` | [12-ai-presence.md](./12-ai-presence.md) |

---

## Merge order

```
00 rename → 01 playground → 02 pages → 03 rich text → 04 pen
  → 05 snapping + 06 smoothing → 07 handwriting → 08 latex
  → 09 grid + 10 deep links
  → 13 sync + 14 web + 15 mobile (parallel after 00)
  → 11 collaboration → 12 ai-presence
```

## Explicit non-goals

- Layers, frames, templates
- Full document import/export beyond PNG/SVG/PDF
- Native Skia renderer (unless WebView perf fails)
- DSL compiler (separate repo)
- Heavy cloud OCR / MyScript in v1
