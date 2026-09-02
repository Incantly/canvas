export function snapshotKey(notebookId: string): string {
  return `ic:snapshot:${notebookId}`
}

export function versionIndexKey(notebookId: string): string {
  return `ic:versions:${notebookId}:index`
}

export function versionBlobKey(notebookId: string, versionId: string): string {
  return `ic:versions:${notebookId}:${versionId}`
}
