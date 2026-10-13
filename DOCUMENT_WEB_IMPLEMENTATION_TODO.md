# Incantly Document Web Implementation Checklist

**Branch:** `codex/document-web-foundation`
**Status:** Implementation in progress; Milestones 1–6 and Milestone 7.1 complete
**Scope:** Shared document model in `packages/core` and the React web document editor in `packages/react`
**Out of scope:** New React Native document UI, the future document WebView bridge, Liveblocks production integration, and DOCX/PDF import. Export is planned below as a separate, model-driven pipeline.

## How this checklist must be maintained

This file is the live implementation tracker for the branch, not a checklist that is updated only when the work is finished.

- Mark each item from `[ ]` to `[x]` immediately after that individual item is implemented and verified.
- Do not mark an item complete merely because code was written; its relevant test, build, or manual playground check must also pass.
- Do not mark an entire milestone complete in bulk without verifying its individual items.
- When an item changes during implementation, update its wording before marking it complete so the checklist describes what was actually delivered.
- If an item is intentionally deferred, leave it unchecked and add a short dated explanation plus the destination milestone or issue.
- If implementation reveals a new required task, add it to the appropriate milestone before doing the work.
- At every meaningful commit, the checkbox state must match the code in that commit.
- The pull request description must link to this file and summarize completed, deferred, and unresolved items.
- The Vite document playground described below must be updated alongside each user-visible editor feature so completed behavior can be tested interactively.

## 1. Outcome of this branch

This branch will establish the first production-quality Incantly document implementation for the web without coupling the document to the spatial canvas.

At completion:

- `packages/core` owns a framework-independent, versioned document model.
- `packages/react` owns a standalone Tiptap/ProseMirror `DocumentEditor`.
- The canonical stored form is Incantly JSON, not HTML and not undocumented Tiptap state.
- Core schemas, commands, operations, validation, normalization, and migrations run without React or DOM APIs.
- The React editor maps losslessly between the Incantly model and ProseMirror.
- Canvas and document exports are split so canvas-only applications do not load Tiptap.
- The initial editor supports continuous writing, core formatting, basic rich blocks, controlled state, and autosave hooks.
- Page layout is stored portably, live web pagination is an adapter over core layout contracts, and generated page boundaries never become canonical content.
- TXT, Markdown, HTML, PDF, and DOCX exports originate from the canonical model and report lossy conversions.
- Fixtures and tests prove that content round-trips without semantic loss.

This branch is the foundation for the later React Native implementation. React Native will reuse the core types and behavior rather than importing the React editor or Tiptap UI directly.

## 2. Architectural rules

- Do not add React, Tiptap, ProseMirror view code, DOM APIs, or Liveblocks hooks to `packages/core`.
- Do not make HTML the persistence format.
- Do not reuse the removed `PageDocumentRecord` or canvas `page-document` modules as the new document model.
- The legacy Canvas `documentMode`, page-document, rich-text document, and notebook-document implementations were removed during milestone 5.4. Positioned canvas text remains a separate canvas-only model.
- Do not let application-specific navigation, authentication, or product toolbar layout enter the reusable SDK.
- Do not make collaboration a requirement for local editing.
- Do not put binary images, PDFs, audio, or DOCX data inside document JSON.
- Do not add Tiptap to the root React entry point if doing so makes canvas-only consumers load it.
- Keep node IDs stable through editing, serialization, synchronization, and migrations.
- Every external or persisted document must pass validation and normalization before use.

## 3. Target package structure

```text
packages/core/src/document/
├── index.ts
├── types.ts
├── constants.ts
├── ids.ts
├── schema.ts
├── validate.ts
├── normalize.ts
├── create.ts
├── operations.ts
├── transactions.ts
├── commands.ts
├── selection.ts
├── repositories.ts
├── assets.ts
├── serialize.ts
├── limits.ts
├── layout/
│   ├── types.ts
│   ├── units.ts
│   ├── pageFormats.ts
│   ├── measurement.ts
│   └── paginate.ts
├── export/
│   ├── types.ts
│   ├── project.ts
│   ├── text.ts
│   ├── markdown.ts
│   └── html.ts
└── migrations/
    ├── index.ts
    └── v1.ts

packages/react/src/canvas/
├── Canvas.tsx
├── useCanvasStore.ts
└── index.ts

packages/react/src/document/
├── index.ts
├── DocumentEditor.tsx
├── types.ts
├── createEditor.ts
├── schema/
│   ├── extensions.ts
│   ├── nodeIds.ts
│   └── contentRules.ts
├── adapters/
│   ├── fromIncantlyDocument.ts
│   ├── toIncantlyDocument.ts
│   └── adapterReport.ts
├── commands/
│   ├── executeDocumentCommand.ts
│   └── queryDocumentState.ts
├── plugins/
│   ├── pasteSanitizer.ts
│   ├── transactionOrigin.ts
│   └── stableNodeIds.ts
├── pagination/
│   ├── WebMeasurementAdapter.ts
│   ├── PaginationPlugin.ts
│   ├── PageLayout.tsx
│   └── PageSettings.tsx
├── export/
│   ├── createPrintSnapshot.ts
│   ├── renderPagedPreview.ts
│   └── printToPdf.ts
├── components/
│   ├── DocumentContent.tsx
│   ├── DocumentToolbar.tsx
│   ├── BubbleToolbar.tsx
│   └── SlashMenu.tsx
├── hooks/
│   ├── useDocumentEditor.ts
│   └── useDocumentEditorState.ts
└── document.css

examples/document-web-demo/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── demoDocument.ts
    ├── demoAssetRepository.ts
    └── styles.css
```

