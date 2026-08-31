# 16 — Snapshot versioning

**Branch:** `feat/snapshot-versioning`
**Depends on:** [03-rich-text-editor](./03-rich-text-editor.md) (notebook.document, ImageBlock), [13-sync-package](./13-sync-package.md) (future server checkpoints)

## Problem

Today snapshots have **no schema tag** and migrations are ad-hoc methods invoked manually in `loadSnapshot` (`migrateRichText`, `migratePageDocuments`, `migrateNotebookDocument`). The `Snapshot` type is only `{ document: { store } }` with no version metadata. Undo/redo is in-memory only — no user-visible version timeline or revert.

Partial migration code exists (tests in `store.test.ts`, `page-document.test.ts`) but lacks:

- Explicit schema sequences and version numbers
- An idempotent, ordered migration runner
- Schema stamped on every `getSnapshot()`
- Document version checkpoints with revert

## Overview — two-layer approach

| Layer | Purpose | User-visible |
|-------|---------|--------------|
| **Schema versioning** | Old files load correctly after model changes | No |
| **Document history** | Browse and revert past edits | Yes |

**Layer 1 (schema versioning)** formalizes existing ad-hoc migrations into a tldraw-style sequence registry. Each migration sequence has a string ID and incrementing version number. On load, `migrateSnapshot` determines which migrations are needed by comparing the snapshot's `schema.sequences` against `CURRENT_SCHEMA` and runs only the missing ones in defined order.

**Layer 2 (document history)** adds `VersionManager` which creates full-snapshot checkpoints (autosave, manual, revert, import) stored via a `VersionStorage` adapter. IndexedDB on web, `MemoryVersionStorage` in RN WebView for v1. The adapter interface is sync-ready for future server storage (doc 13).

---

## Layer 1 — Schema versioning

### Key types — `packages/core/src/types/schema.ts`

```typescript
export interface SerializedSchema {
  schemaVersion: 1;
  sequences: Record<string, number>;
}

export const CURRENT_SCHEMA: SerializedSchema = {
  schemaVersion: 1,
  sequences: {
    "com.incantly.store": 1,
    "com.incantly.shape.text": 1,
    "com.incantly.page.document": 2,
    "com.incantly.notebook.document": 3,
  },
};
```

Extend `Snapshot` (backward compatible — old snapshots without `schema` still load):

```typescript
export interface Snapshot {
  schema?: SerializedSchema;
  document: { store: Record<string, BoardRecord> };
}
```

### Migration module — `packages/core/src/migrations/`

Hand-implemented (no npm deps).

| File | Role |
|------|------|
| `index.ts` | `migrateSnapshot(snap): Snapshot`, `getMigrationsSince(from, to)` |
| `sequences.ts` | Registry of all sequences + current versions |
| `store.ts` | Orphan shapes → default page, notebook bootstrap |
| `shape-text.ts` | Wraps `migrateTextProps` |
| `page-document.ts` | Formalize `migratePageDocuments` |
| `notebook-document.ts` | Formalize `migrateNotebookDocument` + ImageBlock validation |

### Migration sequences (forward-only)

| Sequence | v | What it does |
|----------|---|-------------|
| `com.incantly.store` | 1 | Ensure notebook + page exist; assign orphan shape `parentId` |
| `com.incantly.shape.text` | 1 | Legacy `props.text` string → `props.blocks` on text/note shapes |
| `com.incantly.page.document` | 1 | Per-page `page.document` from text shapes or default paragraph |
| `com.incantly.page.document` | 2 | Merge orphaned text shapes into page body; strip duplicate `page.document` when notebook owns doc |
| `com.incantly.notebook.document` | 1 | Merge per-page documents → `notebook.document.blocks[]` |
| `com.incantly.notebook.document` | 2 | `validateDocumentBlocks` + consolidate drawing blocks |
| `com.incantly.notebook.document` | 3 | Accept/normalize `ImageBlock`; reject empty `src` |

### Migration execution order

**`store` → `shape.text` → `page.document` → `notebook.document`**

The `store` migration runs first because all other migrations depend on notebook and page records existing. `relayoutPages` is NOT a migration — it is a runtime concern and stays in `normalizePages` after the migration module runs.

### Deep clone constraint

`migrateSnapshot` must `structuredClone(snap)` at the top before running any mutations. This prevents corrupting version checkpoint references or caller-held snapshot objects.

Each migration is a pure function: `(snap: Snapshot) => Snapshot` mutating store records in the snapshot clone (not live store), so tests can run without side effects.

