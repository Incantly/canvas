import type { DocumentBlock } from '../../rich-text/types.js'

/** Fingerprint for document blocks — skip no-op setNotebookDocument calls. */
export function documentBlocksFingerprint(blocks: DocumentBlock[]): string {
  try {
    return JSON.stringify(blocks)
  } catch {
    return String(Date.now())
  }
}
