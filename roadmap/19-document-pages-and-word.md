# 19 — Document pages, print layout, and Word export/import

**Branch:** `feat/document-pages-and-word`
**Package scope:** `packages/core` (`@incantly/canvas-core`) and a new `packages/docx` (`@incantly/canvas-docx`)
**Companion plans:**
- Web app: `incantly-we/web/docs/pages-and-word-plan.md` (phases `FE-*`)
- Backend: `incantly-backend/docs/pages-and-word-plan.md` (phases `BE-*`)

## Why

Researchers write papers in Incantly notes. They need real pages: paper size, orientation, margins, columns, headers and footers with page numbers, a different first page, and odd/even pages. They also need exports (PDF, Word) and imports (Word, WPS, Google Docs as `.docx`) that keep that layout.

The canonical model already stores most of this:
- `PageSetup`: mode, size, orientation, margins, header/footer distance, mirrored margins, starting page number, columns;
- `PageLayout`: sections and `PageHeaderFooterVariants` with `HeaderFooterField`;
- `ResearchMetadata`.

`paginate()` exists but no editor uses it.

These parts are incomplete:
- `documentToHtml` print CSS hard-codes the header (`string(document-title)`) and footer (`counter(page) " / " counter(pages)`). It ignores the stored headers and footers, the first page, odd/even pages, the starting number, columns and mirrored margins.
- DOCX export lives in the web editor copy (`exporters.ts`). It maps only basic content, passes margins in points where the `docx` library expects twips (points × 20), and writes no headers, footers or page-number fields.
- DOCX import does not exist.

This item makes the SDK the single place for page layout rules, print CSS, Word export and Word import. The web app owns the screens. The backend owns import jobs and storage.

## Rules for this item

- Follow `AGENTS.md`:
  - write the failure list and tests before the code;
  - prefer realistic end-to-end scenarios that leave checkable artifacts;
  - no AI attribution anywhere.
- `packages/core` stays free of DOM, React, Tiptap, Paged.js and DOCX libraries.
- `packages/docx` is pure TypeScript with no DOM or React. It must run in the browser (web export) and in Node (backend import), and takes its dependencies as pinned, reviewed versions.
- Calculated page boundaries, zoom and page gaps never enter the canonical document.
- Every public function documents the units it takes (points in the model; twips and EMU only inside `packages/docx`).

## Status board

| Phase | What | Status | Unblocks |
|---|---|---|---|
| SDK-1 | Layout helpers and fixtures | **Done** | FE-2 |
| SDK-2 | Print CSS from the real layout | After SDK-1 | FE-4 |
| SDK-3 | Page regions for the live paginator | After SDK-1 | FE-3 |
| SDK-4 | Release `0.3.0` | After SDK-1, 2, 3 | FE-8, BE-2 |
| SDK-5 | `@incantly/canvas-docx` export | After SDK-1 | FE-5 (Word) |
| SDK-6 | `@incantly/canvas-docx` import | After SDK-5 | BE-3 |
| SDK-7 | Release `0.4.0` (core + docx) | After SDK-5, 6 | BE-3, FE-5, FE-8 |

When a phase is done, tick its boxes, set its row to **Done**, and pass on its hand-off line.

---

## SDK-1 — Layout helpers and fixtures

**Goal:** one tested place that answers "what header/footer shows on page N, and what does each field say", so the web editor, print CSS and DOCX all agree.

**Depends on:** nothing.

### To-dos
- [x] List the failure cases first:
  - missing `layout`;
  - a section with no headers;
  - `first` set without `default`;
  - odd/even with a starting number that is even;
  - a document with no title;
  - an unknown field type;
  - a negative or zero starting number.
- [x] `resolvePageLayout(document)`: returns the effective default section and the ordered sections (each with its `startNodeId` and merged `PageSetup`). Missing layout falls back to `metadata.pageSetup`.
- [x] `headerFooterFor(section, { pageIndexInSection, printedPageNumber, kind: 'header' | 'footer' })` returns the variant to use (it takes the printed number rather than the absolute one, because only the caller knows where earlier sections restarted; `numberPages(layout, sectionPageCounts)` computes both):
  - `first` on the section's first page when it is set;
  - otherwise `odd`/`even` when set, decided by the **printed** page number, which includes `startingPageNumber`;
  - otherwise `default`.
- [x] `formatHeaderFooterField(field, context)` for `pageNumber`, `pageCount`, `documentTitle` and `currentDate`:
  - honours `format` (for numbers: `decimal`, `lower-roman`, `upper-roman`; for dates: a small documented token set);
  - an unknown field returns an empty string plus a warning.
