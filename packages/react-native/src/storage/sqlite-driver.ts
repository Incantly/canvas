/** Minimal SQL surface the host injects (expo-sqlite, better-sqlite, tests). */
export interface SqliteDriver {
  exec(sql: string): Promise<void>
  run(sql: string, params?: unknown[]): Promise<void>
  all<T>(sql: string, params?: unknown[]): Promise<T[]>
  get<T>(sql: string, params?: unknown[]): Promise<T | null>
  transaction<T>(fn: () => Promise<T>): Promise<T>
}

/**
 * Wraps an Expo SQLite database (`expo-sqlite` v14/v15) without importing Expo.
 * Host: `createExpoSqliteDriver(await SQLite.openDatabaseAsync('incantly.db'))`
 */
export function createExpoSqliteDriver(db: ExpoSqliteLike): SqliteDriver {
  const expo = db as ExpoSqliteMethods
  return {
    exec(sql) {
      return expo.execAsync(sql)
    },
    async run(sql, params = []) {
      await expo.runAsync(sql, params)
    },
    all<T>(sql: string, params: unknown[] = []) {
      return expo.getAllAsync(sql, params) as Promise<T[]>
    },
    get<T>(sql: string, params: unknown[] = []) {
      return expo.getFirstAsync(sql, params) as Promise<T | null>
    },
    async transaction(fn) {
      let result: Awaited<ReturnType<typeof fn>>
      await expo.withTransactionAsync(async () => {
        result = await fn()
      })
      return result!
    },
  }
}

/** Host-provided expo-sqlite database (typed as unknown to avoid overload fights). */
export type ExpoSqliteLike = object

interface ExpoSqliteMethods {
  execAsync(source: string): Promise<void>
  runAsync(source: string, params?: unknown): Promise<unknown>
  getAllAsync(source: string, params?: unknown): Promise<unknown[]>
  getFirstAsync(source: string, params?: unknown): Promise<unknown>
  withTransactionAsync(task: () => Promise<void>): Promise<void>
}
