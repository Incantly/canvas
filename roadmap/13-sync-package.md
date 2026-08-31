# 13 — Sync package

**Branch:** `feat/sync-package`  
**Priority:** Foundation (parallel after rename)  
**Depends on:** [00-rename-incantly-canvas](./00-rename-incantly-canvas.md)

## Problem

Sync logic is documented as DIY snippets in [`apps/docs/content/sync.mdx`](../apps/docs/content/sync.mdx). Collaboration (doc 11) needs a reusable package with transport adapters and stroke coalescing.

## Scope

### Package: `packages/sync`

npm name: `@incantly/canvas-sync`

```typescript
// Core client
function createSyncClient(options: {
  store: Store
  transport: SyncTransport
  coalesceStrokes?: boolean   // default true
}): SyncClient

interface SyncTransport {
  connect(): Promise<void>
  disconnect(): void
  send(payload: string): void
  onMessage(cb: (payload: string) => void): () => void
}

interface SyncClient {
  dispose(): void
  status: 'idle' | 'connecting' | 'connected' | 'error'
}
```

### Built-in transports

| Transport | Use case |
|-----------|----------|
| `BroadcastChannelTransport` | Local dev, playground, two tabs |
| `WebSocketTransport` | Generic server relay (stub) |
| `LiveblocksTransport` | Production (doc 11) |

### Stroke coalescing

Problem: [`editor._extendDraw`](../packages/core/src/editor.ts) emits store diff on every pointer move.

Solution:

- Detect in-progress draw updates (shape type draw/highlight, `done: false`)
- Buffer diffs for same shape id
- Flush single composed diff on pointer up or idle timeout

### Re-exports

Re-export `composeDiff`, `invertDiff`, `isDiffEmpty` from core — don't duplicate.

## React Native

- Sync runs inside WebView (store is in WebView)
- RN transport option: postMessage bridge to native WebSocket (future)
- v1: WebView uses WebSocket/Liveblocks directly inside bundled HTML
- Document RN architecture in package README

## Playground demo

**Panel:** `SyncPanel.tsx` (in playground after doc 01)

- Two-tab sync via BroadcastChannel
- Draw stroke → verify 1 diff received in other tab's debug log
- Connection status indicator

## Acceptance criteria

- [ ] `createSyncClient` syncs shapes between two tabs via BroadcastChannel
- [ ] Stroke coalescing reduces draw diffs to 1 per stroke
- [ ] Package builds and typechecks independently
- [ ] Playground panel demonstrates two-tab sync

## Out of scope

- Presence/cursors (doc 11)
- Server relay implementation
- Yjs CRDT

## Key files

- `packages/sync/src/` (new)
- [`packages/core/src/store.ts`](../packages/core/src/store.ts)
- [`packages/core/src/utils/diff.ts`](../packages/core/src/utils/diff.ts)