An optional `packages/document-export` package may contain heavy, dynamically loaded DOCX/ZIP dependencies. Its public API must depend on `packages/core`, not React or a mounted editor.

The final filenames can change during implementation when the code demonstrates a simpler boundary, but the ownership boundaries above must remain.

## 4. Milestone 0 — protect the current repository

- [ ] Record the current test, typecheck, and build baseline before dependency changes.
- [ ] Confirm supported TypeScript, React, Node.js, and browser versions.
- [ ] Confirm whether React 17 remains the intended minimum peer version for the React SDK.
- [ ] Record the current package sizes for `@incantly/canvas` and `@incantly/canvas-react`.
- [ ] Add document-specific test fixture directories without changing existing canvas fixtures.
- [ ] Ensure existing canvas, page-document, notebook, migration, and React tests stay green.
- [ ] Document any pre-existing failure separately; do not hide it by weakening tests.

**Exit criterion:** a reproducible baseline exists and no document work has changed current behavior.

## 5. Milestone 1 — canonical core document model

### 5.1 Document envelope and metadata

- [x] Define `IncantlyDocument` with `schemaVersion`, `id`, `type`, `metadata`, `content`, and timestamps where required.
- [x] Define `DocumentMetadata`, title, language, authors, tags, page setup, and optional research metadata.
- [x] Define `PageSetup` independently from the canvas page model.
- [x] Define stable branded identifiers for documents, nodes, assets, comments, and citations where useful.
- [x] Provide `createDocument`, `createParagraph`, and safe ID-generation helpers.
- [x] Define a single current document schema version constant.

### 5.2 Inline content and marks

- [x] Define text nodes and hard breaks.
- [x] Define bold, italic, underline, strike, inline-code, link, text-color, highlight, citation, and inline-math marks.
- [x] Specify which mark combinations are valid.
- [x] Normalize adjacent text nodes with identical marks.
- [x] Reject or safely normalize empty, malformed, or unsupported marks.
- [x] Restrict link protocols and normalize link attributes.

### 5.3 Initial block nodes

- [x] Paragraph.
- [x] Heading levels 1–6.
- [x] Blockquote.
- [x] Bullet list, ordered list, list item, checklist, and checklist item.
- [x] Horizontal rule.
- [x] Code block with optional language.
- [x] Math block with LaTeX source.
- [x] Table, row, header cell, and body cell.
- [x] Image reference.
- [x] Generic file attachment reference.
- [x] Audio reference.
- [x] Video embed with provider allowlist.
- [x] PDF embed reference.
- [x] Canvas embed reference.
- [x] Explicit page break.

For every node:

- [x] Define required and optional attributes.
- [x] Define allowed child content.
- [x] Define nesting limits.
- [x] Define normalization behavior.
- [x] Define its unsupported-content fallback.
- [x] Define plain-text extraction behavior.

### 5.4 Asset contracts

- [x] Define `AssetRecord` and `AssetMetadata` without browser-only `File` requirements.
- [x] Store only `assetId` and display metadata in document nodes.
- [x] Define framework-neutral `AssetRepository` methods.
- [x] Define framework-neutral `DocumentRepository` methods for snapshots and updates.
- [x] Define content-addressing and deduplication expectations without implementing server storage.

**Exit criterion:** a complete initial document can be represented using plain TypeScript data and no platform imports.

## 6. Milestone 2 — validation, normalization, and security

- [x] Implement runtime validation for the document envelope, metadata, nodes, marks, and attributes.
- [x] Return structured validation issues with paths and error codes.
- [x] Distinguish strict validation from safe normalization/recovery.
- [x] Enforce maximum document depth, node count, text length, table size, URL length, and attribute size.
- [x] Enforce node-specific child rules.
- [x] Enforce unique node IDs and repair duplicates during explicit recovery only.
- [x] Remove unknown executable attributes and reject inline event handlers.
- [x] Restrict external URLs to explicit schemes and providers.
- [x] Validate colors, dimensions, language identifiers, MIME types, and filenames.
- [x] Preserve unsupported imported content through explicit fallback records or import reports instead of silently deleting it.
- [x] Add hostile-input tests for deep nesting, oversized tables, invalid URLs, duplicate IDs, prototype-pollution-shaped objects, and unknown nodes.

**Exit criterion:** untrusted JSON cannot reach the React editor without deterministic validation or a reported recovery path.