### Store refactor — `packages/core/src/store.ts`

- **`getSnapshot()`** — attach `schema: CURRENT_SCHEMA`
- **`loadSnapshot()`** — replace manual migration calls with:
  1. `const migrated = migrateSnapshot(snap)` (pure, deep-clones input)
  2. Apply migrated store to live records (`source: 'remote'`)
  3. `normalizePages('remote')` (runtime-only: relayout page positions)
  4. Clear undo/redo (unchanged)
- **Refactor `normalizePages`** — remove migration calls; it should only handle runtime layout (page x/y coordinates)
- **Deprecate public** `migrateRichText` / `migratePageDocuments` / `migrateNotebookDocument` on Store — keep thin wrappers calling migration module during transition
- **Export** `migrateSnapshot`, `SerializedSchema`, `CURRENT_SCHEMA` from `packages/core/src/index.ts`

---

## Layer 2 — Document version history

### Key types — `packages/core/src/version-history.ts`

```typescript
export type VersionKind = "autosave" | "manual" | "revert" | "import";

export interface DocumentVersion {
  id: string;
  notebookId: string;
  createdAt: number;
  label?: string;
  kind: VersionKind;
  schema: SerializedSchema;
  snapshot: Snapshot;
}

export interface VersionStorage {
  list(notebookId: string, opts?: { limit?: number }): Promise<DocumentVersion[]>;
  get(notebookId: string, versionId: string): Promise<DocumentVersion | null>;
  put(version: DocumentVersion): Promise<void>;
  delete(notebookId: string, versionId: string): Promise<void>;
  prune(notebookId: string, keep: number): Promise<void>;
}

export interface VersionManagerOptions {
  storage: VersionStorage;
  store: Store;
  notebookId: string;
  autosaveMs?: number;    // default 45000
  maxVersions?: number;   // default 15
  maxStorageMb?: number;  // default 50 — soft cap; prune aggressively when exceeded
  onVersionsChange?: () => void;
}

export interface VersionManager {
  checkpoint(kind?: VersionKind, label?: string): Promise<DocumentVersion>;
  list(): Promise<DocumentVersion[]>;
  revert(versionId: string): Promise<void>;
  dispose(): void;
}
```

### Revert rules

- Load version snapshot via `store.loadSnapshot(version.snapshot, 'remote')` (skips undo stack)
- Run schema migrations inside snapshot before apply
- Auto-checkpoint current state as `kind: 'revert'` before restoring (so user can undo a revert)

### Checkpoint triggers

- Debounced autosave after store `listen` (exclude `source: 'remote'`)
- Manual "Save version" from UI
- Before `clearBoard`, import, revert

### Dirty check

Before autosave, compare a fast hash (or `JSON.stringify` length) of `store.getSnapshot().document` against the last checkpoint. Skip if unchanged — avoids storing duplicate snapshots when the user pauses editing.

### Storage size budget

Full snapshots include ImageBlock data URLs inline. A notebook with 10 images at ~500KB each = ~5MB per snapshot. With `maxVersions: 15` that is up to ~75MB. The `maxStorageMb` soft cap (default 50MB) triggers aggressive pruning — drop oldest autosave versions first, keep manual/revert versions longer. `prune()` logs a warning when evicting due to size.

### Storage adapters

| Platform | Adapter | Notes |
|----------|---------|-------|
| Web | `IndexedDbVersionStorage` | `packages/core/src/storage/indexed-db-version-storage.ts` — hand-rolled, no `idb` npm |
| RN (v1) | `MemoryVersionStorage` | Runs inside WebView alongside Store. Ephemeral (lost on WebView destroy) |
| Memory | `MemoryVersionStorage` | Tests + playground + RN v1 |

**RN v1 decision:** VersionManager + MemoryVersionStorage lives inside the WebView. No new npm peer dependency. AsyncStorageVersionStorage deferred to follow-up (doc 15 scope).

Sync-ready: `VersionStorage` interface is what doc 13 server will implement later; no server code in this branch.

### RN bridge — `packages/react-native/src/webview-entry.ts`

Version history runs inside WebView (store lives there). Bridge messages:

| RN → Web | Web → RN |
|----------|----------|
| `listVersions` | `versions` (id, createdAt, label, kind) |
| `revertVersion` | `reverted` |
| `saveVersion` | `versionSaved` |

VersionManager + MemoryVersionStorage run inside the WebView for v1. RN native UI lists/reverts versions through bridge requests. No native-side storage adapter needed this branch.

