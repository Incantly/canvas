export type ValueOf<T> = T[keyof T]

export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

export type RequiredBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>

export type Branded<T, B extends string> = T & { readonly __brand: B }

type MapKey = unknown
type MapVal = unknown
type SetVal = unknown

export type DeepReadonly<T> =
  T extends Map<MapKey, MapVal> | Set<SetVal> ? Readonly<T> :
  T extends (...args: unknown[]) => unknown ? T :
  T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T

export type DeepPartial<T> =
  T extends Map<MapKey, MapVal> | Set<SetVal> ? T :
  T extends (...args: unknown[]) => unknown ? T :
  T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T

export type UnwrapPromise<T> = T extends PromiseLike<infer U> ? U : T
