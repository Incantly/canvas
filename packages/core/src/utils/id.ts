let seq = 0

export const newId = (p: string = 'shape'): string =>
  p +
  ':' +
  Date.now().toString(36) +
  (seq++ % 1296).toString(36).padStart(2, '0') +
  Math.random().toString(36).slice(2, 6)
