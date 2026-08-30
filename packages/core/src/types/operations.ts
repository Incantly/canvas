import type { BoardRecord } from './models.js'

export type DiffSource = 'user' | 'remote' | 'all'

export interface Diff {
  added: Record<string, BoardRecord>
  removed: Record<string, BoardRecord>
  updated: Record<string, [BoardRecord, BoardRecord]>
}

export interface Snapshot {
  document: { store: Record<string, BoardRecord> }
}
