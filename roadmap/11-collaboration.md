# 11 — Collaboration

**Branch:** `feat/collaboration`  
**Priority:** #9 feature  
**Depends on:** [13-sync-package](./13-sync-package.md), [14-apps-web-shell](./14-apps-web-shell.md), [15-apps-mobile-shell](./15-apps-mobile-shell.md)

## Problem

Multiple users need to edit the same notebook in real time. Core has diff primitives ([`store.listen`](../packages/core/src/store.ts), `applyDiff`) but no transport, presence, or auth.

## Scope

### Transport

**Hand-implement** sync transport in [`packages/sync`](./13-sync-package.md) — do not add Liveblocks/Yjs in v1 unless QA approves exception:

```typescript
createSyncClient({ roomId, store, transport: WebSocketTransport | BroadcastChannelTransport })
```

Optional Liveblocks adapter documented as future exception row in QA table.

### Server auth (required)

- Token minting endpoint in `apps/web/app/api/liveblocks-auth/route.ts`
- **Server validates user session** before issuing room token
- Client-side gating is UX only — not security

### Presence

- Remote cursors (page coords + pageId)
- Remote selections (highlighted shape ids)
- Remote laser scribbles via existing `setRemoteScribbles` — expose on RN bridge

### Stroke coalescing

Critical: draw strokes must **not** send per-pointer-move diffs. Sync package batches in-progress strokes; flush on pointer up.

### Conflict model

Record-level LWW (existing). Document limitations; no CRDT in v1.

### Room = notebook

One Liveblocks room per notebook ID. Page + shape diffs sync through store.

## React Native

- RN joins same Liveblocks room via WebView store sync OR RN-native Liveblocks client mirroring diffs through bridge
- Prefer: WebView runs sync internally; RN shows connection status via postMessage
- Test: web + RN user in same room, both draw, both see strokes <500ms

## Playground demo

**Panel:** `CollaborationPanel.tsx`

- Room ID input + join button
- Second browser tab joins same room
- Draw on tab A → appears on tab B
- Presence cursors visible
- RN playground joins same room as web tab

## Acceptance criteria

- [ ] Two web clients sync strokes and text edits
- [ ] Auth endpoint rejects unauthenticated token requests
- [ ] Draw stroke = 1 diff on completion, not N diffs during draw
- [ ] RN + web collaborate in dev
- [ ] Playground demo documents setup steps

## Out of scope

- Offline queue + merge
- Version history / restore
- Permission roles (editor/viewer) — stub only

## Key files

- [`packages/sync/`](../packages/sync) (doc 13)
- [`apps/web/app/api/`](../apps/web)
- [`packages/react-native/src/webview-entry.ts`](../packages/react-native/src/webview-entry.ts)