---

## Playground and demos

### Web — `apps/playground/src/panels/VersionHistoryPanel.tsx`

- Document mode canvas + side panel listing checkpoints (timestamp, kind, label)
- "Save version" button for manual checkpoints
- Version list is metadata only (no thumbnail preview in v1)
- "Restore" button per version → confirm dialog → revert
- Register in `FeatureIndex.tsx`

### RN — `packages/react-native/example/App.example.tsx`

- Document mode + `onReady` → edit text → list versions via ref/bridge
- Smoke: revert restores prior text

---

## Key files to touch

| File | Change |
|------|--------|
| `packages/core/src/types/operations.ts` | Optional `schema` on Snapshot |
| `packages/core/src/types/schema.ts` | New — `SerializedSchema`, `CURRENT_SCHEMA` |
| `packages/core/src/store.ts` | Delegate to migration module; refactor normalizePages |
| `packages/core/src/migrations/*` | New — formal migrations + runner |
| `packages/core/src/version-history.ts` | New — VersionManager + checkpoints + revert |
| `packages/core/src/storage/indexed-db-version-storage.ts` | New — hand-rolled IndexedDB adapter |
| `packages/core/test/migrations.test.ts` | New — v0→current chain + idempotency |
| `packages/core/test/fixtures/` | New — versioned snapshot JSON files |
| `packages/core/test/version-history.test.ts` | New — checkpoint + revert + prune tests |
| `apps/playground/src/panels/VersionHistoryPanel.tsx` | New — playground demo panel |

---

## Acceptance criteria

- [ ] Pre-schema snapshots (no `schema` field) load via full migration chain
- [ ] `getSnapshot()` always includes `schema: CURRENT_SCHEMA`
- [ ] Migrations idempotent — run twice on same snapshot, identical result
- [ ] Migration execution order enforced: `store` → `shape.text` → `page.document` → `notebook.document`
- [ ] `migrateSnapshot` deep-clones input (`structuredClone`) before mutating
- [ ] Existing migration tests (`store.test.ts`, `page-document.test.ts`) still pass
- [ ] `VersionManager.checkpoint()` creates retrievable version
- [ ] Autosave debounced with dirty-check (skip when snapshot unchanged)
- [ ] `maxVersions` prune (default 15) drops oldest, keeps newest
- [ ] `maxStorageMb` soft cap (default 50MB) triggers aggressive pruning
- [ ] `revert(versionId)` restores content; undo stack cleared; uses `source: 'remote'`
- [ ] IndexedDB quota exceeded → user-safe error, no crash
- [ ] RN bridge: `listVersions` / `revertVersion` / `saveVersion` validated
- [ ] Playground `VersionHistoryPanel` registered in FeatureIndex
- [ ] RN example app: edit → list versions → revert smoke

---

## Workstream breakdown

| # | Workstream | Owner | Deliverable |
|---|-----------|-------|-------------|
| W1 | Schema types + migration module | Implementer | `types/schema.ts`, `migrations/*` |
| W2 | Store refactor (get/load snapshot) | Implementer | `store.ts` uses `migrateSnapshot` |
| W3 | Migration idempotency + ImageBlock v3 | Implementer | Tests for v0→current + `test/fixtures/` versioned snapshot JSON |
| W4 | VersionManager + IndexedDB + Memory storage | Implementer | `version-history.ts`, `indexed-db-version-storage.ts` |
| W5 | Playground VersionHistoryPanel | Implementer | Web demo |
| W6 | RN bridge + MemoryVersionStorage + example | Implementer | Bridge messages, example app (AsyncStorage deferred) |
| W7 | Breaker adversarial tests | Breaker | Corrupt snapshots, double migrate, revert undo isolation |
| W8 | Security audit | Security | `roadmap/security/snapshot-versioning-audit.md` |

### Implementation order

1. **W1 + W2** — Schema + refactor store; all existing migration tests must pass
2. **W3** — Idempotency + v0 fixture snapshots + ImageBlock v3
3. **W4** — VersionManager + memory storage + unit tests
4. **W5** — IndexedDB + playground panel
5. **W6** — RN bridge + MemoryVersionStorage in WebView + example
6. **W7 + W8** — Breaker + Security + Verifier

---

## Non-goals (this branch)

- Server-side version sync (doc 13 / 11)
- Per-block audio version timelines (whole-notebook checkpoints only)
- Branching / merge conflict UI
- Diff-only storage (full snapshots for v1; hybrid later if size becomes an issue)
- Persistent RN version storage (AsyncStorageVersionStorage deferred to follow-up / doc 15)
- Version thumbnail preview in playground (metadata-only list for v1)