## 7. Milestone 3 — serialization and migrations

- [x] Implement deterministic JSON serialization.
- [x] Confirm serialization never includes functions, DOM references, Tiptap instances, or binary asset bodies.
- [x] Implement `parseIncantlyDocument` with schema-version detection.
- [x] Implement forward-only migration orchestration.
- [x] Add the initial v1 migration boundary even if no older standalone document format exists yet.
- [x] Define a later migration adapter boundary for legacy canvas `PageDocumentRecord` data without implementing destructive removal.
- [x] Create representative golden fixtures for every supported node and mark.
- [x] Test parse → normalize → serialize stability.
- [x] Test current JSON → migration pipeline → current JSON.
- [x] Verify fixtures in Node and browser test environments.

**Exit criterion:** persisted documents have a documented, stable, versioned contract independent of Tiptap.

## 8. Milestone 4 — operations, transactions, and commands

### 8.1 Operations and transactions

- [x] Define typed insert, update, move, delete, and text-replacement operations.
- [x] Define asset-reference operations.
- [x] Define `DocumentTransaction` with ID, document ID, origin, timestamp, and operations.
- [x] Define transaction origins: user, remote, AI, import, migration, and system.
- [x] Implement atomic operation application with rollback on invalid output.
- [x] Return a structured result containing changed node IDs and validation issues.
- [x] Define transaction batching limits for large import and AI operations.

### 8.2 Shared commands

- [x] Define serializable command payloads, separate from Tiptap command functions.
- [x] Add commands for paragraphs, headings, marks, lists, checklists, blockquotes, dividers, code, math, tables, media references, attachments, and page breaks.
- [x] Add commands for indentation, alignment, deletion, replacement, and page setup.
- [x] Define command capability/query results so toolbars can enable and disable actions.
- [x] Ensure command behavior is deterministic when invoked outside React.
- [x] Test commands against fixtures without mounting a browser editor.

### 8.3 Selection contract

- [x] Define a portable selection description suitable for toolbar state, AI operations, and a future React Native bridge.
- [x] Keep ProseMirror numeric positions internal to the adapter where possible.
- [x] Define mapping failures explicitly when content changes invalidate a selection.

**Exit criterion:** application code can describe edits through core commands and transactions without mutating JSON directly.

## 9. Milestone 5 — package exports and dependency boundaries

- [x] Export the document model through `@incantly/canvas/document`.
- [x] Export the portable subset through `@incantly/canvas/headless` where appropriate.
- [x] Preserve current root exports for compatibility.
- [x] Add `@incantly/canvas-react/canvas` as the explicit canvas-only React entry point.
- [x] Add `@incantly/canvas-react/document` as the isolated document entry point reserved for the Milestone 6 Tiptap adapter.
- [x] Keep the root React export canvas-only for bundle compatibility while preserving its existing core re-exports.
- [x] Configure package `exports`, declaration output, CSS exports, and `sideEffects` correctly.
- [x] Add an import test proving core document modules do not touch `window` or `document`.
- [x] Add a bundle inspection proving the canvas subpath does not include Tiptap/ProseMirror.

**Exit criterion:** consumers can install one SDK but import canvas and document implementations independently.

## 10. Milestone 6 — Tiptap/ProseMirror adapter

### 10.1 Dependencies and schema

- [x] Add pinned compatible versions of Tiptap core, React integration, StarterKit, and only the extensions required by the first milestone.
- [x] Add Yjs-related dependencies only when collaboration work begins; do not include them accidentally in the first local editor bundle.
- [x] Build an explicit Tiptap extension list matching the Incantly v1 schema.
- [x] Disable or replace StarterKit behavior that conflicts with canonical rules.
- [x] Implement stable node-ID attributes and repair rules.
- [x] Define content expressions that mirror core nesting rules.
- [x] Ensure tables, lists, checklists, code, math, links, images, attachments, and page breaks have intentional schemas.

### 10.2 Bidirectional conversion

- [x] Convert an `IncantlyDocument` to valid ProseMirror JSON.
- [x] Convert ProseMirror JSON back to an `IncantlyDocument`.
- [x] Keep Incantly node IDs unchanged.
- [x] Produce an adapter report for unsupported or repaired content.
- [x] Never silently emit raw HTML into the canonical model.
- [x] Add round-trip fixtures for every supported node, nesting combination, and mark combination.
- [x] Test `Incantly → ProseMirror → Incantly` semantic equality.
- [x] Test `ProseMirror → Incantly → ProseMirror` for all supported editor constructs.

### 10.3 Transaction mapping

- [x] Tag Tiptap transactions with a typed origin.
- [x] Translate editor changes into canonical document change events.
- [x] Avoid reparsing and emitting the entire document on every keystroke where incremental information is available.
- [x] Define when a full canonical checkpoint is produced.
- [x] Preserve undo/redo semantics without putting transient history in document JSON.

**Exit criterion:** Tiptap is a replaceable editing adapter and cannot introduce unrecognized persisted structures silently.

