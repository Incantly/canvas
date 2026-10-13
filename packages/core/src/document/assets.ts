import type { AssetId } from './ids.js'

export type AssetHash = `sha256:${string}`

export interface AssetMetadata {
  filename?: string
  mimeType: string
  byteLength: number
  width?: number
  height?: number
  duration?: number
  createdAt?: string
}

/** Portable metadata for a binary stored outside document JSON. */
export interface AssetRecord extends AssetMetadata {
  id: AssetId
  hash: AssetHash
  storageKey: string
  createdAt: string
}

export type AssetBinary = Uint8Array | ArrayBuffer

export interface AssetHasher {
  sha256(data: AssetBinary): Promise<AssetHash>
}

export const contentAddressedAssetKey = (hash: AssetHash): string => {
  const digest = hash.slice('sha256:'.length).toLowerCase()
  return `sha256/${digest.slice(0, 2)}/${digest}`
}

export const assetsHaveSameContent = (
  left: Pick<AssetRecord, 'hash' | 'byteLength'>,
  right: Pick<AssetRecord, 'hash' | 'byteLength'>,
): boolean => left.hash === right.hash && left.byteLength === right.byteLength
