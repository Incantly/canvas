import type { Snapshot } from '../types/operations.js'
import type { ShapeRecord } from '../types/models.js'
import { migrateTextProps } from '../rich-text/document.js'
import { registerMigration } from './sequences.js'

registerMigration({
  sequenceId: 'com.incantly.shape.text',
  version: 1,
  up(snap: Snapshot): void {
    const store = snap.document.store
    for (const rec of Object.values(store)) {
      if (!rec || (rec as any).typeName !== 'shape') continue
      const shape = rec as ShapeRecord
      if (shape.type !== 'text' && shape.type !== 'note') continue
      const props = shape.props as unknown as Record<string, unknown>
      if (props.text !== undefined || props.blocks !== undefined) {
        const migrated = migrateTextProps(props)
        store[shape.id] = { ...shape, props: migrated } as ShapeRecord
      }
    }
  },
})