## 11. Milestone 7 — standalone React `DocumentEditor`

### 11.1 Component API

- [x] Define `DocumentEditorProps` and `DocumentEditorRef`.
- [x] Support uncontrolled initialization with `initialDocument`.
- [x] Support a clearly documented controlled mode without recreating the editor on every change.
- [x] Add `readonly`, `autofocus`, `editable`, `className`, `style`, and accessibility properties.
- [x] Add `onReady`, `onChange`, `onTransaction`, `onSelectionChange`, `onValidationIssue`, and `onError` callbacks.
- [x] Expose imperative focus, blur, command execution, state query, get-document, replace-document, and destroy-safe methods.
- [x] Define behavior when the document ID or schema version changes.
- [x] Do not recreate the Tiptap editor for ordinary prop or toolbar changes.

### 11.2 Continuous writing experience

- [x] Render one continuous writing surface without visible Notion-style block cards.
- [x] Provide readable content width, typography, selection colors, focus states, and mobile-responsive spacing.
- [x] Support cross-paragraph selection and native browser keyboard behavior.
- [x] Add placeholders without persisting them.
- [x] Add light and dark theme variables without coupling to the canvas theme implementation.
- [x] Keep the editor usable with its toolbar hidden or replaced.

### 11.3 Formatting UI

- [x] Provide a default toolbar as an optional reusable primitive.
- [x] Allow the host application to place or replace the toolbar completely.
- [x] Add a selection/bubble toolbar for contextual marks.
- [x] Add slash-command primitives with host-overridable rendering and commands.
- [x] Keep toolbar state subscribed through narrow selectors rather than rerendering on every transaction.
- [x] Ensure all commands have keyboard and accessible button equivalents where applicable.

### 11.4 Initial feature set

- [x] Paragraph and headings.
- [x] Bold, italic, underline, strike, inline code, links, highlights, and text color.
- [x] Bullet lists, numbered lists, nested lists, and checklists.
- [x] Blockquotes and horizontal rules.
- [x] Code blocks.
- [x] Math blocks and inline math, with rendering kept incremental.
- [x] Tables with basic row/column actions.
- [x] Images and attachment cards using asset references.
- [x] Audio, PDF, Word, YouTube, and canvas embeds as safe cards/placeholders in the first milestone.
- [x] Explicit page breaks represented semantically even in continuous mode.
- [x] Undo and redo.

**Exit criterion:** a host React application can render and edit a standalone Incantly document without creating a Canvas instance.

## 12. Milestone 8 — composable page layout and web pagination

Paged editing must be built as an Incantly capability, not as Tiptap-specific stored state. Tiptap/ProseMirror remains the web editing adapter. Paged.js is not used inside the live editable DOM because its generated page fragments would conflict with editor selection, transactions, and node identity.

### 12.1 Canonical layout and section model

- [ ] Add a versioned page-layout model to `packages/core`, with continuous and paginated presentation modes.
- [ ] Store physical page width, height, margins, header distance, and footer distance in points; convert cm, mm, inches, and CSS pixels only at UI boundaries.
- [ ] Provide presets for A4, Letter, Legal, and other approved formats plus validated custom dimensions.
- [ ] Model portrait/landscape orientation without destructively rewriting the selected preset.
- [ ] Add document defaults and explicit section boundaries so page setup can later vary within one document.
- [ ] Store only explicit user-created page/section breaks; never persist calculated automatic page boundaries.
- [ ] Model default, first-page, odd-page, and even-page header/footer variants as canonical Incantly document fragments.
- [ ] Model page number, total page count, document title, date, and similar header/footer fields semantically rather than as frozen text.
- [ ] Keep editor zoom, page gap, ruler visibility, and “link margins” UI state outside the canonical document.
- [ ] Add validation, normalization, migration, serialization, and hostile-input limits for all layout records.
- [ ] Add core fixtures covering custom paper, mirrored margins, headers/footers, explicit breaks, and multiple sections.

### 12.2 Portable pagination contracts

- [ ] Define framework-independent measurement input/output types in core for blocks, line fragments, intrinsic media size, keep rules, and available page regions.
- [ ] Define a deterministic pagination result containing derived page ranges, overflow diagnostics, and layout warnings without mutating the document.
- [ ] Support keep-with-next, keep-lines-together, widows/orphans, explicit breaks, unbreakable blocks, tables, media, and header/footer reserved space incrementally.
- [ ] Make the pagination algorithm consume injected measurements so the web DOM adapter and a future native adapter can share the same decisions.
- [ ] Give every calculated page and fragment a stable derivation key for caching and debugging, not a persisted document ID.
- [ ] Add invalidation ranges so edits repaginate from the earliest affected block rather than from page one.
- [ ] Specify fallback behavior and warnings for content that cannot fit on a page.
- [ ] Add deterministic core tests using synthetic measurements, independent of browser font rendering.

### 12.3 Live web pagination adapter

