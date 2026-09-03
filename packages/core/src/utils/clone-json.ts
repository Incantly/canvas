/**
 * Deep-clone plain JSON data. Prefer native structuredClone when available;
 * fall back for Hermes / older runtimes (React Native).
 */
export function cloneJson<T>(value: T): T {
  try {
    const structuredCloneFn = (globalThis as { structuredClone?: (v: unknown) => unknown })
      .structuredClone
    if (typeof structuredCloneFn === 'function') {
      return structuredCloneFn(value) as T
    }
  } catch {
    // Hermes throws ReferenceError when structuredClone is missing on globalThis.
  }
  return JSON.parse(JSON.stringify(value)) as T
}
