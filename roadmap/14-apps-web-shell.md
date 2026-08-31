# 14 — Web product shell

**Branch:** `feat/apps-web-shell`  
**Priority:** Foundation (parallel after rename)  
**Depends on:** [00-rename-incantly-canvas](./00-rename-incantly-canvas.md)

## Problem

Incantly needs a **product web app** — not just the SDK playground or hosted Quickdraw demo. This is the Next.js shell that imports `@incantly/canvas` directly.

## Scope

### App: `apps/web`

Next.js App Router:

```
apps/web/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                    # notebook list
│   ├── notebook/[id]/page.tsx      # editor view
│   └── api/
│       └── liveblocks-auth/        # added in doc 11
├── components/
│   ├── NotebookList.tsx
│   └── NotebookEditor.tsx          # full-viewport Canvas
└── package.json
```

### Features (v1 shell)

- Notebook list (localStorage or stub API)
- Open notebook → full-viewport `@incantly/canvas-react`
- Page navigation chrome (from doc 02)
- Theme toggle
- Deep link hash routing (doc 10 — stub route ready)
- Optional: join collaboration room from URL param

### Not in scope for shell

- Rich text UI (comes from core doc 03)
- Compiler UI
- Auth/login (stub user for dev)

### Relationship to other apps

| App | Purpose |
|-----|---------|
| `apps/web` | Incantly product |
| `apps/playground` | SDK feature testing |
| `apps/app` | Legacy hosted Quickdraw (keep until deprecated) |
| `apps/docs` | Documentation |

## React Native

N/A — web only. RN shell is doc 15.

## Playground demo

N/A — this is the product app. Verify via `npm run dev --workspace=apps/web`.

## Acceptance criteria

- [ ] `npm run dev --workspace=apps/web` loads notebook list
- [ ] Create/open notebook renders canvas with page support
- [ ] Snapshot persists in localStorage per notebook id
- [ ] Imports `@incantly/canvas-react` (post-rename)

## Key files

- `apps/web/` (new)
