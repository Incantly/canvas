# 12 — AI presence (v2)

**Branch:** `feat/ai-presence`  
**Priority:** Last — post-MVP  
**Depends on:** [11-collaboration](./11-collaboration.md), [03-rich-text-editor](./03-rich-text-editor.md), [08-latex-shape](./08-latex-shape.md)

## Problem

Incantly's v2 vision includes a visible **AI collaborator** that writes, draws, and teaches on the canvas — same as a human participant, not a separate overlay.

## Scope

### Architecture

AI agent connects to collaboration room as a **service participant**:

```
AI service → authenticated token → Liveblocks room
           → applyDiff(source: 'remote') for each action
           → distinct cursor/avatar styling
```

Uses same diff path as human collaborators (doc 11).

### Visual presence

- AI cursor: distinct color + bot avatar
- AI actions animate (stroke draws progressively optional)
- Label: "Incantly AI"

### Allowed actions (v2)

| Action | Mechanism |
|--------|-----------|
| Type rich text | Insert text shape via diff |
| Draw ink | Insert draw shape via diff |
| Insert LaTeX | Insert latex shape via diff |
| Select / navigate | Presence only |
| Trigger compile | Hook/event to external compiler — not implemented here |

### Server orchestration

- AI runs server-side (not in client bundle)
- Service account token from backend
- Rate limit + notebook scope enforced server-side

### Safety

- AI diffs tagged `source: 'remote'`, `meta.agent: 'incantly-ai'` for filtering/undo UX
- User can disable AI participant per notebook

## React Native

- AI presence visible in WebView like remote users
- RN shows "AI is editing..." in chrome via postMessage
- No on-device AI model

## Playground demo

**Panel:** `AIPresencePanel.tsx`

- Mock AI client script joins room
- Simulates: type paragraph, draw circle, insert LaTeX
- Web user sees AI cursor + content appear
- RN observes same room

## Acceptance criteria

- [ ] Mock AI agent applies diffs visible to all room participants
- [ ] AI cursor visually distinct from human cursors
- [ ] AI uses structured rich text + LaTeX shapes (compiler-ready)
- [ ] User can disconnect AI participant
- [ ] Playground demo with mock agent

## Out of scope

- LLM integration / prompt UI (product layer)
- DSL compiler execution
- AI drawing from image input

## Key files

- [`packages/sync/`](../packages/sync)
- `apps/web/app/api/ai-agent/` (new — service token + orchestration stub)
- Playground mock agent script