- [ ] Build a ProseMirror plugin that observes transactions and schedules measurement after DOM layout without serializing the whole document.
- [ ] Measure through DOM ranges and ProseMirror position mapping while preserving native selection, IME composition, drag selection, and undo history.
- [ ] Render page chrome, gaps, and calculated break markers as decorations/layout UI that never enter canonical content.
- [ ] Keep the editable ProseMirror content authoritative and avoid splitting one logical document into independent editor instances per page.
- [ ] Reuse cached measurements until content, width, font, zoom, asset dimensions, or section setup invalidates them.
- [ ] Reflow when web fonts and intrinsic asset sizes become ready, with scroll/caret anchoring to avoid visual jumps.
- [ ] Virtualize page chrome and heavy previews for distant pages without unmounting editable text required by ProseMirror.
- [ ] Add a continuous/paginated toggle that changes presentation without rewriting document content.
- [ ] Verify long selections, copy/paste, keyboard navigation, find-in-page, accessibility, and browser zoom across calculated page boundaries.

### 12.4 Page settings and header/footer design

- [ ] Add a composable `PageSettings` primitive for preset/custom dimensions, units, orientation, margins, linked margins, and header/footer spacing.
- [ ] Provide host-overridable controls and commands rather than baking product-specific dialogs into `DocumentEditor`.
- [ ] Validate impossible dimensions and show actionable errors before applying a transaction.
- [ ] Add reusable header/footer editing surfaces tied to the active section and selected variant.
- [ ] Display non-printing boundaries and safe areas without putting them in exported content.
- [ ] Add page-number insertion and starting-number controls with accessible keyboard operation.
- [ ] Expose layout-change events and typed commands for custom application UI.

### 12.5 Performance and cross-platform boundary

- [ ] Establish budgets for keystroke-to-paint, incremental repagination, full initial pagination, memory, and layout shift at 10, 100, and 500 pages.
- [ ] Move pure pagination work off the input path and use idle/chunked scheduling where browser measurement is not required.
- [ ] Ensure `packages/core` pagination imports without DOM, React, Tiptap, or Paged.js.
- [ ] Document how the same web bundle and paginator can run offline in a future React Native WebView.
- [ ] Document the future native measurement-adapter contract without claiming pixel-identical layout across different font engines.
- [ ] Add a paginated playground fixture with page settings, headers/footers, explicit breaks, long tables, images, and diagnostic overlays.

**Exit criterion:** the web editor offers usable paginated presentation while the canonical model and pagination decisions remain portable to a future React Native adapter.

## 13. Milestone 9 — export pipeline and Paged.js print rendering

Exports must be projections from validated Incantly content. They must not scrape the live editor DOM, and every lossy or unsupported conversion must be visible to the caller.

### 13.1 Shared export contracts

- [ ] Define `ExportFormat`, `ExportOptions`, `ExportResult`, progress, cancellation, warnings, and structured loss-report contracts in core.
- [ ] Build a normalized export projection from the canonical model so exporters share traversal, asset lookup, numbering, and fallback behavior.
- [ ] Inject asset and font resolvers; never require embedded binary data in document JSON.
- [ ] Define runtime-neutral byte/text output types with thin browser `Blob` and React Native filesystem adapters.
- [ ] Make filenames, MIME types, encoding, locale, time zone, and deterministic metadata explicit options.
- [ ] Sanitize links, embeds, HTML, filenames, and externally resolved assets before export.
- [ ] Ensure heavy exporters are dynamically imported and absent from the default editor/canvas bundle.

### 13.2 TXT export

- [ ] Export UTF-8 plain text with predictable paragraph, list, checklist, table, code, equation, and attachment fallbacks.
- [ ] Allow LF or CRLF line endings and optional front matter/metadata.
- [ ] Report formatting, media, layout, and rich-structure loss.
- [ ] Add golden fixtures for Unicode, RTL text, code, tables, lists, and attachments.

### 13.3 Markdown export

- [ ] Export CommonMark-compatible Markdown with documented extensions for tables, task lists, math, footnotes, and front matter.
- [ ] Preserve fenced-code languages, link targets, asset references, and explicit page breaks through defined conventions.
- [ ] Provide configurable unsupported-node fallbacks: omit, plain text, HTML, or warning placeholder.
- [ ] Add Markdown round-trip tests where the supported subset is expected to be lossless.

### 13.4 HTML export

- [ ] Produce standalone semantic HTML from the export projection without mounting Tiptap.
- [ ] Generate print CSS from canonical page and section setup using CSS Paged Media rules where supported.
- [ ] Support self-contained or external asset strategies with explicit size/security limits.
- [ ] Keep interactive editor UI, selection decorations, comments, upload state, and pagination diagnostics out of output.
- [ ] Add accessibility and sanitization tests for exported HTML.

### 13.5 Paged.js preview and PDF workflow

