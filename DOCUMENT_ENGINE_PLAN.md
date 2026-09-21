# Incantly Document Engine Plan

**Status:** Proposed architecture
**Priority:** Document engine first; canvas integration second; React Native editor later
**Applies to:** Web application, shared SDK packages, persistence, import/export, AI operations, collaboration, and future React Native support

## 1. Product objective

Incantly will support two distinct primary creation surfaces inside one notebook product:

1. **Document:** a continuous writing environment for notes, journals, essays, reports, and research papers.
2. **Canvas:** a spatial environment for handwriting, diagrams, shapes, arrows, images, and free positioning.

The document must not feel like a collection of visible Notion-style boxes. Users should click into one continuous writing surface and type naturally across paragraphs, headings, lists, tables, equations, and media.

Internally, the document still needs semantic structure. Paragraphs, headings, tables, figures, citations, and embeds are typed nodes so that the application can edit, validate, search, synchronize, paginate, and export them reliably.

The document and canvas will share notebook-level infrastructure, but they will not share one renderer or interaction system.

## 2. Architectural boundary

```text
Notebook
├── Document entry
│   ├── Semantic document model
│   ├── Continuous writing editor
│   ├── Pagination and print layout
│   └── Document import/export
├── Canvas entry
│   ├── Spatial shape model
│   ├── Ink and geometry engine
│   ├── Pan and zoom camera
│   └── Canvas import/export
└── Shared services
    ├── Assets
    ├── Persistence
    ├── Sync and permissions
    ├── Search
    ├── History
    ├── AI operations
    └── Notebook navigation
```

### Shared responsibilities

- Notebook and workspace organization
- User identity and permissions
- Asset storage
- Autosave and recovery
- Search and indexing
- Version history
- Collaboration transport
- AI operation validation
- Import/export orchestration

### Document-only responsibilities

- Text selection and caret behavior
- Paragraph and inline formatting
- Lists, tables, citations, and footnotes
- Continuous and paginated layout
- DOCX, Markdown, HTML, LaTeX, and print export
- Document-specific comments and tracked changes

### Canvas-only responsibilities

- Camera, pan, and zoom
- Spatial hit testing and selection
- Ink capture and erasing
- Shapes, connectors, and transforms
- Viewport culling and level of detail
- Canvas image and JSON export

The two surfaces can embed each other through explicit references. A document may contain a `canvasEmbed` figure, while a canvas may contain a link or preview to a document. Neither renderer should directly own the other surface's data.

## 3. Package architecture

```text
packages/core                       shared/headless core
├── document/                       schema, commands, validation, migrations
├── canvas/                         shapes, ink, geometry, operations
├── collaboration/                  contracts, presence types, Yjs mappings
├── assets/                         records and repository contracts
└── notebook/                       entries and shared metadata

packages/react                     React web SDK
├── canvas/                         web canvas implementation
├── document/                       Tiptap/ProseMirror implementation
├── collaboration/                  Liveblocks web provider and UI
└── assets/                         browser upload and preview adapters

packages/react-native              React Native SDK
├── canvas/                         native canvas implementation
├── document/                       WebView first, native adapter later
├── collaboration/                  Liveblocks/native lifecycle adapter
└── assets/                         native picker, player, and viewer adapters
```

The existing `packages/core` package is still actively used: React imports its Editor and Store, while React Native consumes its `headless` exports. It will become the home of all portable domain models and behavior rather than being removed.

Core must not import React, React Native, Tiptap, ProseMirror views, Liveblocks React hooks, DOM APIs, WebView APIs, or native UI components. Shared code should be plain TypeScript that works in browsers, Node.js, workers, servers, and React Native.

The collaboration contract and document/canvas mappings belong in core. Hosted provider implementations do not. Liveblocks authentication, rooms, connection lifecycle, React UI, and native polyfills remain in their respective platform packages. This prevents a hosted vendor from becoming a dependency of the portable data model.

This three-package structure is the initial target. A separate document-model package should only be extracted later if independent publication or bundle boundaries justify the additional package complexity.

```ts
// @incantly/canvas-react
export { Canvas } from './canvas'
export { DocumentEditor } from './document'

// @incantly/canvas-react-native
export { Canvas } from './canvas'
export { DocumentEditor } from './document'

// shared headless exports
export type { IncantlyDocument, DocumentNode, CanvasRecord }
export { validateDocument, applyDocumentTransaction }
export type { CollaborationProvider, CollaborativeSession }
```

