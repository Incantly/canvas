# RN Document Mode — Security Audit

**Feature:** React Native document mode bridge parity  
**Date:** 2026-08-31  
**Status:** PASS

## Scope

- `packages/react-native/src/webview-entry.ts` — bridge handlers
- `packages/react-native/src/index.tsx` — RN message routing
- `packages/core/src/page-document-ui.ts` — paste, link prompt, clipboard hooks

## Findings

| Severity | Finding | Status |
| --- | --- | --- |
| — | No Critical/High findings | PASS |

## Review notes

1. **Bridge message validation:** Unknown `type` values are ignored in `dispatch`. Malformed JSON is caught on RN `onMessage`.
2. **Clipboard:** `readClipboard` requires host app callback (`onReadClipboard`); default returns empty string — no silent exfiltration without app opt-in.
3. **Link prompt:** `promptLink` uses native `Alert.prompt` on iOS or host callback; Android without callback returns null.
4. **Image paste:** Images converted to data URLs and stored in notebook document blocks; no external fetch.
5. **No secrets** added to WebView HTML or bridge payloads.
6. **Snapshot integrity:** ImageBlock is additive; `validateDocumentBlocks` rejects empty `src`.

## Deferred / Low

- Image data URLs can grow snapshots — quota handling remains app responsibility.
