import type { Snapshot } from '../types/operations.js'
import type { SerializedSchema } from '../types/schema.js'
import { CURRENT_SCHEMA } from '../types/schema.js'
import {
  type MigrationStep,
  SEQUENCE_ORDER,
  allMigrations,
} from './sequences.js'

import './store.js'
import './shape-text.js'
import './page-document.js'
import './notebook-document.js'

export function getMigrationsSince(
  from: SerializedSchema | undefined,
  to: SerializedSchema,
): MigrationStep[] {
  const fromSeqs = from?.sequences ?? {}
  const steps: MigrationStep[] = []
  const all = allMigrations()

  for (const seqId of SEQUENCE_ORDER) {
    const fromVersion = fromSeqs[seqId] ?? 0
    const toVersion = to.sequences[seqId] ?? 0

    const seqSteps = all
      .filter((s) => s.sequenceId === seqId && s.version > fromVersion && s.version <= toVersion)
      .sort((a, b) => a.version - b.version)

    steps.push(...seqSteps)
  }

  return steps
}

export function migrateSnapshot(snap: Snapshot): Snapshot {
  const cloned = structuredClone(snap)

  if (!cloned.document) {
    cloned.document = { store: {} }
  }
  if (!cloned.document.store) {
    cloned.document.store = {}
  }

  const from = cloned.schema
  const steps = getMigrationsSince(from, CURRENT_SCHEMA)

  for (const step of steps) {
    step.up(cloned)
  }

  cloned.schema = CURRENT_SCHEMA
  return cloned
}