- [x] `headerFooterPlainText(content, context)`: renders a `HeaderFooterContent[]` to plain text for previews.
- [x] Builders for the UI and the importer, each returning a new layout and never mutating:
  - `setHeaderFooter(layout, sectionId, kind, variant, content)`;
  - `setDifferentFirstPage(...)`;
  - `setDifferentOddEven(...)`.
- [x] Validation and normalization:
  - header/footer content only allows inline-safe nodes (paragraph, text with marks, fields);
  - clamp `startingPageNumber` ≥ 1;
  - `columns` ∈ {1, 2}.
- [x] Fixtures, closing the open item from `DOCUMENT_WEB_IMPLEMENTATION_TODO.md` §12.1:
  - custom paper;
  - mirrored margins;
  - default/first/odd/even headers and footers;
  - explicit page breaks;
  - two sections with different orientation;
  - two columns.
- [x] Export everything from `@incantly/canvas-core/document` and document it in the package README.

**Done when:** the fixtures round-trip through `parseIncantlyDocument`/`validateDocument` unchanged, and the helper tests cover every failure case listed above.

**Notes from implementation:**
- `normalizeDocument` used to drop `metadata.layout`, so `serializeIncantlyDocument` lost headers and footers. It now keeps and repairs the layout.
- **Decision (2026-11-02): fields sit inside paragraph text, like Word.** The new inline node is `InlineFieldNode { type: 'field', field, format? }`.
  - It is valid only in the `content` of header/footer paragraphs. In body text it is a validation error, and recovery removes it with a warning.
  - At the type level it is not part of the body `InlineNode` union; header/footer paragraphs use `HeaderFooterInlineNode = InlineNode | InlineFieldNode`.
  - Each header/footer paragraph is one line.
  - Older content with top-level fields still validates and loads. Normalization moves those fields inline by the old line rule: a field joins the line of the paragraph before it, a paragraph straight after a field joins that line, and a field that comes first starts the line. A joined line keeps its first paragraph's ID and alignment.
  - `MAX_HEADER_FOOTER_ITEMS` counts paragraphs plus fields, inline fields included.
  - `v1-pages-legacy-fields.json` keeps the old form as a compatibility fixture.
- Paragraph IDs in header/footer content only need to be unique inside one variant.

**Hand-off:** "SDK-1 is done: tell the web agent FE-2 (header & footer editor) can use `headerFooterFor`, `formatHeaderFooterField` and the layout builders."

---

## SDK-2 — Print CSS from the real layout

**Goal:** the HTML export and Paged.js preview/PDF show exactly the stored page setup, headers and footers.

**Depends on:** SDK-1.

### To-dos
- [ ] List the failure cases first:
  - a header containing quotes or backslashes (CSS string escaping);
  - an empty header;
  - only a `first` variant;
  - odd/even with a starting number of 2;
  - mirrored margins with one column;
  - a landscape section after a portrait one;
  - a very long footer.
- [ ] In `html.ts`, replace the hard-coded `printRules` with rules generated from `resolvePageLayout`:
  - `@page` size, orientation and margins per section (named pages, `page: section-<id>`, with a `break-before: page` at each section start);
  - margin boxes (`@top-left/center/right`, `@bottom-*`) from header/footer content: text becomes CSS strings, `pageNumber` becomes `counter(page)` with the right `counter-style`, `pageCount` becomes `counter(pages)`, `documentTitle` becomes the escaped title, `currentDate` becomes the formatted export date;
  - alignment of a header/footer paragraph picks the left, center or right box;
  - `@page :first` for the `first` variant, including an empty first variant, which means no header;
  - `@page :left` / `:right` for even/odd, mapped through the starting page number's parity;
  - `counter-reset: page <startingPageNumber - 1>` on the first page of the document;
  - mirrored margins: swap left and right margins on `:left` pages;
  - columns: `column-count` and `column-gap` on the section's content wrapper.
- [ ] Keep `string-set` only where a field needs running text.
- [ ] Return layout warnings (e.g. "rich formatting in headers is printed as plain text").
- [ ] Visual-regression artifacts through the demo's Paged.js preview, closing §13.5 "visual-regression fixtures":
  - A4 and Letter;
  - margins;
  - default/first/odd/even headers;
  - starting page 5;
  - two columns;
  - a long table;
  - an equation;
  - an image;
  - a forced page break.

