# Cursor agent rules (copy to `.cursor/rules/` on setup)

These files mirror Promptwear / Incantly agent console rules. Copy into [`.cursor/rules/`](../.cursor/rules/) when starting implementation.

---

## plan-mode-qa.mdc

```mdc
---
description: Every Plan-mode implementation must include a QA checklist
alwaysApply: true
---

# Plan-mode QA checklist

When you are in **Plan mode** (or writing/updating a plan), every implementation decision must include a **QA checklist**. Do not finalize a plan without it.

Read: [`roadmap/QA_CHECKLIST.md`](../roadmap/QA_CHECKLIST.md)

## Must appear in the plan

1. **Subagent split** — Coordinator + named Implementer workstreams (do not leave "the agent will just code").
2. **Hand-implement first** — no new npm packages unless the roadmap doc lists an approved exception with justification.
3. **Error checking + data risk** — input validation, snapshot migration safety, undo/remote diff rules, corrupt-data recovery.
4. **Functional verify** — `npm run typecheck`, `npm test`, `npm run build:packages`.
5. **Playground demo** — web panel in `apps/playground` + RN scene for the feature.
6. **React Native parity** — WebView bridge updated if new APIs; test on RN playground.
7. **Before commit** — Verifier PASS on feature QA rows + universal gates; Security PASS when sync/auth/storage/bridge touched.
8. **Browser teardown** — after Playwright/Chromium: `browser.close()`. Do not kill the user's personal Chrome.

## When executing the plan

- Pipeline: Coordinator → SpecChecker → Implementer → Breaker → Fixer → IntegrationTester → Security (if applicable) → Verifier → Committer
- Never commit without Verifier PASS
- Commits only when user explicitly asks; no Cursor author or Co-authored-by (see `no-cursor-commits.mdc`)
```

---

## no-cursor-commits.mdc

```mdc
---
description: Commits and PRs must never identify Cursor as author or co-author
alwaysApply: true
---

# No Cursor in commits or PRs

- Never use Cursor as git author or committer name/email
- Never add `Co-authored-by: Cursor` or similar trailers
- Commit messages and PR titles/bodies must not mention Cursor, "Made with Cursor", or auto-assistant footers
- Security sub-agent must PASS before any commit when the feature touches sync, auth, storage, paste, or bridge
- Verifier must PASS (see `roadmap/QA_CHECKLIST.md`) before any commit
- Commits only when the user explicitly asks
```

---

## implement-by-hand.mdc

```mdc
---
description: Prefer hand-implemented core code; strict error checking and data safety
alwaysApply: true
---

# Hand-implement + data safety

## Hand-implement by default

- Implement features in `packages/core` by hand
- Do not add npm dependencies unless the active roadmap doc approves an exception with justification
- Keep SDK lean for RN WebView bundle size

## Error checking

- Validate inputs at editor, store, and RN bridge boundaries
- TypeScript strict; avoid @ts-ignore
- User-visible error states — never silent crash

## Data risk

- Snapshot changes require version + forward migration
- Remote diffs use source: 'remote' and skip undo stack
- Validate clipboard paste payloads
- Handle storage quota and corrupt JSON gracefully

See roadmap/QA_CHECKLIST.md for full gates.
```

---

## ci-build-order.mdc

```mdc
---
description: Monorepo build order — core before react-native so CI npm run build passes
alwaysApply: true
---

# CI build order

CI runs `npm run build` on a **fresh checkout** with no prebuilt `dist/` folders.

## Required build order

Packages must compile in dependency order:

1. `@incantly/canvas` (`packages/core`) — emits `dist/index.js`
2. `@incantly/canvas-react` — depends on core types/dist
3. `@incantly/canvas-react-native` — `build-html.mjs` esbuild aliases `@incantly/canvas` → `packages/core/dist/index.js`

## Root scripts

- **`npm run build`** must delegate to **`npm run build:packages`** (all three packages, in order). Never point root `build` at react-native alone.
- Before pushing changes to root `package.json` or any package `build` script, verify:

```bash
rm -rf packages/*/dist packages/*/tsconfig.tsbuildinfo
npm run build
```

## When editing react-native bundle

After core API changes, rebuild core before react-native:

```bash
npm run build --workspace=@incantly/canvas
npm run build --workspace=@incantly/canvas-react-native
```
```

