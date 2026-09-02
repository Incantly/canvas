# 17 — Native React Native renderer

**Branch:** `feat/native-rn-renderer`  
**Priority:** Foundation (after mobile shell)  
**Depends on:** [15-apps-mobile-shell](./15-apps-mobile-shell.md), [16-snapshot-versioning](./16-snapshot-versioning.md), [03-rich-text-editor](./03-rich-text-editor.md)

## Problem

Today `@incantly/canvas-react-native` ships the **entire editor inside a WebView** — HTML bundle, bridge messages, and duplicated UI. That blocks native text selection, keyboard integration, accessibility, and acceptable ink latency on mobile. WebView memory and gesture conflicts (scroll vs draw) remain ongoing pain points ([15-apps-mobile-shell](./15-apps-mobile-shell.md)).

Incantly needs a **real React Native renderer**: native Markdown for text, Skia for ink and shapes, and a shared headless store layer so snapshots stay interoperable with web.

## Scope

### In scope (v1 native)

- **Document mode:** continuous notebook (`notebook.document.blocks[]`) with native Markdown text + native ink
- **Ink:** draw, highlighter, eraser on document pages (page-absolute coordinates, same `DrawingStroke.pts` format as web)
- **Basic shapes:** `line`, `arrow`, `geo` parented to page via `parentId`
- **Storage:** notebook persistence, undo/redo, version history (AsyncStorage + optional file-system offload)
- **Same `Snapshot` JSON** as web (interop + future sync per [13-sync-package](./13-sync-package.md))
- **No WebView** — native becomes the only RN renderer; remove WebView bundle pipeline

### Out of scope (v1 native)

- Freeform infinite-canvas whiteboard (camera pan/zoom over shape soup) — stays web
- Sticky notes, images, LaTeX shapes, collaboration UI
- Export PNG/SVG (`exportPng` deferred v1.1)
- WebView fallback renderer

---

## Architecture summary

**Single source of truth:** one `Store` instance per open notebook. UI is a **projection** of store state — never a second writable copy of document data.

```mermaid
flowchart TB
  subgraph host [HostApp examples/native-rn-demo]
    CanvasScreen[CanvasScreen]
    AsyncPersist[NotebookPersistence]
  end

  subgraph rnPkg [packages/react-native native]
    CanvasRef[Canvas ref API]
    DocView[DocumentScrollView]
    InkOverlay[SkiaInkOverlay]
    ShapeLayer[SkiaShapeLayer]
    ToolController[ToolController]
    StoreBridge[StoreBridge]
  end

  subgraph headless [incantly/canvas headless export]
    Store[Store]
    Migrations[migrateSnapshot]
    VersionMgr[VersionManager]
    Geometry[geometry + validation]
    MarkdownConv[blocks markdown converter]
    Utils[shared utils]
  end

  subgraph textNative [react-native-enriched-markdown]
    EMT[EnrichedMarkdownText]
    EMTI[EnrichedMarkdownTextInput]
  end

  subgraph skia [@shopify/react-native-skia]
    Canvas[Skia Canvas]
  end

  CanvasScreen --> CanvasRef
  CanvasRef --> StoreBridge
  StoreBridge --> Store
  StoreBridge --> VersionMgr
  AsyncPersist --> Store

  DocView --> EMT
  DocView --> EMTI
  DocView --> MarkdownConv
  MarkdownConv --> Store

  ToolController --> InkOverlay
  ToolController --> ShapeLayer
  InkOverlay --> Canvas
  ShapeLayer --> Canvas
  InkOverlay --> Store
  ShapeLayer --> Store

  VersionMgr --> AsyncPersist
  Store --> Migrations
```

### Three pillars

| Pillar | Package / module | Role |
|--------|------------------|------|
| **Headless export** | `@incantly/canvas/headless` | Store, migrations, version history, geometry, validation, shared utils — zero DOM imports |
| **Enriched Markdown** | `react-native-enriched-markdown` | One `EnrichedMarkdownTextInput` / `EnrichedMarkdownText` per `TextBlock`; debounced sync to store |
| **Skia** | `@shopify/react-native-skia` | Ink overlay + line/arrow/geo shape layer; commit strokes on pointer up only |

### Prerequisites

- RN **New Architecture (Fabric)** required — Enriched does not work in Expo Go
- `apps/mobile` must use **dev client / prebuild** ([15-apps-mobile-shell](./15-apps-mobile-shell.md))
- Pin `react-native-enriched-markdown@^1.0` + RN `>=0.83`

