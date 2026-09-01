# OutlineCanvas — Logseq Plugin

## What This Is

A Logseq DB plugin that renders hierarchical block trees as interactive visual diagrams. 8 diagram views (tree chart, tree table, roadmap x2, mind map, right tree, fishbone, treemap) rendered to Canvas2D with zero external rendering dependencies.

## Architecture

- **Entry**: `src/index.ts` — plugin lifecycle, toolbar, commands, docked/full-screen modes, macro renderer
- **Data**: `src/adapter.ts` — Logseq BlockEntity → TreeNode conversion, depth pruning (recursive/flat modes)
- **Rendering**: `src/renderer.ts` — Canvas2D drawing primitives (box, line, curve, text, dot) with multi-line text wrapping
- **Off-screen**: `src/offscreen.ts` — renders tree to PNG data URL for inline macro
- **Text**: `src/text.ts` — text measurement, word-wrap, adaptive width calculation
- **Interaction**: `src/controller.ts` — pan/zoom/resize with pointer events
- **Relationships**: `src/relations.ts` — the kind registry (styles, palette slots, ident→kind map); `src/discovery.ts` — derives the vocabulary from the graph's properties; `src/reverse-refs.ts` — the one query that finds refs pointing *into* the rendered page
- **Overlay**: `src/views/edges.ts` (connector curves + labels), `src/views/badges.ts` (counts + focus halo), `src/views/ghosts.ts` (off-page endpoints in a gutter), `src/views/visibility.ts` (lazy/always/off regime)
- **UI**: `src/ui.ts` — HTML/CSS for view switcher, zoom controls, close/dock buttons
- **Views**: `src/views/*.ts` — layout engines: `(TreeNode, maxDepth) → LayoutResult`
  - Tree Chart, Right Tree, Mind Map: recursive (arbitrary depth)
  - Tree Table, Roadmap x2, Fishbone, Treemap: 3-level
- **Theme**: `src/colors.ts` — light/dark palettes, semantic tokens, theme switching
- **Config**: `src/settings.ts` — plugin settings (defaultView, maxDepth, depthMode, edgeVisibility, relationshipScope, markerTag, customKinds, etc.)

## Key Patterns

- Tree Chart, Right Tree, Mind Map use recursive layout — they render all depth levels in the tree as connected nodes
- Other views render 3 levels; deeper nodes are handled by `flattenDeep` based on `depthMode` setting
- All rendering goes through a flat `RenderElement[]` array drawn by `renderer.ts`
- `adaptiveWidth()` computes node width from text length (wider for longer text, ~4 lines target)
- Pan/zoom is a transform applied at render time, not a layout recalculation
- Docked mode has two variants gated by the `dockBehavior` setting. Both use the same fixed 40vw iframe strip on the right; they differ in what they do to the host layout:
  - `mirror` (default): host CSS adds `margin-right: 40vw` to `#app-container-wrapper` so the canvas's strip is **reserved** in the host layout. The right sidebar lives inside that wrapper, so toggling it (T R) opens it to the *left* of the canvas, not under it. The toolbar's "Toggle right sidebar" button is hidden via CSS so its icon doesn't sit flush against the canvas edge (T R still works).
  - `overlay`: standalone fixed strip (z-index 11) that does not touch the host layout — sidebar can open under the canvas. Use when you want the canvas to float on top without resizing the app.
  - Sidebar toggle is independent of canvas visibility in both modes — canvas only closes via ✕ or Escape. Settings-change re-injects the host CSS via `provideStyle({key, style})` so the reserve-space rule is dropped/restored without a reload.
- Full-screen mode: fixed overlay covering entire viewport
- Inline macro: `{{renderer :outline-canvas}}` renders static PNG via off-screen canvas
- Theme: `theme()` returns active palette; `setTheme()` switches; views read semantic tokens
- Relationship kinds are an **open vocabulary**, not a fixed enum. Five built-ins (`relates_to`, `depends_on`, `supports`, `contradicts`, `part_of`) ship with curated styles and always win a name collision. Beyond them a kind is any property tagged `semantic-connector` (name configurable) or listed in the `customKinds` setting. Custom kinds take a color + dash from a stable hash of the name, so adding one never reshuffles the others.
- Property matching is an **ident→kind lookup** built from the graph, not a regex over key names — rename-stable, since idents survive renames. `BUILTIN_KEY_RE` in `adapter.ts` is only a fallback for when discovery hasn't run or its query failed; a failed query must not make existing connectors vanish.
- `relationshipScope: graph` renders off-page endpoints as ghost nodes. Ghosts need no view-engine changes because edges/labels/badges all read `LayoutResult.nodeRectsByUuid` — a post-layout pass inserts their rects.
- Live updates use `logseq.DB.onChanged` with 500ms debounce; the same handler invalidates the kind registry, because tagging a property changes the vocabulary without changing any setting
- Targets DB graphs only (`unsupportedGraphType: "file"` in manifest)

## Build & Dev

```bash
npm run dev        # Vite dev server at http://localhost:8090
npm run typecheck  # TypeScript type checking
npm run build      # Production build to dist/
```

## End-to-End Testing

```bash
scripts/logseq-dev-up.sh   # idempotent: starts pnpm watch (logseq repo) + npx vite if needed
scripts/logseq-smoke.sh    # opens canvas, clicks ⊞ / ✕ / Treemap, asserts state
```

The smoke script asserts host-side state — `.lsp-iframe-sandbox-container.style.cssText` and `#right-sidebar` visibility — because the iframe at :8090 is cross-origin from Logseq at :3001.

**Installing the plugin is a manual, one-time step.** Programmatic install is gone: `load_plugin_from_web_url_BANG_` no longer exists on Logseq ≥ 2.0, and the URL-install flow isn't reachable from `window.*` (`LSPluginCore.register` is the registration step, not the install). Enable Settings → Advanced → Developer mode, then ⋯ → Plugins → ⋯ → *Load plugin from web url* → `http://localhost:8090`. The smoke script now checks for the iframe and prints these steps instead of silently proceeding.

**Port 8090, not 8080.** Several plugins in this workspace default to 8080 and vite falls back silently when it is taken — which loads a *different* plugin into Logseq. `vite.config.ts` pins 8090 with `strictPort`.

Run after every non-trivial change touching dock/full-screen, toolbar buttons, or the `provideStyle` rules.

## Reference

- HTML prototype: `docs/outline-canvas-v2.html` (standalone reference for all 8 views)
- Requirements: `docs/outline-canvas-logseq-plugin-requirements.md`
- Task tracker: `tasks.md`
- Changelog: `CHANGELOG.md`
