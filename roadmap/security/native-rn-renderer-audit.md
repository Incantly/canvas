# Native RN Renderer — Security Audit

**Feature:** native-rn-renderer (`feat/native-rn-renderer`)  
**Date:** 2026-09-03  
**Status:** PASS

## Scope

- `packages/core/src/utils/*` — headless shared utils (parse, fingerprint, mutex)
- `packages/core/src/rich-text/markdown-serialize.ts` — Markdown ↔ TextBlock conversion
- `@incantly/canvas/headless` export — store, migrations, version history
- `packages/react-native/src/storage/*` — AsyncStorage notebook persistence + SQLite `VersionStorage`
- `packages/react-native/src/store/*` — StoreBridge, useCanvasStore
- `packages/react-native/src/document/*` — native document text sync
- `examples/native-rn-demo` — notebook load/save, playground scenes

## Findings

| Severity | Finding | Status |
| --- | --- | --- |
| — | No Critical / High / Medium issues | closed |

## Review notes

Reviewed uncommitted storage + version-history paths. Parameterized SQLite, notebook scoping, path-like ID rejection, corrupt-row skip, `SQLITE_FULL` → `onQuotaError`, and `loadSnapshot(..., 'remote')` on revert. CanvasRef `listVersions` returns summaries only.

### Areas covered

1. **Snapshot injection / oversized payload** — AsyncStorage load uses `safeParseSnapshot`; VersionManager prune caps total version footprint
2. **No arbitrary code execution** from stored snapshot JSON or version blobs
3. **Paste validation** — deferred until native paste lands (not in this slice)
4. **Storage boundaries** — SQLite `versions` table scoped by `notebook_id`; path-like ids rejected; corrupt JSON rows skipped on list; list via CanvasRef is summaries only
5. **PII stays local** — no secrets in bundle, keys, or snapshots
6. **File-system version offload** — deferred:v1.1

### Residual (Low)

- Apply `isSafeId` to `createNotebookPersistence` notebook IDs for parity with SQLite
- One `createNotebookPersistence` instance should serve one notebook (serial queue is process-wide)
- Host must not mount `<Canvas>` until async `versionStorage` is ready (demo gates on this)
