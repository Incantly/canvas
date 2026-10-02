import { CURRENT_DOCUMENT_SCHEMA_VERSION } from '../constants.js'
import { recoverDocument } from '../normalize.js'
import type { IncantlyDocument } from '../types.js'
import type { DocumentValidationIssue } from '../validate.js'
import { DOCUMENT_V1_SCHEMA, type DocumentSchemaBoundary } from './v1.js'

export interface DocumentMigration {
  fromVersion: number
  toVersion: number
  migrate(value: unknown): unknown
}

export interface DocumentMigrationResult {
  document?: IncantlyDocument
  issues: DocumentValidationIssue[]
  fromVersion: number
  toVersion: number
  appliedVersions: number[]
}

export interface LegacyCanvasPageDocumentAdapter {
  readonly id: string
  canAdapt(value: unknown): boolean
  /** Produces standalone document input; the normal validation/migration pipeline runs afterward. */
  adapt(value: unknown): unknown
}

export const DOCUMENT_SCHEMA_BOUNDARIES: readonly DocumentSchemaBoundary[] = [DOCUMENT_V1_SCHEMA]

/** Empty until a v2 schema exists. Entries must form a contiguous, forward-only chain. */
export const DOCUMENT_MIGRATIONS: readonly DocumentMigration[] = []

export function detectDocumentSchemaVersion(value: unknown): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const version = (value as Record<string, unknown>).schemaVersion
  return typeof version === 'number' && Number.isInteger(version) && version >= 1 ? version : null
}

function migrationIssue(code: DocumentValidationIssue['code'], path: string, message: string): DocumentValidationIssue {
  return { code, path, message, severity: 'error' }
}

export function migrateDocumentToCurrent(value: unknown, options: { recover?: boolean } = {}): DocumentMigrationResult {
  const fromVersion = detectDocumentSchemaVersion(value)
  if (fromVersion === null) {
    return {
      issues: [migrationIssue('unsupported_schema_version', '$.schemaVersion', 'A positive integer schemaVersion is required')],
      fromVersion: 0,
      toVersion: CURRENT_DOCUMENT_SCHEMA_VERSION,
      appliedVersions: [],
    }
  }
  if (fromVersion > CURRENT_DOCUMENT_SCHEMA_VERSION) {
    return {
      issues: [migrationIssue('unsupported_schema_version', '$.schemaVersion', `Schema version ${fromVersion} is newer than supported version ${CURRENT_DOCUMENT_SCHEMA_VERSION}`)],
      fromVersion,
      toVersion: CURRENT_DOCUMENT_SCHEMA_VERSION,
      appliedVersions: [],
    }
  }

  let current: unknown = value
  let version = fromVersion
  const appliedVersions: number[] = []
  while (version < CURRENT_DOCUMENT_SCHEMA_VERSION) {
    const step = DOCUMENT_MIGRATIONS.find((candidate) => candidate.fromVersion === version)
    if (!step || step.toVersion <= version) {
      return {
        issues: [migrationIssue('unsupported_schema_version', '$.schemaVersion', `No forward migration exists from schema version ${version}`)],
        fromVersion,
        toVersion: CURRENT_DOCUMENT_SCHEMA_VERSION,
        appliedVersions,
      }
    }
    current = step.migrate(current)
    version = step.toVersion
    appliedVersions.push(version)
  }

  const boundary = DOCUMENT_SCHEMA_BOUNDARIES.find((candidate) => candidate.version === version)
  if (!boundary) {
    return {
      issues: [migrationIssue('unsupported_schema_version', '$.schemaVersion', `No schema boundary is registered for version ${version}`)],
      fromVersion,
      toVersion: CURRENT_DOCUMENT_SCHEMA_VERSION,
      appliedVersions,
    }
  }
  const validated = boundary.validate(current)
  if (validated.document) {
    return { document: validated.document, issues: validated.issues, fromVersion, toVersion: version, appliedVersions }
  }
  if (options.recover) {
    const recovered = recoverDocument(current)
    return {
      document: recovered.document,
      issues: recovered.issues,
      fromVersion,
      toVersion: version,
      appliedVersions,
    }
  }
  return { issues: validated.issues, fromVersion, toVersion: version, appliedVersions }
}

export { DOCUMENT_V1_SCHEMA, type DocumentSchemaBoundary } from './v1.js'
