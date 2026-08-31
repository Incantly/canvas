import type { BoardRecord } from './models.js'
import type { SerializedSchema } from './schema.js'

export type DiffSource = 'user' | 'remote' | 'all'

export interface Diff {
  added: Record<string, BoardRecord>
  removed: Record<string, BoardRecord>
  updated: Record<string, [BoardRecord, BoardRecord]>
}

export interface Snapshot {
  schema?: SerializedSchema
  document: { store: Record<string, BoardRecord> }
}
