import type { Snapshot } from '../../types/operations.js'

/** Stable JSON fingerprint for snapshot dedup (autosave, block sync). */
export function snapshotFingerprint(snap: Snapshot): string {
  try {
    return JSON.stringify(snap.document?.store ?? {})
  } catch {
    return String(Date.now())
  }
}
