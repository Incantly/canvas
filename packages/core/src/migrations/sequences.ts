import type { Snapshot } from '../types/operations.js'

export interface MigrationStep {
  sequenceId: string
  version: number
  up: (snap: Snapshot) => void
}

export const SEQUENCE_ORDER: readonly string[] = [
  'com.incantly.store',
  'com.incantly.shape.text',
  'com.incantly.page.document',
  'com.incantly.notebook.document',
]

const _steps: MigrationStep[] = []

export function registerMigration(step: MigrationStep): void {
  _steps.push(step)
}

export function allMigrations(): readonly MigrationStep[] {
  return _steps
}