### Concurrency rules

1. All mutations via `store.transact` — never mutate snapshot objects in React state
2. `source: 'remote'` for load/revert/sync — skips undo stack
3. `createSerialQueue()` coalesces rapid `persistence.save()` to latest snapshot only
4. `createMutex()` wraps version checkpoints; skip autosave if manual checkpoint running
5. No concurrent `loadSnapshot` during user edit — `loading` flag disables Enriched inputs

---

## Workstream breakdown

| # | Workstream | Owner | Deliverable |
|---|-----------|-------|-------------|
| W1 | Headless export + shared utils | Implementer-A | `@incantly/canvas/headless`, `packages/core/src/utils/*` |
| W2 | Markdown serialize + block sync | Implementer-A | `markdown-serialize.ts`, round-trip tests |
| W3 | Document UI (Enriched) | Implementer-B | `DocumentScrollView`, text block editors, debounced sync |
| W4 | Ink overlay (Skia) | Implementer-C | `InkOverlay`, stroke session, eraser |
| W5 | Shapes (line/arrow/geo) | Implementer-D | `ShapeLayer`, shape tools + renderer |
| W6 | Storage + VersionStorage | Implementer-E | AsyncStorage persistence, `VersionStorage` adapter |
| W7 | WebView removal + build pipeline | Implementer-E | Delete `webview-entry.ts`, `build-html.mjs`; update CI |
| W8 | RN playground scenes | IntegrationTester | `examples/native-rn-demo/app/playground` document + ink + shapes scenes |

### Implementation order

1. **W1 + W2** — Headless export, shared utils, markdown serialize; unit tests green
2. **W3** — Document text POC with Enriched + AsyncStorage load/save
3. **W4** — Ink overlay + eraser
4. **W5** — Shapes + ToolController
5. **W6 + W7** — Version storage, WebView removal, build pipeline
6. **W8** — RN playground scenes + Breaker + Security + Verifier

---

## Key files

| File | Change |
|------|--------|
| `packages/core/package.json` | Add `@incantly/canvas/headless` subpath export |
| `packages/core/src/utils/*` | Shared utils: mutex, serial-queue, debounce, fingerprint, ink helpers, LRU |
| `packages/core/src/rich-text/markdown-serialize.ts` | TextBlock ↔ Markdown converter |
| `packages/core/src/index.ts` | Export headless barrel |
| `packages/react-native/src/index.tsx` | Native `<Canvas>` only |
| `packages/react-native/src/store/useCanvasStore.ts` | Store hook + listeners + dispose |
| `packages/react-native/src/store/store-bridge.ts` | Imperative `CanvasRef` methods |
| `packages/react-native/src/document/*` | Enriched wrappers, scroll layout, markdown sync |
| `packages/react-native/src/ink/*` | Skia ink overlay, stroke session, renderer |
| `packages/react-native/src/shapes/*` | Skia shape layer + tools |
| `packages/react-native/src/storage/*` | Notebook persistence + AsyncStorage version storage |
| `packages/react-native/src/utils/*` | RN hooks (debounce, rAF throttle, AppState save) |
| `packages/core/test/utils/*` | Headless util unit tests |
| `packages/core/test/markdown-serialize.test.ts` | Round-trip tests |
| `examples/native-rn-demo/app/playground/*` | Feature demo scenes (standalone Expo example) |
| **Remove:** `packages/react-native/src/webview-entry.ts`, `bridge.ts`, `board-html.generated.js`, `scripts/build-html.mjs` | WebView pipeline |

---

## Acceptance criteria

- [x] `@incantly/canvas/headless` export has zero DOM/canvas/window imports
- [x] Native `<Canvas>` renders document mode with editable markdown text blocks (TextInput POC; Enriched deferred to RN ≥0.83)
- [ ] Ink draw/highlighter/eraser commits on pointer up; coordinates match web format
- [ ] Line, arrow, geo shapes create/select/undo on native Skia layer
- [ ] Notebook snapshot persists across app restart via AsyncStorage
- [x] Version history list + revert works with persistent `VersionStorage` (SQLite, not MemoryVersionStorage)
- [ ] `CanvasRef` API parity: get/load snapshot, undo/redo, tools, pages, versions
- [ ] WebView code and `build-html.mjs` removed; `npm run build:packages` passes without HTML bundle
- [ ] RN playground scenes: document, ink, shapes, versions, persistence restart
- [ ] iOS + Android device smoke: type, draw, undo, restart persistence
- [ ] Fabric + Skia + Enriched setup documented in `apps/mobile` README
- [x] Security audit PASS — [`roadmap/security/native-rn-renderer-audit.md`](./security/native-rn-renderer-audit.md)
- [ ] Verifier PASS — QA tracking rows below + [QA_CHECKLIST](./QA_CHECKLIST.md) universal gates

