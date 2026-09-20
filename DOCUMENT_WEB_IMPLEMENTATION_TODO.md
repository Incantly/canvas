# Incantly Document Web Implementation Checklist

**Branch:** `codex/document-web-foundation`
**Status:** Implementation in progress; Milestones 1–5 and Milestone 6 complete
**Scope:** Shared document model in `packages/core` and the React web document editor in `packages/react`
**Out of scope:** New React Native document UI, the future document WebView bridge, Liveblocks production integration, and complete DOCX/PDF import

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

- [ ] Define `DocumentEditorProps` and `DocumentEditorRef`.
- [ ] Support uncontrolled initialization with `initialDocument`.
- [ ] Support a clearly documented controlled mode without recreating the editor on every change.
- [ ] Add `readonly`, `autofocus`, `editable`, `className`, `style`, and accessibility properties.
- [ ] Add `onReady`, `onChange`, `onTransaction`, `onSelectionChange`, `onValidationIssue`, and `onError` callbacks.
- [ ] Expose imperative focus, blur, command execution, state query, get-document, replace-document, and destroy-safe methods.
- [ ] Define behavior when the document ID or schema version changes.
- [ ] Do not recreate the Tiptap editor for ordinary prop or toolbar changes.

### 11.2 Continuous writing experience

- [ ] Render one continuous writing surface without visible Notion-style block cards.
- [ ] Provide readable content width, typography, selection colors, focus states, and mobile-responsive spacing.
- [ ] Support cross-paragraph selection and native browser keyboard behavior.
- [ ] Add placeholders without persisting them.
- [ ] Add light and dark theme variables without coupling to the canvas theme implementation.
- [ ] Keep the editor usable with its toolbar hidden or replaced.

### 11.3 Formatting UI

- [ ] Provide a default toolbar as an optional reusable primitive.
- [ ] Allow the host application to place or replace the toolbar completely.
- [ ] Add a selection/bubble toolbar for contextual marks.
- [ ] Add slash-command primitives with host-overridable rendering and commands.
- [ ] Keep toolbar state subscribed through narrow selectors rather than rerendering on every transaction.
- [ ] Ensure all commands have keyboard and accessible button equivalents where applicable.

### 11.4 Initial feature set

- [ ] Paragraph and headings.
- [ ] Bold, italic, underline, strike, inline code, links, highlights, and text color.
- [ ] Bullet lists, numbered lists, nested lists, and checklists.
- [ ] Blockquotes and horizontal rules.
- [ ] Code blocks.
- [ ] Math blocks and inline math, with rendering kept incremental.
- [ ] Tables with basic row/column actions.
- [ ] Images and attachment cards using asset references.
- [ ] Audio, PDF, Word, YouTube, and canvas embeds as safe cards/placeholders in the first milestone.
- [ ] Explicit page breaks represented semantically even in continuous mode.
- [ ] Undo and redo.

**Exit criterion:** a host React application can render and edit a standalone Incantly document without creating a Canvas instance.

## 12. Milestone 8 — clipboard, drag/drop, and assets

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

## 13. Milestone 9 — persistence and recovery contracts

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

## 14. Milestone 10 — performance implementation

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

## 15. Milestone 11 — accessibility and browser behavior

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

## 16. Milestone 12 — testing matrix

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

## 17. Milestone 13 — examples and documentation

- [ ] Scaffold a minimal Vite React application at `examples/document-web-demo`, separate from the canvas demo.
- [ ] Configure the monorepo workspace and Vite aliases so the demo exercises the local `packages/core` and `packages/react` source/build instead of published packages.
- [ ] Add root scripts such as `dev:document` and `build:document-demo` for starting and verifying the playground.
- [ ] Keep the playground simple and development-focused; it is a test harness, not the final Incantly product interface.
- [ ] Display the current document JSON beside or beneath the editor for inspecting canonical-model changes.
- [ ] Add controls to reset the fixture, load a large fixture, toggle read-only mode, toggle the default toolbar, and simulate save/reload.
- [ ] Add a visible event log for transactions, selection changes, validation issues, autosave, and errors.
- [ ] Add a local persistence toggle so refresh and recovery behavior can be tested without a backend.
- [ ] Add fixture selection for basic formatting, nested lists, tables, math/code, attachments, hostile paste, and large-document performance.
- [ ] Add a small diagnostics panel showing editor readiness, node count, character count, last save time, render/transaction timing, and current schema version.
- [ ] Ensure every new user-visible editor feature is exposed in the playground in the same change that implements it.
- [ ] Ensure the playground starts with one documented command and without requiring Liveblocks, authentication, or a network connection.
- [ ] Add a production build check for the Vite playground to CI or the branch verification command.
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

## 18. Deferred work after the web foundation

These items must be anticipated by contracts but should not expand the first implementation branch uncontrollably:

- Liveblocks room authentication and production provider UI.
- Yjs document binding, awareness, comments, presence, and offline update compaction.
- React Native locally bundled WebView editor and typed bridge.
- Native SQLite and filesystem repositories.
- Full paginated live editing.
- High-fidelity PDF and DOCX import/export.
- Full citation manager, bibliography, footnotes, cross-references, and tracked changes.
- Server-side indexing and export workers.
- Native viewers and players for attachments.
- ~~Legacy Canvas `documentMode` migration and removal.~~ Completed during milestone 5.4; the store migration removes legacy page/notebook document payloads.
- Canvas/document embeds with live cross-surface updates.
- Complete `.inc` ZIP container import/export.

## 19. Pull request slicing

The branch may be implemented as a sequence of reviewable commits or smaller pull requests:

1. `feat(core): add canonical document schema and validation`
2. `feat(core): add document migrations, operations, and commands`
3. `feat(packages): add independent document and canvas exports`
4. `feat(react): add Tiptap schema and Incantly adapters`
5. `feat(react): add standalone DocumentEditor and command API`
6. `feat(react): add formatting UI, paste, and asset hooks`
7. `test(document): add round-trip, integration, security, and performance coverage`
8. `docs(document): add web integration and architecture documentation`

Do not combine legacy Canvas document removal into these commits.

## 20. Definition of done for this branch

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
- [ ] Public APIs and deferred limitations are documented.
- [ ] React Native can later reuse the model, commands, transactions, fixtures, and repository contracts without importing web UI code.

## 21. First implementation sequence

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
12. Add safe paste, asset hooks, persistence hooks, and recovery tests.
13. Measure performance, inspect bundles, fix regressions, and document the integration.

Implementation should not advance to the next numbered step while the current step's exit criteria or regression tests are failing.

After completing and verifying any checklist item, update this file in the same working session and mark that item `[x]` before moving to the next item.
