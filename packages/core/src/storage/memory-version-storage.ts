import type { DocumentVersion, VersionStorage } from '../version-history.js'

function isValidDocumentVersion(v: unknown): v is DocumentVersion {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (
    typeof o.id === 'string' &&
    typeof o.notebookId === 'string' &&
    typeof o.createdAt === 'number' &&
    typeof o.kind === 'string' &&
    o.snapshot != null &&
    o.schema != null
  )
}

export class MemoryVersionStorage implements VersionStorage {
  private versions = new Map<string, unknown>()

  /** @internal Inject corrupt rows for tests */
  injectCorrupt(id: string, data: unknown): void {
    this.versions.set(id, data)
  }

  async list(notebookId: string, opts?: { limit?: number }): Promise<DocumentVersion[]> {
    const result: DocumentVersion[] = []
    for (const v of this.versions.values()) {
      if (!isValidDocumentVersion(v) || v.notebookId !== notebookId) continue
      result.push(v)
    }
    result.sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
    if (opts?.limit != null) return result.slice(0, opts.limit)
    return result
  }

  async get(notebookId: string, versionId: string): Promise<DocumentVersion | null> {
    const v = this.versions.get(versionId)
    if (!isValidDocumentVersion(v) || v.notebookId !== notebookId) return null
    return v
  }

  async put(version: DocumentVersion): Promise<void> {
    this.versions.set(version.id, version)
  }

  async delete(notebookId: string, versionId: string): Promise<void> {
    const v = this.versions.get(versionId)
    if (isValidDocumentVersion(v) && v.notebookId === notebookId) {
      this.versions.delete(versionId)
    }
  }

  async prune(notebookId: string, keep: number): Promise<void> {
    const versions = await this.list(notebookId)
    const toDrop = versions.slice(keep)
    for (const v of toDrop) {
      this.versions.delete(v.id)
    }
  }
}