**Done when:** each SDK-1 fixture prints in the demo with the right header/footer on pages 1, 2 and 3. The artifacts are saved under `e2e-artifacts/document-pages/`.

**Hand-off:** "SDK-2 is done: tell the web agent FE-4 (print preview and PDF) is ready."

---

## SDK-3 — Page regions for the live paginator

**Goal:** the web editor can draw accurate page lines from real page size, margins and header/footer space, using `paginate()` instead of a fixed 1,056 px.

**Depends on:** SDK-1.

### To-dos
- [ ] List the failure cases first:
  - zero-height content;
  - a block taller than a page;
  - a section change mid-document;
  - headers taller than the margin;
  - a zoom factor other than 1.
- [ ] `pageRegions(document, { pxPerPoint })`: per section, the content box height and width in CSS px, after margins and the reserved header/footer distance. It includes the column count.
- [ ] `paginateDocument(document, measurements, { pxPerPoint })` wraps `paginate()` and returns, per page:
  - its section;
  - its absolute and printed page number;
  - the block ID where it starts;
  - warnings, such as an unbreakable block taller than a page.
- [ ] Respect explicit `pageBreak` nodes and section starts.
- [ ] Keep it pure; the DOM measurement stays in the web adapter.
- [ ] Performance check against the budgets in `DOCUMENT_PAGINATION_EXPORT.md` (10/100/500 pages).

**Done when:** a scripted measurement set for a 100-page fixture gives deterministic page starts within budget, and an oversized block yields a warning instead of a loop.

**Hand-off:** "SDK-3 is done: tell the web agent FE-3 (accurate page lines) is ready."

---

## SDK-4 — Release 0.3.0

**Depends on:** SDK-1, SDK-2 and SDK-3 done.

### To-dos
- [ ] Bump `@incantly/canvas-core` to `0.3.0`, update `CHANGELOG.md` (no AI attribution), and run typecheck, tests and the package build.
- [ ] Publish to GitHub Packages following `docs/RELEASING.md` / `docs/installing.md`.
- [ ] Produce the tarball (`npm pack`) for the backend, which vendors the SDK as a `.tgz` file. Note that the backend still uses the old name `@incantly/core`.

**Hand-off:** "SDK 0.3.0 is published: tell the web agent FE-8 can move to it, and the backend agent BE-2 can vendor it."

---

## SDK-5 — Word export (`@incantly/canvas-docx`)

**Goal:** a real `.docx` that keeps pages and content, generated from the canonical model. It replaces the web app's inline DOCX code.

**Depends on:** SDK-1.

### To-dos
- [ ] Create `packages/docx` (`@incantly/canvas-docx`). It depends on `@incantly/canvas-core` and a pinned `docx` version, has no DOM or React, and loads on demand.
- [ ] List the failure cases first:
  - a missing asset;
  - an unsupported embed (video, canvas);
  - nested lists more than 9 deep;
  - merged table cells;
  - a link with a bad URL;
  - an empty document;
  - a huge image;
  - inline math.
