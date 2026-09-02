import { migrateSnapshot } from '../../migrations/index.js'
import type { Snapshot } from '../../types/operations.js'

export type ParseSnapshotError = 'parse' | 'migrate' | 'empty'

export type ParseSnapshotResult =
  | { ok: true; snap: Snapshot }
  | { ok: false; code: ParseSnapshotError; message?: string }

export function safeParseSnapshot(raw: string): ParseSnapshotResult {
  if (!raw || !raw.trim()) {
    return { ok: false, code: 'empty' }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    return {
      ok: false,
      code: 'parse',
      message: e instanceof Error ? e.message : String(e),
    }
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, code: 'parse', message: 'snapshot is not an object' }
  }
  try {
    const snap = migrateSnapshot(parsed as Snapshot)
    if (!snap.document?.store) {
      return { ok: false, code: 'empty', message: 'missing document.store' }
    }
    return { ok: true, snap }
  } catch (e) {
    return {
      ok: false,
      code: 'migrate',
      message: e instanceof Error ? e.message : String(e),
    }
  }
}
