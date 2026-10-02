export interface SerializedSchema {
  schemaVersion: 1
  sequences: Record<string, number>
}

export const CURRENT_SCHEMA: SerializedSchema = {
  schemaVersion: 1,
  sequences: {
    'com.incantly.store': 2,
    'com.incantly.shape.text': 1,
  },
}