## Approved package exceptions

**None.** No new npm dependencies in this branch. AsyncStorage adapter deferred to follow-up.

| Prefer hand-rolled | Avoid |
|--------------------|-------|
| Migration runner + sequences (`packages/core/src/migrations/`) | Generic migration libs |
| IndexedDB version storage | `idb`, Dexie |
| VersionManager checkpoint logic | Event-sourcing frameworks |
| Snapshot schema (Incantly `SerializedSchema`) | Copy-paste tldraw store package |

---

## QA tracking

### Sub-agent pipeline

Coordinator → SpecChecker → Implementer → Breaker → Fixer → IntegrationTester → Security → SecurityFixer → Verifier → Committer

### Sub-agent spin-up template

```text
Role: <Coordinator|SpecChecker|Implementer|Breaker|Fixer|IntegrationTester|Security|SecurityFixer|Verifier|Committer>
Feature: snapshot-versioning
Branch: feat/snapshot-versioning
Read: roadmap/16-snapshot-versioning.md
Read: roadmap/QA_CHECKLIST.md
Constraints:
  - Hand-implement migrations + IndexedDB in packages/core (no idb, no Yjs)
  - No new npm dependencies (RN uses MemoryVersionStorage in WebView; AsyncStorage deferred)
  - migrateSnapshot must structuredClone input before mutating
  - Migration order: store → shape.text → page.document → notebook.document
  - Forward-only snapshot migrations; schema stamped on getSnapshot
  - Revert uses loadSnapshot(..., 'remote'); remote diffs skip undo
  - VersionStorage adapter pattern for future sync (doc 13)
  - Playground VersionHistoryPanel + RN example revert before Verifier PASS
  - npm run typecheck && npm test && npm run build:packages
  - Security PASS before commit (storage + bridge)
  - commits: no Cursor author/Co-authored-by; only when user asks
```

### Workstream tracking

| Workstream | Status |
|-----------|--------|
| W1 — Schema types + migration module | missing |
| W2 — Store refactor (get/load snapshot) | missing |
| W3 — Migration idempotency + ImageBlock v3 | missing |
| W4 — VersionManager + IndexedDB + Memory storage | missing |
| W5 — Playground VersionHistoryPanel | missing |
| W6 — RN bridge + MemoryVersionStorage + example | missing |
| W7 — Breaker adversarial tests | missing |
| W8 — Security audit | missing |

### Feature-specific checks