---

## Non-goals (this branch)

- Freeform infinite-canvas whiteboard on native
- Image blocks, LaTeX, sticky notes, collaboration UI
- WebView fallback or parallel renderer export
- `exportPng` via Skia snapshot (v1.1)
- Server-side version sync (doc 13 / 11)

## Approved package exceptions

| Package | Status | Justification |
| --- | --- | --- |
| `react-native-enriched-markdown` | missing | Native Markdown text — Fabric text primitives not viable to hand-roll |
| `@shopify/react-native-skia` | missing | GPU ink + shape rendering |
| `react-native-reanimated` | missing | Skia gesture / UI-thread path mutation peer |
| `react-native-gesture-handler` | missing | Pointer routing peer |
| `@react-native-async-storage/async-storage` | missing | Current-notebook snapshot KV (not version blobs) |
| `expo-sqlite` | implemented | RN `VersionStorage` — transactions, indexed list, host-injected driver |

All other logic hand-implemented in `@incantly/canvas/headless` and `packages/react-native`.

| Prefer hand-rolled | Avoid |
|--------------------|-------|
| Headless utils (mutex, debounce, fingerprint, ink helpers) | Duplicate logic in RN package |
| Markdown serialize (best-effort round-trip) | Tiptap, ProseMirror in RN |
| Skia path rendering from store records | Canvas2D port in RN |
| SQLite version adapter (`createSqliteVersionStorage`) | WatermelonDB / Realm / Drizzle |

---

## QA tracking

Cross-cutting gates and subagent pipeline: **[QA_CHECKLIST.md](./QA_CHECKLIST.md)**

**Branch:** `feat/native-rn-renderer`  
**Security audit:** [`roadmap/security/native-rn-renderer-audit.md`](./security/native-rn-renderer-audit.md) (required — touches storage, paste, persistence)  
**Status values:** `missing` | `partial` | `implemented` | `deferred:<note>`

Nothing merges until **Security PASS** and **Verifier PASS**. Commits only when user explicitly asks.

### Subagent pipeline

Coordinator → SpecChecker → Implementer(s) → Breaker → Fixer → IntegrationTester → **Security** → SecurityFixer → **Verifier** → Committer

### Sub-agent spin-up template

```text
Role: <Coordinator|SpecChecker|Implementer|Breaker|Fixer|IntegrationTester|Security|SecurityFixer|Verifier|Committer>
Feature: native-rn-renderer
Branch: feat/native-rn-renderer
Read: roadmap/17-native-rn-renderer.md
Read: roadmap/QA_CHECKLIST.md
Constraints:
  - Hand-implement in @incantly/canvas/headless + packages/react-native unless doc lists approved package exception
  - No WebView — native only RN renderer
  - All store mutations via transact; remote/revert uses source: 'remote'
  - Debounced text sync; ink commits on pointer up only
  - Fabric + Skia + Enriched required; document in apps/mobile README
  - Playground RN scenes before Verifier PASS
  - npm run typecheck && npm test && npm run build:packages (no build-html.mjs)
  - Security PASS before commit (storage + paste + persistence)
  - commits: no Cursor author/Co-authored-by; only when user asks
```

### Workstream tracking

| Workstream | Status |
| --- | --- |
| W1 — Headless export + shared utils | implemented |
| W2 — Markdown serialize + block sync | implemented |
| W3 — Document UI (Enriched) | partial |
| W4 — Ink overlay (Skia) | missing |
| W5 — Shapes (line/arrow/geo) | missing |
| W6 — Storage + VersionStorage | partial |
| W7 — WebView removal + build pipeline | partial |
| W8 — RN playground scenes | partial |

### Universal verifier gates

| Check | Status |
| --- | --- |
| `npm run typecheck` all workspaces green | implemented |
| `npm test` green | implemented |
| `npm run build:packages` green (core → react-native; no `build-html.mjs`) | implemented |
| No new dependency OR exception in table above | partial |
| Playground web panel unchanged and still green | missing |
| Playground RN scenes demonstrate document + ink + shapes | partial |
| Unit tests for core/headless logic (not only happy path) | partial |
| Error paths tested (invalid input, missing page, corrupt snapshot) | partial |
| No `@ts-ignore` without `deferred:` note | implemented |
| Roadmap doc acceptance criteria all checked | partial |
| Security audit: zero Critical/High open | implemented |
| No Cursor in commits | missing |