## 4. Canonical document model

Incantly will own a documented, versioned JSON format. Tiptap and ProseMirror are editing adapters, not the permanent product format.

```ts
interface IncantlyDocument {
  schemaVersion: number
  id: string
  type: 'document'
  metadata: DocumentMetadata
  content: DocumentNode[]
}
```

The canonical format must provide:

- Stable node IDs
- Deterministic validation and normalization
- Forward-only schema migrations
- Portable JSON serialization
- Framework-independent commands
- Lossless representation of supported features
- Explicit fallback behavior for unsupported features
- Safe handling of untrusted imported or AI-generated content

### Why JSON instead of XML

JSON integrates naturally with TypeScript, React Native, databases, workers, schema validators, and incremental operations. XML may be offered as an interchange format, but it should not be used in typing, rendering, ink, or synchronization hot paths.

An OXML-style protocol remains useful for AI-generated multimodal responses. It should be parsed into validated Incantly operations and then discarded; it should not become the live document representation.

## 5. Document nodes and inline marks

```ts
type DocumentNode =
  | ParagraphNode
  | HeadingNode
  | BulletListNode
  | OrderedListNode
  | ChecklistNode
  | BlockquoteNode
  | HorizontalRuleNode
  | CodeBlockNode
  | MathBlockNode
  | TableNode
  | ImageNode
  | AudioNode
  | VideoEmbedNode
  | FileAttachmentNode
  | PdfEmbedNode
  | CanvasEmbedNode
  | PageBreakNode
```

```ts
interface TextNode {
  type: 'text'
  text: string
  marks?: TextMark[]
}

type TextMark =
  | { type: 'bold' }
  | { type: 'italic' }
  | { type: 'underline' }
  | { type: 'strike' }
  | { type: 'code' }
  | { type: 'link'; href: string }
  | { type: 'textColor'; color: string }
  | { type: 'highlight'; color: string }
  | { type: 'citation'; citationId: string }
  | { type: 'inlineMath'; latex: string }
```

Nodes are invisible semantic units. The web editor renders them as one continuous surface without block borders, drag handles, or card-like separation unless a feature explicitly requires those controls.

### Paragraphs and headings

```ts
interface ParagraphNode {
  id: string
  type: 'paragraph'
  attrs?: {
    alignment?: 'left' | 'center' | 'right' | 'justify'
    lineHeight?: number
  }
  content: InlineNode[]
}

interface HeadingNode {
  id: string
  type: 'heading'
  attrs: { level: 1 | 2 | 3 | 4 | 5 | 6 }
  content: InlineNode[]
}
```

### Lists and checklists

```ts
interface ListNode {
  id: string
  type: 'bulletList' | 'orderedList' | 'checklist'
  attrs?: { start?: number }
  content: ListItemNode[]
}

interface ListItemNode {
  id: string
  type: 'listItem' | 'checklistItem'
  attrs?: { checked?: boolean }
  content: DocumentNode[]
}
```

List items contain document nodes so that they can support nested lists, paragraphs, images, code, and equations.

### Code blocks

```ts
interface CodeBlockNode {
  id: string
  type: 'codeBlock'
  attrs: {
    language?: string
    filename?: string
    lineNumbers?: boolean
  }
  text: string
}
```

Store source text and language metadata. Syntax highlighting is derived presentation and must not be stored as hundreds of colored spans.

### Mathematics

```ts
interface MathBlockNode {
  id: string
  type: 'mathBlock'
  attrs: {
    latex: string
    numbered?: boolean
    label?: string
  }
}
```

Canonical LaTeX is stored. Generated KaTeX/MathJax HTML is not stored. Web and React Native may use different rendering libraries without changing document data.

### Tables

```ts
interface TableNode {
  id: string
  type: 'table'
  attrs?: { caption?: string }
  content: TableRowNode[]
}

interface TableCellNode {
  id: string
  type: 'tableCell' | 'tableHeader'
  attrs: {
    colspan: number
    rowspan: number
    alignment?: 'left' | 'center' | 'right'
  }
  content: DocumentNode[]
}
```

Table cells use normal document content so that they can contain paragraphs, lists, images, equations, and citations.

## 6. Media, embeds, and attachments

Large binary files must never be stored as Base64 inside document JSON. Document nodes hold asset references.