| Check | Status |
|-------|--------|
| Pre-schema snapshot (no `schema` field) loads via full migration chain | missing |
| Snapshot with `schema.sequences` at v0 loads only needed migrations | missing |
| `getSnapshot()` always includes `schema: CURRENT_SCHEMA` | missing |
| `migrateRichText` behavior preserved (legacy `props.text` → blocks) | missing |
| `migratePageDocuments` behavior preserved (text shapes → page/notebook body) | missing |
| `migrateNotebookDocument` behavior preserved (per-page → notebook.document) | missing |
| Migrations idempotent — run twice, identical store JSON | missing |
| ImageBlock normalized in notebook.document v3 migration | missing |
| Unknown `schemaVersion` throws in dev with clear message | missing |
| `VersionManager.checkpoint()` creates retrievable version | missing |
| Autosave debounced (not every pointer move) | missing |
| Autosave dirty-check skips checkpoint when snapshot unchanged | missing |
| `maxVersions` prune drops oldest, keeps newest N (default 15) | missing |
| `maxStorageMb` soft cap prunes aggressively when exceeded (default 50MB) | missing |
| `revert(versionId)` restores content; undo stack cleared | missing |
| Pre-revert checkpoint optional but tested when enabled | missing |
| IndexedDB quota exceeded → user-safe error, no crash | missing |
| MemoryVersionStorage (RN v1) ephemeral — no cross-session persistence tested | missing |
| Bridge: `listVersions` / `revertVersion` / `saveVersion` validated | missing |
| Bridge: malformed JSON ignored on RN `onMessage` | missing |
| Existing `store.test.ts` + `page-document.test.ts` migration tests still pass | missing |
| `test/fixtures/` contains versioned snapshot JSON (v0, v1, v2...) for chain | missing |
| `migrateSnapshot` deep-clones input (does not mutate caller's reference) | missing |

### Error checking gates

| Check | Status |
|-------|--------|
| Validate `Snapshot` shape before migrate (null store, bad records) | missing |
| Validate `versionId` exists before revert; throw if missing | missing |
| Validate notebookId on all VersionStorage operations | missing |
| TypeScript strict; no `@ts-ignore` without deferred note | missing |
| Dev: throw on unrecoverable migration; prod UI: inline error state | missing |
| Bridge rejects unknown message types without crashing WebView | missing |

### Data risk gates

| Check | Status |
|-------|--------|
| Forward-only migrations; never silently drop records | missing |
| Remote diffs (`source: 'remote'`) skip undo stack — unchanged | missing |
| Revert uses `source: 'remote'` — does not pollute undo | missing |
| Checkpoint snapshots include schema tag for future loads | missing |
| No secrets in snapshots or version storage | missing |
| PII stays local (IndexedDB / AsyncStorage); document in spec | missing |
| Corrupt version entry skipped on list; app continues | missing |
| Import/load validates snapshot before store.put | missing |

### Performance and teardown

| Check | Status |
|-------|--------|
| Checkpoint coalescing — no checkpoint per store diff during draw stroke | missing |
| Dirty check prevents duplicate checkpoints when content unchanged | missing |
| `maxStorageMb` prune prevents unbounded IndexedDB growth (ImageBlock) | missing |
| IndexedDB write async; does not block rAF render loop | missing |
| RN: WebView dispose clears VersionManager listeners | missing |
| Browser teardown: close Playwright/Chromium after visual QA if used | missing |

### Playground demo (web)

| Check | Status |
|-------|--------|
| `VersionHistoryPanel` in `apps/playground` FeatureIndex | missing |
| Edit note → autosave creates checkpoint | missing |
| "Save version" manual checkpoint with label | missing |
| List shows timestamps + kind (autosave/manual) | missing |
| Restore older version → content matches | missing |
| Restore after schema-tagged snapshot (post-migration) works | missing |

### React Native parity

| Check | Status |
|-------|--------|
| `webview-entry.ts`: listVersions, revertVersion, saveVersion handlers | missing |
| `CanvasRef` or bridge exposes version APIs | missing |
| Example app: edit → list versions → revert smoke | missing |
| MemoryVersionStorage runs inside WebView (ephemeral, documented) | missing |
| Rebuild `board-html.generated.js` after core changes | missing |

### Security (required — storage + bridge)

| Check | Status |
|-------|--------|
| Audit file: `roadmap/security/snapshot-versioning-audit.md` | missing |
| Snapshot injection / oversized payload handled | missing |
| No arbitrary code execution from stored version JSON | missing |
| Zero open Critical/High findings | missing |

### Functional verify (IntegrationTester)

| Check | Status |
|-------|--------|
| `npm run typecheck` all workspaces green | missing |
| `npm test` green (include new migrations + version-history tests) | missing |
| `npm run build:packages` green (core → react → react-native order) | missing |
| Fresh checkout: `rm -rf packages/*/dist && npm run build` passes | missing |

### Universal verifier gates

| Check | Status |
|-------|--------|
| `npm run typecheck` | missing |
| `npm test` | missing |
| `npm run build:packages` | missing |
| No new npm dependencies (AsyncStorage deferred to follow-up) | missing |
| Playground web panel demonstrates feature | missing |
| Playground RN scene demonstrates feature | missing |
| RN bridge updated for new store/version APIs | missing |
| Unit tests for core logic (not only happy path) | missing |
| Error paths tested (invalid input, corrupt snapshot) | missing |
| No `@ts-ignore` without deferred note | missing |
| Roadmap doc `16-snapshot-versioning.md` acceptance criteria checked | missing |
| Security audit PASS | missing |
| No Cursor in commits | missing |

### Per-feature gate

- [ ] Coordinator launched W1–W8
- [ ] SpecChecker PASS — hand-impl confirmed; no new deps
- [ ] Implementer(s) finished
- [ ] Breaker pass (or failures filed then fixed)
- [ ] Fixer loop complete if needed
- [ ] IntegrationTester — playground web + RN smoke PASS
- [ ] **Security PASS** — `roadmap/security/snapshot-versioning-audit.md`
- [ ] SecurityFixer complete if Critical/High found
- [ ] **Verifier PASS** — checklist rows + universal gates green
- [ ] Playground panel merged and documented in feature index
- [ ] Roadmap `16-snapshot-versioning.md` + README index updated
- [ ] Committer: author is not Cursor; no Co-authored-by trailers