- [ ] Pin and review the MIT-licensed Paged.js dependency, supported browsers, bundle impact, and release-health risk before adoption.
- [ ] Feed Paged.js the sanitized, read-only HTML export in an isolated iframe or detached print surface; never run it over the live `contenteditable` tree.
- [ ] Map canonical page size, orientation, margins, named sections, explicit breaks, headers/footers, counters, widows, and orphans to CSS Paged Media.
- [ ] Wait for fonts, images, equations, and asset resolution before declaring the preview ready.
- [ ] Dynamically load Paged.js only when print preview or PDF export is requested and clean up the isolated renderer afterward.
- [ ] Offer an offline browser “Print / Save as PDF” path that uses the system print dialog.
- [ ] Define a separate deterministic downloadable-PDF worker using headless Chromium/Paged.js; do not imply that browser Paged.js alone writes a PDF file.
- [ ] Return page count, layout warnings, missing-asset warnings, progress, cancellation, and timeout errors.
- [ ] Add visual-regression fixtures for paper sizes, margins, headers/footers, tables, code, equations, images, long links, and forced page breaks.
- [ ] Compare Paged.js output against the live paginator and document accepted differences; Paged.js is an export renderer, not the canonical pagination oracle.

### 13.6 DOCX export

- [ ] Evaluate maintained open-source OOXML/DOCX libraries for license, browser bundling, React Native compatibility, extensibility, and deterministic output before selecting one.
- [ ] Generate a real `.docx` OPC/OOXML package rather than HTML renamed as DOCX.
- [ ] Map headings/styles, paragraphs, marks, lists/numbering, checklists, tables, code, equations, images, links, captions, footnotes, and explicit breaks where supported.
- [ ] Map sections, paper dimensions, orientation, margins, columns, headers/footers, page-number fields, relationships, and content types to native Word constructs.
- [ ] Embed or link assets according to explicit policy and report unsupported media/embeds rather than silently dropping them.
- [ ] Keep the DOCX implementation outside `packages/core`; expose it through the shared export contracts and load it on demand.
- [ ] Validate generated packages structurally, unzip-inspect golden fixtures, and open smoke-test artifacts in Word and LibreOffice.
- [ ] Document unavoidable layout differences caused by Word font availability and pagination engines.

### 13.7 Export UI and playground verification

- [ ] Add host-overridable export commands and an optional web export menu for `.inc`, `.txt`, `.md`, `.html`, `.pdf`, and `.docx`.
- [ ] Show progress, cancellation, warnings, loss reports, and retry states without blocking editing.
- [ ] Add export controls and downloadable fixtures to `examples/document-web-demo`.
- [ ] Verify exports work without Liveblocks or network access when all referenced assets are local.
- [ ] Document which formats preserve editing semantics, which preserve visual layout, and which are intentionally lossy.

**Exit criterion:** the same canonical document exports predictably to TXT, Markdown, HTML, PDF, and DOCX, with page setup honored where the target supports it and explicit reports everywhere fidelity is reduced.

## 14. Milestone 10 — clipboard, drag/drop, and assets

- [ ] Sanitize pasted HTML with an allowlist matching the canonical schema.
- [ ] Preserve plain-text paste predictably.
- [ ] Map supported headings, lists, tables, code, links, and images from pasted content.
- [ ] Return an import report for discarded or downgraded content.
- [ ] Prevent pasted scripts, inline event handlers, dangerous URLs, and arbitrary iframes.
- [ ] Define file drop and paste hooks that hand files to the host `AssetRepository`.
- [ ] Insert temporary upload state outside canonical document JSON or through an explicit transient state model.
- [ ] Replace temporary upload state with stable `assetId` references on success.
- [ ] Provide retry and remove behavior for failures.
- [ ] Revoke object URLs and release preview resources on replacement or unmount.
- [ ] Render thumbnails/previews lazily near the viewport.

**Exit criterion:** common clipboard and file operations are safe, report loss, and never embed uncontrolled binary data in JSON.

## 15. Milestone 11 — persistence and recovery contracts

- [ ] Expose debounced autosave integration without hard-coding a backend.
- [ ] Flush pending changes on explicit save and editor teardown.
- [ ] Define browser lifecycle hooks for page visibility and navigation boundaries.
- [ ] Prevent stale asynchronous saves from overwriting newer checkpoints.
- [ ] Attach schema version and document revision to persistence calls.
- [ ] Provide an IndexedDB reference adapter or demo integration only if it can remain separate from core.
- [ ] Test rapid edits followed by immediate unmount.
- [ ] Test failed save, retry, stale response, refresh recovery, and invalid stored snapshot behavior.
- [ ] Make local editing functional without Liveblocks or network access.

**Exit criterion:** a host can guarantee that acknowledged local edits survive refresh and navigation.

## 16. Milestone 12 — performance implementation

