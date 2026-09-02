import * as SQLite from 'expo-sqlite'
import {
  createExpoSqliteDriver,
  createSqliteVersionStorage,
  type VersionStorage,
} from '@incantly/canvas-react-native'

export const VERSIONS_NOTEBOOK_ID = 'playground-versions'

let storagePromise: Promise<VersionStorage> | null = null

/** Process-wide SQLite version store — survives Canvas remount and app restart. */
export function getDemoVersionStorage(): Promise<VersionStorage> {
  if (!storagePromise) {
    storagePromise = (async () => {
      const db = await SQLite.openDatabaseAsync('incantly-versions.db')
      const storage = createSqliteVersionStorage(createExpoSqliteDriver(db))
      await storage.ready()
      return storage
    })()
  }
  return storagePromise
}
