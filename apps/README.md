# apps

Deployable surfaces, not published packages:

- `website/` — marketing site and blog (Astro). The hero embeds the real SDK.
- `docs/` — Nextra documentation site (`incantly-docs`).
- `app/` — hosted whiteboard demo: a thin Vite wrapper around `@incantly/canvas` with localStorage persistence.
- `playground/` — SDK feature playground for development and QA.

RN / Expo demos live under [`examples/native-rn-demo`](../examples/native-rn-demo) (standalone, not a workspace) so Metro does not fight the monorepo.

All consume the engine from the workspace, so they always track `main`.