- [ ] Set `shouldRerenderOnTransaction: false` unless a measured requirement proves otherwise.
- [ ] Use narrow `useEditorState` selectors for toolbar and status UI.
- [ ] Keep ordinary paragraphs, headings, text, and list items as ProseMirror DOM rendering rather than React NodeViews.
- [ ] Reserve React NodeViews for genuinely interactive rich embeds.
- [ ] Lazy-mount heavy image, audio, PDF, Word, YouTube, equation, and canvas previews.
- [ ] Avoid full-document serialization on every input event.
- [ ] Batch autosave and future collaboration emissions.
- [ ] Avoid full-document pagination during typing.
- [ ] Measure editor creation, first editable, typing latency, selection changes, paste, undo, serialization, and teardown.
- [ ] Add representative benchmark fixtures: 10k, 100k, 500k, and 1m characters; nested lists; large tables; and media-heavy documents.
- [ ] Establish budgets for mid-range hardware and record results rather than claiming performance without measurement.
- [ ] Add a bundle-size check for the document subpath.

**Initial performance targets:**

- Warm first-editable time below 1.5 seconds on a representative mid-range device.
- Typing latency p95 below 50 ms for ordinary text.
- Toolbar state changes do not rerender the full editor tree.
- No full canonical snapshot is generated synchronously for every keystroke.
- Large embeds outside the viewport do not eagerly initialize heavy viewers.

**Exit criterion:** the first release has a measured baseline and no known per-keystroke whole-document work.

## 17. Milestone 13 — accessibility and browser behavior

- [ ] Preserve native text-selection and caret behavior.
- [ ] Add labels, pressed states, disabled states, and keyboard operation to toolbar controls.
- [ ] Ensure focus is not stolen when invoking formatting commands.
- [ ] Verify screen-reader navigation for headings, lists, checklists, tables, code, and attachments.
- [ ] Verify high-contrast and forced-color behavior.
- [ ] Verify 200% zoom and narrow viewport layouts.
- [ ] Respect reduced-motion preferences.
- [ ] Test composition input and IME behavior.
- [ ] Test Chrome, Safari, Firefox, and Edge versions in the support policy.
- [ ] Test macOS and Windows keyboard shortcuts deliberately.

**Exit criterion:** the core writing path is keyboard- and screen-reader-usable and does not rely on pointer-only controls.

## 18. Milestone 14 — testing matrix

### Core unit tests

- [ ] Constructors and IDs.
- [ ] Validation and structured issues.
- [ ] Normalization and idempotence.
- [ ] Serialization and parsing.
- [ ] Migrations.
- [ ] Commands, operations, transactions, and rollback.
- [ ] Security limits and hostile input.
- [ ] Plain-text extraction.
- [ ] Repository contract test helpers.

### Adapter tests

- [ ] Every node and mark round-trip.
- [ ] Deeply nested valid structures.
- [ ] Invalid ProseMirror content reporting.
- [ ] Stable node IDs.
- [ ] Unsupported extension handling.
- [ ] Transaction-origin propagation.

### React integration tests

- [ ] Mount, type, select, format, and unmount.
- [ ] Controlled and uncontrolled APIs.
- [ ] Toolbar, bubble menu, and slash commands.
- [ ] Paste sanitization.
- [ ] Upload success and failure.
- [ ] Read-only mode.
- [ ] Change and selection callback frequency.
- [ ] No duplicate editor instance under React Strict Mode.
- [ ] Autosave flush during immediate unmount.
- [ ] Error boundary behavior for invalid input and broken embeds.

### Regression tests

- [ ] Existing Canvas component tests.
- [ ] Existing core Store and editor tests.
- [ ] Existing canvas page-document and migration tests.
- [ ] Canvas subpath bundle does not contain Tiptap.
- [ ] Headless core import works without DOM globals.

**Exit criterion:** CI tests both the new document path and all existing canvas behavior.

## 19. Milestone 15 — examples and documentation

- [x] Scaffold a minimal Vite React application at `examples/document-web-demo`, separate from the canvas demo.
- [x] Configure the monorepo workspace and Vite aliases so the demo exercises the local `packages/core` and `packages/react` source/build instead of published packages.
- [x] Add root scripts such as `dev:document` and `build:document-demo` for starting and verifying the playground.
- [x] Keep the playground simple and development-focused; it is a test harness, not the final Incantly product interface.
- [x] Display the current document JSON beside or beneath the editor for inspecting canonical-model changes.
- [ ] Add controls to reset the fixture, load a large fixture, toggle read-only mode, toggle the default toolbar, and simulate save/reload.
- [ ] Add a visible event log for transactions, selection changes, validation issues, autosave, and errors.
- [ ] Add a local persistence toggle so refresh and recovery behavior can be tested without a backend.
- [ ] Add fixture selection for basic formatting, nested lists, tables, math/code, attachments, hostile paste, and large-document performance.
- [ ] Add a small diagnostics panel showing editor readiness, node count, character count, last save time, render/transaction timing, and current schema version.
- [x] Ensure every new user-visible editor feature is exposed in the playground in the same change that implements it.
- [x] Ensure the playground starts with one documented command and without requiring Liveblocks, authentication, or a network connection.
- [x] Add a production build check for the Vite playground to CI or the branch verification command.
- [ ] Show uncontrolled local usage.
- [ ] Show controlled persistence usage.
- [ ] Show a custom toolbar invoking shared commands.
- [ ] Show an asset upload adapter.
- [ ] Document canonical JSON versus editor state.
- [ ] Document package subpath imports and CSS import.
- [ ] Document versioning, validation, and migration expectations.
- [ ] Document which features are production-ready, placeholders, or deferred.
- [ ] Document performance guidance and known long-document limitations.
- [ ] Document the future React Native relationship without implying that the React component itself runs natively.

