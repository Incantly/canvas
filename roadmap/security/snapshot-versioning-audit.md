# Snapshot Versioning — Security Audit

**Feature:** snapshot-versioning (`feat/snapshot-versioning`)  
**Date:** 2026-08-31  
**Status:** PASS

## Scope

- `packages/core/src/version-history.ts` — VersionManager, pruning, revert
- `packages/core/src/migrations/*` — forward snapshot migrations
- `packages/core/src/storage/memory-version-storage.ts` — in-memory adapter
- `packages/core/src/storage/indexed-db-version-storage.ts` — browser persistence
- `packages/core/src/store.ts` — `loadSnapshot` / `getSnapshot`
- `packages/react-native/src/webview-entry.ts` — `listVersions`, `revertVersion`, `saveVersion`
- `packages/react-native/src/index.tsx` — RN `onMessage` routing

## Findings

| Severity | Finding | Status |
| --- | --- | --- |
| — | No Critical or High findings | **PASS** |

## Review notes

### 1. Snapshot injection / oversized payload

- **Migration path:** `migrateSnapshot` deep-clones input via `structuredClone`, normalizes missing `document.store`, then runs registered migration `up()` functions only — no dynamic code paths from JSON keys.
- **Load path:** `Store.loadSnapshot` calls `migrateSnapshot`, then inserts only records with a truthy `id` field. Malformed or type-confused entries are skipped.
- **Storage caps:** `VersionManager` enforces `maxVersions` (default 15) and `maxStorageMb` (default 50) by pruning oldest autosaves / versions. IndexedDB writes surface `QuotaExceededError` as a user-visible message.
- **Residual risk (Low):** `init` / `loadSnapshot` bridge messages accept arbitrary snapshot JSON with no byte-size guard. A hostile host could pass a very large payload and cause memory pressure. Mitigation: host app controls `init.snapshot`; web playground is dev-only. Recommend app-level size limits for untrusted imports.

### 2. No arbitrary code execution from stored version JSON

- Version blobs are plain JSON objects. No `eval`, `Function`, or `new Function` on snapshot or version records.
- Migrations are statically registered TypeScript functions (`registerMigration`); snapshot content cannot register new migration steps.
- `JSON.parse` / `structuredClone` only — prototype-pollution keys in stored JSON do not execute code. `Object.values(store)` iterates own enumerable keys.
- Rich-text / document blocks flow through `validateDocumentBlocks` during migration (e.g. notebook v2 strips invalid drawings; image v3 strips empty `src`).
- **Residual risk (Low):** `javascript:` or `data:` URLs in image block `src` are preserved if non-empty. Rendering is same as existing document-mode paste path; not introduced by versioning.

### 3. IndexedDB storage boundaries

- Database: `incantly-versions` v1, object store `versions`, keyed by `id`.
- **Read filtering:** `isValidDocumentVersion` requires `id`, `notebookId`, `createdAt`, `kind`, `snapshot`, and `schema` before returning a row from `list` / `get`.
- **Notebook scoping:** `get` and `list` filter by `notebookId`; cross-notebook access by `versionId` alone is rejected.
- **Corrupt rows:** Invalid cursor values are skipped on `list` (same pattern as `MemoryVersionStorage`).
- **Quota:** `put` maps `QuotaExceededError` to a clear error string; no silent data loss.
- **Residual risk (Low):** No encryption at rest — expected for local-first canvas data; host apps with compliance needs should encrypt IDB or use custom `VersionStorage`.

### 4. RN bridge message validation (`listVersions` / `revertVersion` / `saveVersion`)

| Message | Validation | Error handling |
| --- | --- | --- |
| `listVersions` | Requires `board` initialized; no `versionId` needed | Silent no-op if not mounted |
| `revertVersion` | Passes `m.versionId` to `VersionManager.revert` | Missing / unknown id → `Error` caught → `{ type: 'error', message }` posted |
| `saveVersion` | Optional `m.label` (any type at runtime) | Failure → error post |

- Unknown `type` values are ignored in `dispatch` (`!handlers[m.type]`).
- Malformed JSON on RN `onMessage` is caught and dropped (`JSON.parse` try/catch).
- `encodeDispatch` escapes U+2028/U+2029 to prevent JS injection when injecting bridge commands.
- **List response minimization:** WebView posts `versionSummary` only (`id`, `createdAt`, `label`, `kind`) — full snapshots are not sent over the bridge.
- **Residual risk (Low):** `revertVersion` does not assert `typeof versionId === 'string'` before lookup; non-string values fail lookup safely with "Version not found" error.

### 5. PII stays local

- Version storage defaults to `MemoryVersionStorage` inside the RN WebView bundle — data never leaves the WebView process unless the host explicitly reads snapshots via `getSnapshot`.
- `IndexedDbVersionStorage` persists only in the user's browser origin; no network sync in this feature.
- Bridge list/save/revert responses expose metadata only, not document content.
- Autosave checkpoints may contain user-drawn content in local storage — same trust boundary as the canvas document itself.

## Adversarial test coverage

| Scenario | Location |
| --- | --- |
| Double `migrateSnapshot` on same input | `packages/core/test/migrations.test.ts` |
| Corrupt snapshot (`null` store, invalid records) | `packages/core/test/migrations.test.ts` |
| Revert to missing `versionId` throws | `packages/core/test/version-history.test.ts` |
| Corrupt version rows skipped on list | `packages/core/test/version-history.test.ts` |
| Bridge malformed version messages | `packages/react-native/test/webview-version-dispatch.test.ts` |

## Deferred / Low

| Severity | Item |
| --- | --- |
| Low | App-level max snapshot byte size for untrusted `init.snapshot` / imports |
| Low | Coerce `saveVersion.label` to `string \| undefined` at bridge boundary |
| Low | Optional IDB encryption for regulated deployments |