### Headless + utils

| Check | Status |
| --- | --- |
| `@incantly/canvas/headless` export has zero DOM/canvas/window imports | implemented |
| `utils/async/mutex` + `utils/async/serial-queue` unit tested | implemented |
| `utils/snapshot/fingerprint` dedupes version autosave | implemented |
| `utils/snapshot/parse-json` returns error codes; never throws on corrupt input | implemented |
| `utils/ink/point-filter` matches web min-distance behavior | implemented |
| `utils/ink/hit-stroke` eraser hit-test matches web semantics | implemented |
| `utils/document/block-fingerprint` skips no-op `setNotebookDocument` | implemented |
| `utils/dispose/subscription-bag` clears timers + listeners | implemented |
| `utils/cache/lru` bounds Skia path cache size | implemented |
| `markdown-serialize` round-trip tests for all v1 block types | partial |

### Document + Markdown text

| Check | Status |
| --- | --- |
| One `EnrichedMarkdownTextInput` per `TextBlock`; read-only uses `EnrichedMarkdownText` | deferred:package — `TextInput` markdown editor for Expo 52 / RN 0.76; Enriched needs RN ≥0.83 |
| Debounced text sync (300ms) + flush on blur/unmount | implemented |
| `documentBlocksFingerprint` prevents redundant undo steps | implemented |
| Markdown block size cap (256KB) with user-visible `onError` | implemented |
| Remote/revert overwrites local markdown draft without crash | implemented |
| Bold, italic, headings, lists, links round-trip through markdown serialize | partial |
| Lossy fields (`font`, `fontSize`, `color`) documented; structured spans remain canonical | partial |
| VoiceOver (iOS) + TalkBack (Android) on text blocks | missing |

### Ink + pen

| Check | Status |
| --- | --- |
| Strokes commit to store on pointer up only — not per move | missing |
| rAF-throttle drops intermediate pointer events; keeps last per frame | missing |
| In-flight stroke uses SkPath/Reanimated — no React re-render per point | missing |
| Page-absolute coordinates match web `DrawingStroke.pts` format | missing |
| `consolidateDocumentBlocks` — single trailing drawing block | missing |
| Draw + highlighter + eraser tools functional | missing |
| Eraser uses `hitDocumentStroke` from headless utils | missing |
| Stroke point soft cap (50k) enforced with graceful simplify | missing |
| Stylus + finger tested on iOS and Android | missing |

### Shapes (line, arrow, geo)

| Check | Status |
| --- | --- |
| Create line/arrow/geo via tap-drag; stored as page-child `ShapeRecord` | missing |
| Select tool: tap to select; drag to move (v1 bbox) | missing |
| Skia z-order: shapes below ink overlay, above paper | missing |
| Undo/redo restores shape create/update/delete | missing |
| Hit testing uses headless `geometry` bounds helpers | missing |

### Storage + versioning

| Check | Status |
| --- | --- |
| `migrateSnapshot` on every notebook load | missing |
| Corrupt AsyncStorage JSON → `onError` + empty doc; no redbox | missing |
| AsyncStorage quota exceeded handled; in-memory store retained | missing |
| `createSerialQueue` coalesces rapid saves to latest snapshot | missing |
| `createMutex` prevents overlapping version checkpoints | implemented |
| `VersionStorage` persists across app restart (not MemoryVersionStorage) | implemented |
| Autosave dedupes via snapshot fingerprint | implemented |
| Prune respects `maxVersions=15` and `maxStorageMb=50` | partial |
| Revert uses `loadSnapshot(..., 'remote')`; pre-revert checkpoint optional | implemented |
| `AppState` background triggers save + autosave checkpoint | missing |
| Large version blobs (>1MB) offloaded to file-system | deferred:v1.1 — document if not implemented |
| No secrets/PII in storage keys or snapshot payloads | missing |

### Error checking + data risk

| Check | Status |
| --- | --- |
| `validateDocumentBlocks` before every `setNotebookDocument` | missing |
| All store mutations via `transact`; no direct snapshot mutation in React state | missing |
| Remote/sync/revert diffs use `source: 'remote'` (skip undo) | missing |
| No concurrent `loadSnapshot` while user is editing (`loading` flag) | missing |
| Clipboard paste validated before `store.put` | missing |
| Snapshot migrations forward-only; never silently drop records | missing |
| Invalid page id / drawing block index throws in dev; safe in prod UI | missing |