### Images

```ts
interface ImageNode {
  id: string
  type: 'image'
  attrs: {
    assetId: string
    alt?: string
    caption?: string
    width?: number
    alignment?: 'left' | 'center' | 'right'
  }
}
```

### Audio

```ts
interface AudioNode {
  id: string
  type: 'audio'
  attrs: {
    assetId: string
    title?: string
    duration?: number
    transcriptDocumentId?: string
  }
}
```

### YouTube and other hosted video

```ts
interface VideoEmbedNode {
  id: string
  type: 'videoEmbed'
  attrs: {
    provider: 'youtube' | 'vimeo'
    videoId: string
    url: string
    title?: string
    startSeconds?: number
  }
}
```

Store a validated provider, stable media ID, and URL. Do not store arbitrary iframe HTML.

### File attachments

```ts
interface FileAttachmentNode {
  id: string
  type: 'fileAttachment'
  attrs: {
    assetId: string
    filename: string
    mimeType: string
    size: number
  }
}
```

An attachment preserves the original file. Importing its content is a separate operation.

### PDF

```ts
interface PdfEmbedNode {
  id: string
  type: 'pdfEmbed'
  attrs: {
    assetId: string
    page?: number
    display: 'card' | 'preview' | 'reader'
    extractedDocumentId?: string
  }
}
```

PDF workflows:

1. Attach and preserve the original PDF.
2. Preview or read the PDF inside the document.
3. Extract searchable text as derived data.
4. Optionally convert extracted content into an editable Incantly document.

PDF conversion is inherently lossy for columns, equations, figures, tables, and scanned content. The original PDF must always remain available.

### Word documents

Word workflows:

1. **Attach:** preserve the original `.docx` file.
2. **Import:** convert supported Word structures into an editable Incantly document.

Import mapping:

| Word content | Incantly representation |
| --- | --- |
| Heading styles | Heading nodes |
| Paragraphs | Paragraph nodes |
| Bullets and numbering | List nodes |
| Checkboxes | Checklist nodes where detectable |
| Tables | Table nodes |
| Images | Image assets and nodes |
| Footnotes | Footnote records/nodes |
| Page breaks | Page-break nodes |
| Hyperlinks | Link marks |
| Equations | Math nodes when conversion is reliable |

The original `.docx` asset remains linked to the imported document for recovery and fidelity comparison.

## 7. Asset model and storage

Use content-addressed assets so identical files can be deduplicated.

```ts
interface AssetRecord {
  id: string
  hash: string
  mimeType: string
  byteLength: number
  filename?: string
  width?: number
  height?: number
  duration?: number
  storageKey: string
  createdAt: string
}
```

### Storage layout

```text
Web local
├── IndexedDB: metadata, document snapshots, update log
└── OPFS/cache: large local assets where supported

React Native local
├── SQLite: metadata, document snapshots, update log
└── Filesystem: images, audio, PDFs, and DOCX files

Server
├── PostgreSQL: metadata, permissions, checkpoints, indexing
└── Object storage: original assets, previews, and thumbnails
```

Framework-neutral repository contracts:

```ts
interface DocumentRepository {
  loadDocument(id: string): Promise<IncantlyDocument>
  saveCheckpoint(document: IncantlyDocument): Promise<void>
  appendUpdates(id: string, updates: Uint8Array[]): Promise<void>
}

interface AssetRepository {
  put(data: Blob | Uint8Array, metadata: AssetMetadata): Promise<AssetRecord>
  get(id: string): Promise<Blob | Uint8Array>
  remove(id: string): Promise<void>
}
```

Web, native, and server packages implement these contracts independently.

## 8. Web editor

Use Tiptap on top of ProseMirror for the web editing surface inside `packages/react/src/document`.

