/**
 * Deep-clone plain JSON data. Prefer native structuredClone when available;
 * fall back for Hermes / older runtimes (React Native).
 */
export function cloneJson<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value)
  }
  return JSON.parse(JSON.stringify(value)) as T
}
