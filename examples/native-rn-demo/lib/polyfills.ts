/**
 * Hermes throws when reading missing globals (e.g. structuredClone).
 * Install JSON fallbacks before any @incantly/canvas imports run.
 */
const globalWithClone = globalThis as unknown as {
  structuredClone?: (v: unknown) => unknown
}

try {
  if (typeof globalWithClone.structuredClone !== 'function') {
    globalWithClone.structuredClone = (value) => JSON.parse(JSON.stringify(value))
  }
} catch {
  globalWithClone.structuredClone = (value) => JSON.parse(JSON.stringify(value))
}
