# Incantly Canvas SDK — QA Checklist

**Verifier owns this file.** Status values: `missing` | `partial` | `implemented` | `deferred:<note>`.

Nothing advances to the next feature branch while any required row for that feature is `missing` or `partial` without an explicit `deferred:` note.

**Nothing is committed or pushed until Security PASS (when applicable) and Verifier PASS.**

> Adapted from Promptwear QA Checklist (`~/promptwear/backend/QA_CHECKLIST.md`, `~/promptwear/client/QA_CHECKLIST.md`).
>
> Each feature spec: [`roadmap/`](./README.md) · Playground: [`01-playground-app.md`](./01-playground-app.md)

---

## Implementation standards (all features)

### Hand-implement by default

**Do not add npm dependencies** for features we can own in `@incantly/canvas` core unless the roadmap doc explicitly marks an exception with justification.

| Prefer hand-rolled | Avoid default dependency |
|--------------------|--------------------------|
| Stroke smoothing ([06](./06-ink-smoothing.md)) | `perfect-freehand` |
| Rich text model + editor ([03](./03-rich-text-editor.md)) | Tiptap, ProseMirror, Slate |
| Snapping / geometry ([05](./05-shape-snapping.md)) | Geometry libraries |
| Sync transport ([13](./13-sync-package.md)) | Liveblocks, Yjs (v1) |
| LaTeX subset renderer ([08](./08-latex-shape.md)) | KaTeX / MathJax (evaluate minimal subset first) |
| Handwriting beautify ([07](./07-handwriting-beautify.md)) | MyScript, cloud OCR |

Exceptions require a row in the feature's QA table: `deferred:package:<name> — <reason>`.

### Error checking

- Validate all public API inputs at boundaries (editor methods, store mutations, bridge messages)
- Fail loudly in dev (`throw` with clear message); user-safe messages in prod UI
- Guard null/undefined shape refs, page ids, snapshot migration paths
- TypeScript `strict` — no `@ts-ignore` without linked issue
- Every store mutation path: confirm record exists, parent page exists, ids are valid
- Bridge: validate JSON payloads from RN WebView; reject malformed `__qdDispatch` messages
- Render errors (invalid LaTeX, bad font): inline error state on shape, never blank crash

### Data risk

- **Snapshot integrity:** migrations are forward-only with version field; never silently drop records
- **Undo/redo:** batched correctly; remote diffs (`source: 'remote'`) skip undo stack
- **Collaboration:** no applyDiff without auth on server; client token gating is UX only
- **localStorage / AsyncStorage:** quota exceeded handling; corrupt JSON recovery
- **Clipboard:** validate paste payload schema before store.put
- **No secrets** in client bundle, WebView HTML, or snapshots
- **PII:** notebook content stays local until user opts into sync; document in feature specs

---

## Sub-agent role table

| Role | Spins when | Done when |
| --- | --- | --- |
| **Coordinator** | Feature branch start | Workstreams split; parallel Implementers launched; every QA row tracked; refuses to advance while required rows incomplete. Never writes production code |
| **SpecChecker** | Before implementation | Roadmap doc + QA rows accurate; hand-impl vs package exceptions documented; overall PASS |
| **Implementer** | After SpecChecker PASS | Code + unit tests for assigned workstream; playground panel stubbed or complete |
| **Breaker** | After Implementer | Adversarial cases filed or signed no-break (bad input, corrupt snapshot, empty page, RN bridge) |
| **Fixer** | On Breaker failures | `npm test` + typecheck green again |
| **IntegrationTester** | After Fixer green | Playground web + RN manual/automated smoke for the feature |
| **Security** | When feature touches sync, auth, storage, paste, or bridge | Findings in `roadmap/security/<feature>-audit.md`; zero open Critical/High |
| **SecurityFixer** | On Critical/High | Remediated; re-audit PASS |
| **Verifier** | After Security PASS (or N/A) | Feature QA rows + universal gates green |
| **Committer** | After Verifier PASS only | Clean commit; author is not Cursor; no Co-authored-by; push only when user asks |

**Pipeline:** Coordinator → SpecChecker → Implementer → Breaker → Fixer → IntegrationTester → Security (if applicable) → SecurityFixer → Verifier → Committer

---