ProseMirror provides a schema-defined document model and JSON serialization. Its schema can enforce which nodes exist and how they nest. Incantly should map its canonical model to and from a deliberately similar ProseMirror schema. See the [ProseMirror schema guide](https://prosemirror.net/docs/guide/).

```text
Incantly document model
          ⇅
ProseMirror model adapter
          ⇅
Tiptap web editor
```

Raw HTML and undocumented Tiptap editor state must not become the permanent storage contract.

The initial web editor should provide:

- Continuous typing surface
- Cross-paragraph selection
- Keyboard navigation and shortcuts
- Headings and inline formatting
- Bullet, ordered, and checklist lists
- Dividers
- Code blocks
- Math blocks
- Images and attachments
- Undo and redo
- Slash commands
- Toolbar commands
- Clipboard sanitization
- Autosave and crash recovery
- Continuous and paginated views
- Print/PDF layout

## 9. Commands and transactions

UI code must not mutate document JSON directly. Shared commands define behavior:

```ts
insertParagraph(position)
toggleHeading(nodeId, level)
toggleChecklist(nodeId)
insertTable(position, rows, columns)
insertImage(position, assetId)
insertMathBlock(position, latex)
insertAttachment(position, assetId)
replaceSelection(content)
setPageSetup(settings)
```

Commands produce transactions:

```ts
interface DocumentTransaction {
  id: string
  documentId: string
  origin: 'user' | 'remote' | 'ai' | 'import' | 'migration'
  operations: DocumentOperation[]
  timestamp: number
}
```

The same command and operation layer supports:

- React toolbars
- Keyboard shortcuts
- React Native toolbars
- AI-generated edits
- DOCX and PDF importers
- Collaboration
- Undo/redo
- Automated testing

Large imports and AI responses must apply through bounded transactions rather than hundreds of independent store changes.

## 10. Pagination, paper sizes, and research documents

Store semantic content, not calculated page boundaries.

```ts
interface PageSetup {
  mode: 'continuous' | 'paginated'
  size: 'a4' | 'letter' | 'legal' | 'custom'
  widthPt?: number
  heightPt?: number
  orientation: 'portrait' | 'landscape'
  margins: {
    topPt: number
    rightPt: number
    bottomPt: number
    leftPt: number
  }
  columns: 1 | 2
}
```

Points are the canonical physical unit. Centimeters, millimeters, inches, and CSS pixels are display/input choices converted at the platform boundary. Editor zoom, visual page gaps, ruler visibility, and linked-margin controls are user-interface state, not document semantics.

Page setup has document defaults and may be overridden by explicit section records. Headers and footers are Incantly document fragments with default, first-page, odd-page, and even-page variants. Dynamic values such as page number and total page count are stored as semantic fields.

Pagination is calculated from content, font metrics, paper dimensions, margins, figures, tables, footnotes, headers, and footers. Only explicit user-created page or section breaks are stored. Calculated page ranges and overflow diagnostics are derived caches and never become canonical content.

The shared paginator accepts injected measurements rather than accessing the DOM. The web adapter obtains measurements from ProseMirror positions and DOM ranges. A future React Native WebView can reuse that web adapter offline; a future fully native editor can provide a native measurement adapter without replacing the document model or pagination rules.

This allows the same document to render as:

- Continuous web document
- Mobile reading view
- A4 paper
- US Letter paper
- Two-column journal article
- PDF
- DOCX
- HTML
- Markdown
- LaTeX

### Research-specific metadata and content

```ts
interface ResearchMetadata {
  title: string
  authors: Author[]
  abstract?: DocumentNode[]
  keywords?: string[]
  language?: string
  citationStyle?: 'apa' | 'mla' | 'chicago' | 'ieee' | string
}
```

Later research features:

- Abstracts
- Numbered sections
- Figures and captions
- Tables and captions
- Inline citations
- Bibliographies
- Footnotes and endnotes
- Equation numbering
- Cross-references
- Appendices
- Code listings
- Table of contents
- Comments
- Track changes

These must be semantic records so numbering, references, bibliographies, and exports can be regenerated reliably.

## 11. Export architecture

```text
Canonical Incantly document
├── Web editor renderer
├── Paginated print renderer
├── PDF exporter
├── DOCX exporter
├── HTML exporter
├── Markdown exporter
├── LaTeX exporter
└── Incantly archive exporter
```

Exporters operate on the canonical model and must not require a mounted browser editor.

All exporters consume a validated, normalized export projection and return structured warnings/loss reports. Core owns format-neutral contracts and pure projections. Heavy or runtime-specific dependencies remain in optional adapter packages and are dynamically loaded.

TXT export is explicitly lossy and uses documented textual fallbacks. Markdown targets a documented CommonMark-compatible profile. HTML export is semantic and sanitized, with optional print CSS generated from canonical page setup.

Paged.js is used only against an isolated, read-only HTML export for print preview and CSS Paged Media rendering. It must not rewrite the live ProseMirror `contenteditable` DOM. Browser-only offline PDF output uses the system Print / Save as PDF flow; deterministic downloadable PDF generation uses a separate headless Chromium/Paged.js worker because Paged.js itself paginates HTML but does not create the final PDF byte stream in a normal browser.

DOCX export should create a real OPC/OOXML package and map semantic structures to native Word constructs: heading styles, numbering, lists, tables, captions, footnotes, section page setup, headers/footers, page-number fields, media, and document relationships. The chosen open-source implementation must first be evaluated for license, maintenance, browser bundling, React Native compatibility, and extensibility. LaTeX export should produce a readable project with asset files rather than one opaque generated string.

The first export order is `.inc`, TXT, Markdown, HTML, PDF, then DOCX. Import remains a separate pipeline and is not implied by export support.

## 12. Collaboration and offline storage

Prepare for collaboration from the beginning without making it a prerequisite for the first document editor.

Yjs is the leading candidate because it provides network-independent shared types, incremental binary updates, editor bindings, offline persistence options, and automatic merging of concurrent changes. See the [Yjs documentation](https://docs.yjs.dev/) and [document update model](https://docs.yjs.dev/api/document-updates).

Liveblocks will be the initial managed collaboration provider. This is not a choice between Liveblocks and Yjs: Liveblocks can host and persist a `Y.Doc`, provide rooms and presence, and add comments, mentions, notifications, and authentication integration.

```text
Incantly document and canvas models
                 ⇅
          Yjs shared state
                 ⇅
      Liveblocks Yjs provider
                 ⇅
      Liveblocks hosted services
```

Core defines provider-neutral collaboration contracts plus mappings between Incantly records and Yjs shared types. React and React Native instantiate Liveblocks and translate platform lifecycle events into those contracts.

Do not use LiveText as the canonical long-document store in the first implementation. Liveblocks currently recommends Yjs for long documents; its LiveText documentation identifies a per-value size limit and reserves some offline, AI, and server-side editing capabilities for Yjs mode. Liveblocks remains valuable as the managed provider around Yjs.

Do not persist only an opaque Yjs binary state. Store both a portable checkpoint and collaboration updates:

```text
Document checkpoint
├── Incantly JSON snapshot
├── Schema version
└── Optional compacted Yjs state

Incremental history
└── Yjs updates or Incantly operations

Assets
└── Content-addressed binary objects
```

The JSON checkpoint supports migrations, recovery, indexing, debugging, exports, and migration away from a CRDT dependency. Yjs supplies concurrent editing, offline merging, presence, cursors, and incremental synchronization.

Presence data is transient and must not be stored as document content.

### Collaboration applies to documents and canvases

```text
Collaboration room
├── document state
│   ├── structured rich text
│   ├── document selections
│   └── document operations
├── canvas state
│   ├── shape records
│   ├── ink records
│   └── canvas operations
├── comments and notifications
└── transient presence
    ├── active surface
    ├── cursor or caret
    ├── selection
    └── user metadata
```

Do not force document text and canvas records into one undifferentiated shared map. Use explicit namespaces or Yjs subdocuments so opening a canvas does not require loading a large document state and vice versa.

## 13. React Native strategy

The shared model, validators, commands, transactions, migrations, import/export logic, and repository interfaces must work in React Native from the first release.

Tiptap and ProseMirror are DOM-based and cannot become native UI automatically. The native path therefore has two stages.

### Stage 1: controlled WebView editor

- Reuse the Tiptap editor and schema.
- Exchange typed operations and snapshots through a strict bridge.
- Keep storage, assets, and commands outside the WebView.
- Batch bridge traffic.
- Preserve selection and pending edits during app backgrounding.
- Use native file pickers, uploaders, media players, and document viewers.

This provides feature parity quickly but must be tested for keyboard, selection, accessibility, bridge throughput, and long-document performance.

### Stage 2: native document adapter

Build a native renderer/editor incrementally over the same canonical model. Begin with paragraphs, headings, lists, checklists, images, and basic marks. Complex nodes may initially render as native cards or controlled embedded views.

The portable model means the native editor can grow without document migrations or changes to server storage.

## 14. AI and OXML-style content

AI systems must emit typed operations, not arbitrary HTML, JavaScript, or direct Store mutations.

```ts
type DocumentOperation =
  | { type: 'node.insert'; parentId: string; index: number; node: DocumentNode }
  | { type: 'node.update'; id: string; patch: NodePatch }
  | { type: 'node.delete'; ids: string[] }
  | { type: 'text.replace'; nodeId: string; from: number; to: number; content: InlineNode[] }
  | { type: 'asset.attach'; nodeId: string; assetId: string }
```

Every AI or imported operation passes through:

1. Schema validation
2. Permission and capability checks
3. URL and asset validation
4. Document-size and nesting limits
5. Transaction batching
6. Undo/history integration
7. One coalesced persistence and render boundary

An XML-like AI response format may be supported for readability, but it is only an interchange envelope. It is normalized into the same operations as JSON AI responses.

## 15. Security requirements

- Explicit node and mark allowlists
- Runtime schema validation
- URL scheme allowlists
- No arbitrary iframe HTML
- No inline event handlers or scripts
- Sandboxed code execution
- Asset type, size, and count limits
- Maximum document depth and node count
- Safe paste sanitization
- Import timeouts and memory limits
- Transaction rollback for failed imports
- User confirmation for destructive or document-wide AI operations
- Forward-only, tested schema migrations

## 16. Performance requirements

Document performance follows the project [`PERFORMANCE_PLAN.md`](PERFORMANCE_PLAN.md) while recognizing that the document and canvas have different bottlenecks.

Document-specific performance work:

- Render only the active or nearby paginated regions for very long documents.
- Avoid recalculating full-document pagination on every keystroke.
- Cache layout by node ID, content fingerprint, width, and typography.
- Decode and render media near the viewport.
- Generate thumbnails for PDFs, Word files, images, and canvases.
- Batch autosave and collaboration updates.
- Run DOCX/PDF parsing outside the input/render path.
- Keep syntax highlighting and equation rendering incremental.
- Test documents containing thousands of paragraphs, long tables, media, and citations.

## 17. Removing the document implementation from Canvas

The current React canvas includes a page-document/contenteditable implementation. The target architecture removes this rich-document editor from the Canvas surface. `Canvas` becomes a spatial drawing SDK only.

### What remains in Canvas

- Pages and paper bounds for spatial drawing
- Ink, highlighter, and eraser
- Shapes, arrows, connectors, and positioned text shapes
- Images and spatial file cards
- Camera, pan, zoom, selection, and transforms
- Canvas collaboration and presence
- Canvas export

### What moves to DocumentEditor

- Continuous rich-text editing
- Headings and flowing paragraphs
- Bullet, ordered, and checklist lists
- Tables
- Code and LaTeX blocks
- Dividers
- Footnotes, citations, and research-paper structure
- Paginated layout
- DOCX/PDF/Markdown/HTML/LaTeX import and export
- Document collaboration cursors and selections

### What stays in core

Document schemas, node types, validation, commands, migrations, transactions, import/export primitives, asset references, and collaboration mappings remain in core. Only the canvas-specific DOM document editor is removed from the React Canvas implementation.

### Compatibility and migration

Existing canvas snapshots may contain page-document blocks. Removal must not silently discard them.

1. Detect existing page-document content during migration.
2. Convert that content into a new document entry or referenced document asset.
3. Preserve canvas ink and shapes on their original canvas page.
4. Emit a migration report for unsupported content.
5. Maintain read compatibility for at least one deprecation cycle.
6. Remove `documentMode`, `PageDocumentUI`, and document-specific toolbar code from the Canvas API only after migration fixtures pass.
7. Replace mixed demos with explicit `Canvas` and `DocumentEditor` demos.

A canvas may later be embedded in a document through `canvasEmbed`, but the embedded canvas remains a referenced canvas document with its own renderer and collaboration namespace.

## 18. Implementation phases

### Phase 1 — document specification

Create the shared document modules under `packages/core/src/document` with:

- Versioned TypeScript schema
- Runtime validation
- Stable ID rules
- Normalization
- Migration framework
- JSON serialization
- Command and transaction interfaces
- Representative test fixtures

Initial nodes:

- Paragraph
- Heading
- Bullet list
- Ordered list
- Checklist
- Blockquote
- Divider
- Code block and inline code
- Math block and inline math
- Image
- File attachment
- Page break

### Phase 2 — web editor foundation

- ProseMirror schema adapter
- Tiptap editor
- React component
- Continuous writing experience
- Keyboard and selection behavior
- Toolbar and slash commands
- Undo/redo
- Paste sanitization
- Autosave and recovery
- Accessibility tests
- Large-document benchmarks

### Phase 3 — rich content

- Tables
- Audio
- YouTube/video embeds
- PDF embed/reader nodes
- Word attachments
- Canvas embeds
- Captions
- Citations and footnotes
- Comments

### Phase 4 — page layout and export

- Canonical page defaults, sections, units, explicit breaks, and header/footer fragments
- Portable measurement and incremental pagination contracts with synthetic core tests
- Web DOM measurement adapter and continuous/paginated toggle
- A4, Letter, Legal, custom sizes, margins, orientation, and page-setting UI
- Editable headers/footers and semantic page-number fields
- Shared export projection, asset/font resolvers, progress, cancellation, and loss reports
- TXT, Markdown, and semantic HTML export
- Isolated Paged.js print preview plus browser and headless-worker PDF paths
- Real OOXML DOCX export behind an optional dynamically loaded package
- LaTeX project export after the initial formats are stable

### Phase 5 — import pipelines

- DOCX import
- PDF attachment, preview, and extraction
- HTML and Markdown import
- Import reports for unsupported or lossy content
- Original-file preservation

### Phase 6 — collaboration

- Yjs adapter
- Offline persistence
- Incremental server updates
- Presence and collaborative cursors
- Checkpoint compaction
- Conflict and recovery tests

### Phase 7 — React Native

- Shared model and repositories
- WebView editor integration
- Native media/file handling
- Bridge performance tests
- Incremental native document renderer/editor

### Phase 8 — Canvas document extraction

- Migrate existing canvas page-document data.
- Introduce standalone `DocumentEditor` exports in React and React Native.
- Remove rich-document UI from the React Canvas.
- Remove `documentMode` after the compatibility period.
- Keep positioned canvas text shapes and canvas file cards.
- Verify old snapshots migrate without data loss.

## 19. Definition of done for the first document milestone

- A user can type continuously without visible block boundaries.
- Headings, paragraphs, inline formatting, lists, checklists, dividers, code, math, images, attachments, and page breaks round-trip through canonical JSON.
- The editor reloads the same document without semantic loss.
- Autosave survives immediate navigation, unmount, browser refresh, and crash recovery.
- The model package runs without DOM or React dependencies.
- The same fixture documents validate in browser, Node.js, and React Native test environments.
- Unsupported imported content produces an explicit import report rather than disappearing.
- Assets are referenced, deduplicated, and stored outside document JSON.
- Exporters can operate without mounting the editor.
- Schema migrations and hostile-input tests pass.
- Large-document benchmarks establish the baseline for subsequent optimization.

## 20. Portable `.inc` file format

Incantly needs a user-owned portable format that can contain document entries, canvas entries, assets, previews, and optional collaboration checkpoints.

Use `.inc` as the public file extension. The container is ZIP-compatible but governed by a versioned Incantly specification.

```text
research-notebook.inc
├── manifest.json
├── notebook.json
├── documents/
│   ├── doc_1.json
│   └── doc_2.json
├── canvases/
│   ├── canvas_1.json
│   └── canvas_2.json
├── assets/
│   ├── 7a8d...jpg
│   ├── 16bc...pdf
│   └── 943e...docx
├── previews/
│   ├── canvas_1.webp
│   └── doc_1.webp
└── collaboration/
    └── checkpoint.bin
```

### Manifest

```ts
interface IncantlyManifest {
  format: 'incantly'
  formatVersion: number
  notebookId: string
  createdAt: string
  updatedAt: string
  entrypoint: 'notebook.json'
}
```

### Notebook index

```ts
interface IncantlyNotebook {
  id: string
  title: string
  entries: Array<
    | { id: string; type: 'document'; title: string; source: string }
    | { id: string; type: 'canvas'; title: string; source: string }
    | { id: string; type: 'folder'; title: string; children: string[] }
  >
}
```

Document files contain the versioned Incantly/ProseMirror-compatible document tree. Canvas files contain versioned pages, shapes, ink, settings, and references. Assets are content-addressed and referenced by ID.

Required portable content:

- Manifest
- Notebook index
- Document JSON
- Canvas JSON
- Referenced assets

Optional and rebuildable content:

- Yjs checkpoint
- Pending collaboration updates
- Preview images
- Search indexes
- Render caches

The portable JSON is always sufficient to recover user content. Collaboration binaries and derived caches must never be the only readable representation.

### SQLite versus `.inc`

SQLite is the active offline working database. `.inc` is the portable export, backup, import, and user-managed cloud-drive format.

```text
SQLite
├── notebooks
├── entries
├── document_snapshots
├── canvas_snapshots
├── pending_updates
├── assets
├── versions
└── sync_state
```

Do not edit an active SQLite database directly inside iCloud Drive, Google Drive, Dropbox, or another generic synchronized folder. SQLite may depend on WAL, shared-memory files, locking, and atomic filesystem behavior that cloud drives do not preserve reliably.

Instead:

```text
Active local state       SQLite + local asset directory
Realtime collaboration  Yjs through Liveblocks
User cloud file          atomic .inc snapshot
```

Export cloud-drive files atomically: write a temporary package, validate it, then replace the previous `.inc` file. Detect external file revisions and create an explicit conflict copy instead of overwriting divergent user data.

## 21. SDK and application ownership

### Core owns the source-of-truth definitions

- Notebook, document, canvas, asset, and manifest schemas
- `.inc` serialization and validation
- Stable IDs
- Commands and transactions
- Migrations
- Import/export primitives
- Repository interfaces
- Collaboration interfaces
- Yjs mappings
- Security and size limits

### React SDK owns reusable web implementations

- `Canvas`
- `DocumentEditor`
- Incantly Tiptap extensions
- ProseMirror adapter
- Browser clipboard and file handling
- Web pagination and print primitives
- Generic toolbar and menu primitives
- React hooks

Expose canvas and document as separate subpaths so canvas-only applications do not download Tiptap:

```ts
import { Canvas } from '@incantly/canvas-react/canvas'
import { DocumentEditor } from '@incantly/canvas-react/document'
```

### React Native SDK owns reusable native implementations

- Native Canvas
- Locally bundled offline Tiptap WebView
- Typed document bridge
- SQLite repository implementation
- Native filesystem assets
- File picker, PDF viewer, and media player adapters
- Background, resume, and offline synchronization behavior

### Product applications own product policy and presentation

- Workspace and dashboard UI
- Notebook navigation
- Product-specific toolbar arrangement
- Authentication and billing
- Liveblocks room configuration
- Sharing flows and permissions
- AI product experience
- Analytics and application routes

Tiptap belongs in the reusable React document implementation, not only in the product web application. The product can completely replace toolbar placement and appearance through render props and SDK primitives. Liveblocks configuration remains application-level while satisfying core collaboration contracts.

## 22. Source-of-truth hierarchy

```text
1. Incantly format specification
2. Core schemas, validators, commands, and migrations
3. Local SQLite working state
4. Portable .inc snapshots
5. Yjs collaborative updates
6. React and React Native renderers
```

Tiptap is the web editing engine, not the source of truth. Liveblocks is a managed synchronization provider, not the source of truth. The product application is a consumer of the SDK, not the owner of the file format.

## 23. Decisions

1. **Canonical format:** versioned Incantly JSON.
2. **Shared placement:** document, canvas, asset, transaction, and collaboration contracts live in `packages/core`; platform implementations live in React and React Native.
3. **Web editor:** Tiptap/ProseMirror adapter inside the React package.
4. **Native compatibility:** shared model and commands; WebView first, native adapter later.
5. **Files:** content-addressed asset storage with references in documents.
6. **Word/PDF:** attachment and import are separate workflows; preserve originals.
7. **Pagination:** derived layout; only explicit page breaks are stored.
8. **Collaboration:** Yjs shared representation with Liveblocks as the initial managed provider; provider-neutral core contracts.
9. **Canvas separation:** remove the rich-document implementation from Canvas after migrating existing snapshots; keep document models in core.
10. **AI/OXML:** interchange only; validate and normalize into typed document operations.
11. **Exports:** driven by the canonical model, not by editor DOM.
12. **Portable file:** `.inc` ZIP-compatible package containing versioned JSON and content-addressed assets.
13. **Offline working state:** SQLite and the native filesystem; never an actively edited SQLite database inside a generic cloud drive.
14. **Cloud-drive behavior:** atomic `.inc` snapshots with external-revision conflict detection.
15. **SDK boundary:** reusable editors live in React and React Native SDK layers; product applications own layout and provider configuration.
