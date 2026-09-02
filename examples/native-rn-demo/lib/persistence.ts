import AsyncStorage from '@react-native-async-storage/async-storage'
import { createNotebookPersistence } from '@incantly/canvas-react-native'

const DEMO_NOTEBOOK_ID = 'playground-demo'

export const demoPersistence = createNotebookPersistence({
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
})

export { DEMO_NOTEBOOK_ID }