**Exit criterion:** another application can integrate `DocumentEditor` without reading its internal source.

## 20. Deferred work after the web foundation

These items must be anticipated by contracts but should not expand the first implementation branch uncontrollably:

- Liveblocks room authentication and production provider UI.
- Yjs document binding, awareness, comments, presence, and offline update compaction.
- React Native locally bundled WebView editor and typed bridge.
- Native SQLite and filesystem repositories.
- High-fidelity DOCX/PDF import; export is planned in Milestone 9.
- Server-side collaborative export queues beyond the deterministic PDF worker contract.
- Full citation manager, bibliography, footnotes, cross-references, and tracked changes.
- Server-side indexing and production export queue/infrastructure; Milestone 9 defines only the deterministic PDF worker contract needed by the exporter.
- Native viewers and players for attachments.
- ~~Legacy Canvas `documentMode` migration and removal.~~ Completed during milestone 5.4; the store migration removes legacy page/notebook document payloads.
- Canvas/document embeds with live cross-surface updates.
- Complete `.inc` ZIP container import/export.

## 21. Pull request slicing

The branch may be implemented as a sequence of reviewable commits or smaller pull requests:

1. `feat(core): add canonical document schema and validation`
2. `feat(core): add document migrations, operations, and commands`
3. `feat(packages): add independent document and canvas exports`
4. `feat(react): add Tiptap schema and Incantly adapters`
5. `feat(react): add standalone DocumentEditor and command API`
6. `feat(react): add formatting UI, paste, and asset hooks`
7. `feat(document): add portable page-layout and pagination contracts`
8. `feat(react): add incremental paginated editing and page settings`
9. `feat(export): add text, Markdown, HTML, Paged.js print, PDF, and DOCX pipelines`
10. `test(document): add round-trip, integration, security, pagination, export, and performance coverage`
11. `docs(document): add web integration and architecture documentation`

Do not combine legacy Canvas document removal into these commits.

## 22. Definition of done for this branch

- [ ] A new document is created through the core API.
- [ ] The React editor edits it as one continuous writing surface.
- [ ] All initial nodes and marks round-trip through canonical JSON.
- [ ] Reloading produces semantically identical content and stable node IDs.
- [ ] Application UI executes typed commands rather than mutating editor JSON directly.
- [ ] Invalid and unsupported content produces explicit issues or import reports.
- [ ] Autosave hooks can persist and restore without network access.
- [ ] Core document imports run without DOM or React.
- [ ] Canvas consumers can import a canvas-only React subpath without Tiptap.
- [ ] Existing canvas behavior and tests remain intact.
- [ ] Performance is measured against representative large-document fixtures.
- [ ] Page layout round-trips through canonical JSON, and calculated page boundaries remain derived state.
- [ ] Live pagination remains editable and preserves selection, IME, undo, and accessibility behavior.
- [ ] TXT, Markdown, HTML, PDF, and DOCX exports pass their fixtures and expose loss reports.
- [ ] Paged.js is isolated from the live editor and excluded from default bundles.
- [ ] Public APIs and deferred limitations are documented.
- [ ] React Native can later reuse the model, commands, transactions, fixtures, and repository contracts without importing web UI code.

## 23. First implementation sequence

When implementation begins, use this exact order:

1. Capture the baseline and confirm compatibility targets.
2. Implement the core v1 types, constructors, limits, validation, and normalization.
3. Add serialization, fixtures, and migration infrastructure.
4. Implement operations, transactions, commands, and repository interfaces.
5. Publish core document/headless exports and test the platform boundary.
6. Split the React canvas entry point before adding Tiptap dependencies.
7. Add the Tiptap schema and bidirectional model adapter.
8. Prove lossless round-tripping with fixtures.
9. Scaffold the minimal Vite document playground and connect it to the local packages.
10. Add the standalone `DocumentEditor` API and continuous surface, exposing each completed feature in the playground.
11. Add formatting commands and optional UI primitives.
12. Add the canonical page-layout model and portable pagination contracts.
13. Implement incremental web measurement, live page chrome, settings, and headers/footers.
14. Add the shared export projection and TXT, Markdown, and HTML exporters.
15. Add isolated Paged.js print preview/PDF workflows and the portable DOCX exporter.
16. Add safe paste, asset hooks, persistence hooks, and recovery tests.
17. Measure performance, inspect bundles, fix regressions, and document the integration.

Implementation should not advance to the next numbered step while the current step's exit criteria or regression tests are failing.

After completing and verifying any checklist item, update this file in the same working session and mark that item `[x]` before moving to the next item.
