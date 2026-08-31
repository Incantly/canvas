# Incantly Canvas Playground

Manual testing app for SDK features as they land on the roadmap. Run from the monorepo root:

```bash
npm run dev:playground
```

## Layout

- **Left** — feature index (roadmap panels)
- **Center** — active feature demo (canvas)
- **Right** — debug panel (snapshot JSON, store size, camera, fixtures)

## Adding a new panel

When a roadmap feature merges, wire its demo into the playground:

1. **Create a panel component** under `src/panels/`, e.g. `RichTextPanel.tsx`. Keep feature-specific UI and props isolated; use `/* rn: ... */` comments if WebView behavior differs.

2. **Add a fixture** (optional) under `src/fixtures/` — a minimal valid snapshot JSON:

   ```json
   { "document": { "store": {} } }
   ```

3. **Register in `FeatureIndex.tsx`** — add an entry to `ROADMAP_FEATURES` with `status: 'active'` (or `'done'` when stable).

4. **Render in `App.tsx`** — switch on `selectedPanel` id and mount your panel. Pass `store` and `onEditorReady` if the demo uses the shared canvas store:

   ```tsx
   {selectedPanel === '03' && (
     <RichTextPanel store={store} onEditorReady={setEditor} />
   )}
   ```

5. **React Native** — add a matching scene in the mobile playground (see `roadmap/01-playground-app.md`).

The debug panel reads from the shared `store` and `editor` ref; no changes needed unless your panel uses a separate store.

## Panel contract

- One panel per roadmap doc (`02`, `03`, …)
- Reproducible state via fixtures + **Reset** / **Load empty fixture**
- Feature flags (URL params) can be added in `App.tsx` when needed

See [`roadmap/01-playground-app.md`](../../roadmap/01-playground-app.md) for full scope.
