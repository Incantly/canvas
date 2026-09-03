# 18 — Document paper pages (discrete notes)

**Branch:** `feat/document-paper-pages`  
**Priority:** After [17-native-rn-renderer](./17-native-rn-renderer.md) document host + versions  
**Depends on:** [17-native-rn-renderer](./17-native-rn-renderer.md), [02-page-based-canvas](./02-page-based-canvas.md), partially [09-grid-backgrounds](./09-grid-backgrounds.md)

## Problem

Document mode used a **single continuous** `notebook.document.blocks[]` stream. Product needs **GoodNotes-style notes**: discrete paper pages (Page 1 / Page 2), paper sizes (A4 / Letter), paper styles (Rule / Grid / Dot), and pan/zoom around the sheet stack.

## Scope (v1)

- Discrete per-page `document.blocks`
- Paper size presets (Letter 816×1056, A4 794×1123 @ 96dpi)
- Paper style on page: `plain | ruled | grid | dots`
- Page strip: add / navigate / remove (min 1 page)
- Pan + zoom around page stack (web camera; RN zoom chips + scroll)
- Migration from continuous notebook stream → content on page 0

## Out of scope (v1)

- Pen / ink tool dock (roadmap 17 W4)
- Import / Scan / Templates
- Enriched Markdown (selection editor lives in doc 17; this doc owns paper overflow)

## Model

- Each `PageRecord` owns `document.blocks` + optional `paperStyle`
- `pageDocumentBlocks(pageId)` / `setPageDocument(pageId, …)` are page-scoped
- Compat: `notebookDocumentBlocks` / `setNotebookDocument` read/write the first page
- Schema:
  - `com.incantly.page.document` → **3** (split notebook stream onto pages)
  - `com.incantly.notebook.document` → **4** (re-split after notebook v1 re-merges on a full-from-zero migrate)

## Hand-implement

Page model, presets, paper render, chrome. No new npm beyond exceptions already in doc 17 for later ink.

## Subagent split

| Role | Work |
| --- | --- |
| Coordinator | Track core / viewport / chrome / playground |
| SpecChecker | Schema v3/v4 + presets |
| Implementer-A | Store, migration, presets, headless APIs |
| Implementer-B | Web pan/zoom + page chrome; RN page viewport |
| Implementer-C | Paper style render on sheet |
| Breaker / Fixer | Missing pageId, empty page 2, migration |
| IntegrationTester | Playground web 18 + RN `pages` scene |
| Security | Migration/storage — audit if committing |
| Verifier / Committer | PASS only; commit when user asks |

## QA

### Universal

| Gate | Status |
| --- | --- |
| `npm run typecheck` | implemented (packages + playground) |
| `npm test` | implemented (core + RN; 272 passed) |
| `npm run build:packages` | implemented |
| Playground web panel (18) | implemented (browser verified) |
| RN scene (`examples/native-rn-demo` pages) | implemented |
| Security if migration/storage touched | pending (before commit) — also review Enriched/fallback paste (256k cap, markdown parse only) |
| No Cursor in commits | n/a until commit |

### Feature rows

| Row | Status |
| --- | --- |
| Discrete pages: edit page 1 does not change page 2 | implemented |
| Migration: old continuous notebook → content on page 0; no data loss | implemented |
| Presets: Letter + A4 set width/height | implemented |
| Paper style ruled/grid/dot/plain renders (web + RN) | implemented |
| Page strip: add / navigate / remove (min 1 page) | implemented |
| Pan + zoom around page stack; sheets remain reachable | implemented |
| Error paths: missing `pageId`, empty blocks, corrupt page document | implemented |
| Drawing-region placeholder ready for 17 W4 | implemented (existing) |
| Overflow past sheet continues on the next page (create/insert if needed) | implemented (shared `applyPageDocumentOverflow`; RN Canvas after write + paper-size change) |