### CanvasRef API + WebView removal

| Check | Status |
| --- | --- |
| `getSnapshot` / `loadSnapshot` / `undo` / `redo` work via StoreBridge | implemented |
| `setTool` / `setStyle` / page navigation methods work | partial |
| `listVersions` / `revertVersion` / `saveVersion` work natively | implemented |
| WebView code, `bridge.ts`, `build-html.mjs` removed | partial |
| `react-native-webview` removed from peer deps | implemented |
| Consumer migration notes in package README (Fabric + Skia + Enriched setup) | missing |
| `exportPng` | deferred:v1.1 — Skia snapshot export |

### Playground demo

| Check | Status |
| --- | --- |
| Web `apps/playground` — unchanged; regression smoke | missing |
| RN `examples/native-rn-demo/app/playground` — document mode scene | implemented |
| RN playground — ink draw + eraser scene | partial |
| RN playground — line/arrow/geo scene | partial |
| RN playground — version history list + revert scene | implemented |
| RN playground — persistence restart scene (kill app, reload) | partial |

### Performance + memory

| Check | Status |
| --- | --- |
| Ink: profiler shows no React commit per pointer move | missing |
| 30min session: remount `<Canvas>` 10× — no listener/timer leak | missing |
| 20 strokes + 10 page navigations — heap stable | missing |
| Version autosave async — does not block UI thread | missing |
| LRU path cache evicts; rebuilds from `pts` on cache miss | missing |
| All stateful utils + hooks call `dispose()` on unmount | missing |

### Breaker adversarial cases

| Case | Status |
| --- | --- |
| Load corrupt snapshot JSON from AsyncStorage | missing |
| Rapid type + draw simultaneously (debounce vs ink commit race) | missing |
| Double-tap revert while autosave in flight | missing |
| Empty notebook → add text → add ink → kill app mid-save → reload | missing |
| Markdown paste >256KB rejected gracefully | missing |
| Invalid drawing block index in store — eraser does not crash | missing |
| Concurrent `save()` + `loadSnapshot()` — serial queue prevents corrupt write | missing |
| Undo 256+ steps — stack cap respected | missing |

### Security (required before commit)

| Check | Status |
| --- | --- |
| Audit doc `roadmap/security/native-rn-renderer-audit.md` exists | missing |
| No secrets in bundle, snapshots, or AsyncStorage keys | missing |
| Paste payload schema validated; no arbitrary HTML injection into store | missing |
| Version list responses minimize data (summaries only in UI) | missing |
| File-system version blobs path-traversal safe | missing |
| Zero open Critical/High findings | missing |

### Browser / device teardown

| Check | Status |
| --- | --- |
| After Playwright/Chromium QA: `browser.close()` — do not kill user Chrome | missing |
| Native Canvas: dispose VersionManager + subscription bag on unmount | missing |
| No WebView heap (WebView removed) | missing |

### Before commit

| Check | Status |
| --- | --- |
| Verifier PASS — all required rows `implemented` or explicit `deferred:` | missing |
| Security PASS | missing |
| No Cursor author / committer / Co-authored-by | missing |
| User explicitly requested commit | missing |

### Per-feature gate

- [ ] Coordinator launched workstreams (W1–W8 tracked)
- [ ] SpecChecker PASS — hand-impl confirmed; package exceptions documented above
- [ ] Implementer(s) finished assigned workstreams
- [ ] Breaker pass (or failures filed then fixed)
- [ ] Fixer loop complete if needed
- [ ] IntegrationTester — playground web + RN smoke PASS
- [ ] **Security PASS** — `roadmap/security/native-rn-renderer-audit.md`; zero Critical/High open
- [ ] SecurityFixer complete if Critical/High found
- [ ] **Verifier PASS** — all rows above + universal gates green
- [ ] Playground RN scenes merged and listed in feature index
- [ ] Committer: author is not Cursor; no Co-authored-by trailers

---

## Key risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Markdown ↔ blocks lossy | Structured spans canonical; markdown is edit view; tests for round-trip |
| Enriched requires Fabric | Document in mobile README; CI uses dev client build |
| Large snapshot AsyncStorage limits | File-system offload for versions; prune aggressively |
| Shape + doc z-order bugs | Explicit layer order; golden screenshot tests later |
| Web/RN feature drift | Shared headless store + same Snapshot schema; web remains reference for advanced features |