- [ ] API: `exportDocx(document, { resolveAsset }) → { bytes, warnings }`. `resolveAsset(assetId)` returns `{ bytes, mimeType, width, height }`, or null with a warning.
- [ ] Pages:
  - one Word section per `PageLayout` section;
  - size and orientation;
  - margins converted points → twips (fixing today's bug);
  - header/footer distance;
  - mirrored margins (`mirrorMargins`);
  - columns;
  - `pgNumType start` from `startingPageNumber`.
- [ ] Headers and footers:
  - `default`/`first` (`titlePage`) and `odd`/`even` (`evenAndOddHeaders`);
  - fields as live `PAGE`, `NUMPAGES`, title text and date fields.
- [ ] Content:
  - headings → Word heading styles;
  - paragraph alignment and line height;
  - marks: bold, italic, underline, strike, code, color, highlight, font family and size;
  - links;
  - bullet, ordered and checklist lists with real numbering definitions;
  - tables with header rows;
  - code blocks in a monospace style;
  - block and inline math (OMML when practical; otherwise LaTeX text plus a warning);
  - images with size and alignment;
  - page breaks;
  - blockquote style;
  - horizontal rule.
- [ ] A warning for every dropped or downgraded node, and no silent loss.
- [ ] Artifacts: export every SDK-1 fixture plus a "research paper" fixture (title page, abstract, two columns, tables, equations, figures, numbered footer). Unzip-inspect the XML and smoke-open the files in LibreOffice (headless) and Word, saving the artifacts.

**Done when:** the research-paper fixture opens in LibreOffice and Word with the right paper, margins, first-page footer and page numbers, and the warnings list matches what was downgraded.

**Hand-off:** "SDK-5 is done: tell the web agent the Word part of FE-5 can use `exportDocx`."

---

## SDK-6 — Word import (`@incantly/canvas-docx`)

**Goal:** turn a `.docx` from Word, WPS or Google Docs into a canonical note that keeps content, formatting and page layout, with a clear report of anything simplified.

**Depends on:** SDK-5, so tests can round-trip.

### To-dos
- [ ] List the failure and attack cases first:
  - not a zip;
  - a zip bomb (huge uncompressed size or entry count);
  - missing `document.xml`;
  - external relationships (remote images or links);
  - `.docm` macros;
  - an encrypted file;
  - huge or deep XML;
  - DTDs and entities (must not expand);
  - unknown elements;
  - a numbering reference to nothing;
  - a header referencing a missing part.
- [ ] API: `importDocx(bytes, { limits }) → { document, assets: [{ ref, bytes, mimeType, filename }], report }`.
  - The document references images by a temporary `ref`. The backend swaps each `ref` for a real `assetId` after storing the bytes.
  - `limits` covers max uncompressed bytes, entries, paragraphs, images and image bytes.
- [ ] Parsing: `fflate` for the zip and a pinned XML parser with DTD/entity processing **off**. Read:
  - `document.xml`;
  - `styles.xml`, including style inheritance and defaults;
  - `numbering.xml`;
  - relationships;
  - header and footer parts;
  - `settings.xml` (even/odd headers);
  - `sectPr` per section.
- [ ] Map to canonical:
  - paragraphs, and headings (from outline level or heading styles);
  - alignment and spacing;
  - runs with bold, italic, underline, strike, color, highlight, font family and size;
  - hyperlinks (http(s) and mailto only);
  - lists, with levels and ordered/bullet decided from numbering formats;
  - checkbox content controls → checklist;
  - tables, including header rows (merged cells: keep the content, report the merge if the model can't hold it);
  - inline images → image assets;
  - page and section breaks;
  - page size, orientation, margins, mirrored margins, columns and starting number per section;
  - headers and footers (default/first/even), with `PAGE` and `NUMPAGES` fields → `HeaderFooterField`;
  - OMML equations → LaTeX `mathBlock` / `inlineMath`, with readable text as the fallback.
- [ ] Downgrades, each recorded in `report` with a count:
  - floating or anchored images → inline;
  - text boxes and shapes → their text;
  - SmartArt and charts → their fallback image if present, else omitted;
  - footnotes and endnotes → a numbered "Notes" section at the end with in-text markers, until the model has footnotes;
  - comments and tracked changes → accepted text, with comments dropped;
  - a table of contents → removed, with a note to regenerate it;
  - unknown fields → their displayed result text.
- [ ] Stable fresh node IDs. Run the output through `normalizeDocument` and `validateDocument`; never return an invalid document.
- [ ] Round-trip tests: for each SDK-5 fixture, `importDocx(exportDocx(doc))` must keep the same text, structure, page setup and header/footer fields.
- [ ] Real-world fixtures (license-safe, saved in the repo):
  - a Word paper (two columns, equations, figures);
  - a Google Docs export;
  - a WPS export;
  - a document with a title page and roman-numbered front matter.
- [ ] Document the mapping table and the report codes in the package README.

**Done when:** the real-world fixtures import with their layout kept and an accurate report, the attack fixtures fail fast with typed errors, and every round-trip test passes.

**Hand-off:** "SDK-6 is done: tell the backend agent BE-3 (Word note import) can use `importDocx` once SDK-7 is released."

---

## SDK-7 — Release 0.4.0 (core + docx)

**Depends on:** SDK-5 and SDK-6 done.

### To-dos
- [ ] Bump `@incantly/canvas-core` and `@incantly/canvas-docx` to `0.4.0` and update `CHANGELOG.md`.
- [ ] Publish both to GitHub Packages, and `npm pack` both tarballs for the backend.

**Hand-off:** "SDK 0.4.0 is published: tell the backend agent BE-3 can start, and the web agent FE-5 (Word export) and FE-8 can move to it."

---

## Not in this item

- Footnotes as real model nodes (needs a schema change; the import uses a "Notes" section until then).
- A downloadable-PDF worker using headless Chromium (§13.5). The web app uses the browser's print to PDF.
- Comments and tracked changes in the model.
