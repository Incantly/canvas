import { newId } from '../utils/id.js'

declare const incantlyIdBrand: unique symbol

export type BrandedId<Kind extends string> = string & {
  readonly [incantlyIdBrand]: Kind
}

export type DocumentId = BrandedId<'DocumentId'>
export type DocumentNodeId = BrandedId<'DocumentNodeId'>
export type AssetId = BrandedId<'AssetId'>
export type CommentId = BrandedId<'CommentId'>
export type CitationId = BrandedId<'CitationId'>
export type DocumentTransactionId = BrandedId<'DocumentTransactionId'>

const brandId = <Kind extends string>(value: string): BrandedId<Kind> =>
  value as BrandedId<Kind>

export const documentId = (value: string): DocumentId => brandId<'DocumentId'>(value)
export const documentNodeId = (value: string): DocumentNodeId => brandId<'DocumentNodeId'>(value)
export const assetId = (value: string): AssetId => brandId<'AssetId'>(value)
export const commentId = (value: string): CommentId => brandId<'CommentId'>(value)
export const citationId = (value: string): CitationId => brandId<'CitationId'>(value)
export const documentTransactionId = (value: string): DocumentTransactionId => brandId<'DocumentTransactionId'>(value)

export const createDocumentId = (): DocumentId => documentId(newId('document'))
export const createDocumentNodeId = (): DocumentNodeId => documentNodeId(newId('node'))
export const createDocumentTransactionId = (): DocumentTransactionId => documentTransactionId(newId('transaction'))
