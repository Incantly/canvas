import { normalizeDocument } from './normalize.js'
import { migrateDocumentToCurrent, type DocumentMigrationResult } from './migrations/index.js'
import { CURRENT_DOCUMENT_SCHEMA_VERSION } from './constants.js'
import type { IncantlyDocument } from './types.js'
import { validateDocument, type DocumentValidationIssue } from './validate.js'

export type DocumentSerializationIssueCode = 'invalid_document' | 'non_json_value' | 'cyclic_value'

export class DocumentSerializationError extends Error {
  readonly code: DocumentSerializationIssueCode
  readonly path: string
  readonly validationIssues: readonly DocumentValidationIssue[]

  constructor(code: DocumentSerializationIssueCode, path: string, message: string,
    validationIssues: readonly DocumentValidationIssue[] = []) {
    super(message)
    this.name = 'DocumentSerializationError'
    this.code = code
    this.path = path
    this.validationIssues = validationIssues
  }
}

export interface SerializeIncantlyDocumentOptions {
  /** Number of spaces used for human-readable output. Defaults to compact JSON. */
  space?: number
}

export interface ParseIncantlyDocumentOptions {
  /** Explicitly recover malformed current-version data. Strict parsing is the default. */
  recover?: boolean
}

export interface ParseIncantlyDocumentResult extends DocumentMigrationResult {
  ok: boolean
}

function assertJsonRuntimeValue(value: unknown): void {
  const active = new Set<object>()
  const pending: Array<{ value: unknown; path: string; exit?: boolean }> = [{ value, path: '$' }]
  while (pending.length) {
    const current = pending.pop() as { value: unknown; path: string; exit?: boolean }
    if (current.exit) { active.delete(current.value as object); continue }
    const kind = typeof current.value
    if (kind === 'function' || kind === 'symbol' || kind === 'bigint' || kind === 'undefined')
      throw new DocumentSerializationError('non_json_value', current.path, `Non-JSON ${kind} value at ${current.path}`)
    if (current.value === null || kind === 'string' || kind === 'boolean') continue
    if (kind === 'number') {
      if (!Number.isFinite(current.value as number))
        throw new DocumentSerializationError('non_json_value', current.path, `Non-finite number at ${current.path}`)
      continue
    }
    const object = current.value as object
    if (active.has(object)) throw new DocumentSerializationError('cyclic_value', current.path, `Cyclic value at ${current.path}`)
    active.add(object)
    pending.push({ value: current.value, path: current.path, exit: true })
    if (Array.isArray(current.value)) {
      current.value.forEach((item, index) => pending.push({ value: item, path: `${current.path}[${index}]` }))
      continue
    }
    const prototype = Object.getPrototypeOf(object)
    if (prototype !== Object.prototype && prototype !== null)
      throw new DocumentSerializationError('non_json_value', current.path, `Only plain JSON objects are allowed at ${current.path}`)
    for (const [key, child] of Object.entries(current.value as Record<string, unknown>))
      pending.push({ value: child, path: `${current.path}.${key}` })
  }
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue)
  if (!value || typeof value !== 'object') return value
  const sorted: Record<string, unknown> = {}
  for (const key of Object.keys(value).sort()) sorted[key] = sortJsonValue((value as Record<string, unknown>)[key])
  return sorted
}

/** Strictly validates and emits canonical, stable-key-order JSON. */
export function serializeIncantlyDocument(document: IncantlyDocument,
  options: SerializeIncantlyDocumentOptions = {}): string {
  assertJsonRuntimeValue(document)
  const validation = validateDocument(document)
  if (!validation.valid)
    throw new DocumentSerializationError('invalid_document', '$', 'Cannot serialize an invalid Incantly document', validation.issues)
  // Reconstructing from allowlisted fields guarantees runtime-only extras and binary bodies are not emitted.
  const canonical = normalizeDocument(document)
  return JSON.stringify(sortJsonValue(canonical), null, Math.max(0, Math.min(10, options.space ?? 0)))
}

/** Parses JSON, detects its version, runs forward migrations, and validates the current schema. */
export function parseIncantlyDocument(input: string | unknown,
  options: ParseIncantlyDocumentOptions = {}): ParseIncantlyDocumentResult {
  let value: unknown = input
  if (typeof input === 'string') {
    try {
      value = JSON.parse(input) as unknown
    } catch {
      return {
        ok: false,
        issues: [{ code: 'invalid_type', path: '$', message: 'Input is not valid JSON', severity: 'error' }],
        fromVersion: 0,
        toVersion: CURRENT_DOCUMENT_SCHEMA_VERSION,
        appliedVersions: [],
      }
    }
  }
  const result = migrateDocumentToCurrent(value, options)
  return { ...result, ok: result.document !== undefined }
}
