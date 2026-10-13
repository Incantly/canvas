import { CURRENT_DOCUMENT_SCHEMA_VERSION } from '../constants.js'
import { validateDocument, type DocumentValidationIssue } from '../validate.js'
import type { IncantlyDocument } from '../types.js'

export interface DocumentSchemaBoundary<TDocument extends IncantlyDocument = IncantlyDocument> {
  version: number
  validate(value: unknown): { document?: TDocument; issues: DocumentValidationIssue[] }
}

/**
 * The first standalone Incantly document schema boundary. There is deliberately no
 * implicit v0 conversion: no standalone document format existed before v1.
 */
export const DOCUMENT_V1_SCHEMA: DocumentSchemaBoundary = {
  version: CURRENT_DOCUMENT_SCHEMA_VERSION,
  validate(value) {
    const result = validateDocument(value)
    return { ...(result.document ? { document: result.document } : {}), issues: result.issues }
  },
}