## Sub-agent spin-up template

```text
Role: <Coordinator|SpecChecker|Implementer|Breaker|Fixer|IntegrationTester|Security|SecurityFixer|Verifier|Committer>
Feature: <roadmap slug, e.g. page-based-canvas>
Branch: feat/<slug>
Read: roadmap/<nn>-<slug>.md
Read: roadmap/QA_CHECKLIST.md
Constraints:
  - Hand-implement in packages/core unless doc lists approved package exception
  - TypeScript strict; validate inputs at editor/store/bridge boundaries
  - Snapshot migrations forward-only; document data risk for store shape changes
  - React Native parity: webview-entry.ts + RN playground scene
  - Playground panel required before Verifier PASS
  - npm run typecheck && npm test && npm run build:packages
  - commits: no Cursor author/message/Co-authored-by (see .cursor/rules/no-cursor-commits.mdc)
  - commits only when user explicitly asks
```

---

## Universal verifier gates (every feature)

| Check | Status |
| --- | --- |
| `npm run typecheck` all workspaces green | missing |
| `npm test` green | missing |
| `npm run build:packages` green | missing |
| No new dependency OR exception documented in feature QA table | missing |
| Playground web panel demonstrates feature | missing |
| Playground RN scene demonstrates feature | missing |
| RN bridge updated if new editor/store API | missing |
| Unit tests for core logic (not only happy path) | missing |
| Error paths tested (invalid input, missing page, corrupt snapshot) | missing |
| No `@ts-ignore` without deferred note | missing |
| Roadmap doc acceptance criteria all checked | missing |
| Security audit (if applicable): zero Critical/High open | missing |
| No Cursor in commits | missing |

If any required row is `missing`/`partial` without `deferred:` → **Verifier FAIL** → no Committer.

---

## Per-feature gate (copy into each roadmap doc PR)

- [ ] Coordinator launched workstreams
- [ ] SpecChecker PASS — hand-impl confirmed, no unapproved packages
- [ ] Implementer(s) finished
- [ ] Breaker pass (or failures filed then fixed)
- [ ] Fixer loop complete if needed
- [ ] IntegrationTester — playground web + RN smoke PASS
- [ ] **Security PASS** (if sync/auth/storage/bridge) — `roadmap/security/<feature>-audit.md`
- [ ] SecurityFixer complete if Critical/High found
- [ ] **Verifier PASS** — checklist rows + universal gates green
- [ ] Playground panel merged and documented in feature index
- [ ] Committer: author is not Cursor; no Co-authored-by trailers

---

## Feature QA tables

Add a section to each `roadmap/<nn>-*.md` when implementation starts. Template:

```markdown
## QA tracking

| Workstream | Status |
| --- | --- |
| W1-... | missing |

| Check | Status |
| --- | --- |
| ... | missing |
```

---

## Committer — no Cursor / no auto branding

- Message/body: no Cursor, no "Made with …", no auto-assistant footers
- Author/committer: not a Cursor identity; no `Co-authored-by: Cursor`
- Same rule for branch/PR titles and bodies
- Security must PASS (when applicable) before any commit
- Commits only when the user explicitly asks

---

## Browser / device teardown

- After Playwright / visual QA / Chromium: `browser.close()` / `disposeAll()`
- Kill only Chromium this run started; do not kill the user's personal Chrome
- RN: dispose WebView on unmount; remount must not grow heap

---

## Responsiveness & performance

- Canvas rAF loop: no runaway renders on idle
- Draw stroke: no sync diff per pointer move (see [13-sync-package.md](./13-sync-package.md))
- RN WebView: test finger + stylus on iOS and Android playground
- Long session: memory stable after 10 page navigations + 20 strokes

---

## Agent console rules (summary)

```text
❌ BAD — single agent implements entire feature with new npm deps and no tests
❌ BAD — plan says "add perfect-freehand" without exception approval
❌ BAD — commit with Cursor as author or Co-authored-by trailer
❌ BAD — merge without playground demo on web and RN

✅ GOOD — Coordinator splits workstreams; hand-rolled core; Breaker tests corrupt input
✅ GOOD — IntegrationTester verifies playground web + RN before Verifier
✅ GOOD — Verifier signs QA rows; Committer only after explicit user ask
```
