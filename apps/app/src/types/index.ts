export interface FileRecord {
  id: string
  name: string
  updatedAt: number
}

export interface FileIndex {
  current: string
  files: FileRecord[]
}
