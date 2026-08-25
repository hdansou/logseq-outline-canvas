# Changelog

All notable changes to OutlineCanvas are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [SemVer](https://semver.org/).

## [Unreleased]

### Added

- **Three new relationship kinds** alongside `relates_to` and `depends_on` — create a `:node` property with the matching ident on any block and OutlineCanvas draws the connector:
  - **`supports`** — source is evidence for target (long-dashed green arrow).
  - **`contradicts`** — source argues against target (short-dashed red arrow).
  - **`part_of`** — source is a component of target (dash-dot purple arrow).
  Every kind gets a unique color *and* a unique dash pattern, so the encoding survives grayscale and colorblind viewing.
- `src/relations.ts` — single registry of relationship kinds and their line styles. Adding a kind now touches three places (`RelKind`, `REL_STYLES`, the theme `rel` maps), all exhaustiveness-checked by `Record<RelKind, …>`; the adapter's property-ident regex is generated from the registry.

### Changed

- Theme tokens `connectorDepends` / `connectorRelates` are replaced by a per-kind `rel` color map plus `badgeOut` / `badgeIn` for the count badges (which aggregate across kinds and were never kind-specific).

## [1.2.0] — 2026-05-17

Docked-mode rework so the canvas and Logseq's right sidebar coexist as independent panels instead of fighting for the same slot.

### Added

- **`dockBehavior` setting** — choose how the docked canvas interacts with the host layout:
  - **`mirror`** (default): the canvas reserves its strip in the app layout via host CSS (`margin-right` on `#app-container-wrapper`). Toggling the right sidebar (T R, button, or `setRightSidebarVisible`) opens it to the *left* of the canvas instead of sliding under it.
  - **`overlay`**: the canvas floats above the app as a fixed strip on the right (z-index 11) and does not resize the host. The sidebar opens under the canvas. Use when you want the canvas to overlay without reflowing the page.
- **`dockWidth` setting** — width of the docked canvas as a percentage of the viewport (vw, default 40, clamped 20–70). Drives both the iframe width and the host's reserved strip in lock-step.
- **Drag-to-resize handle** — a slim strip on the canvas's left edge. Drag it to resize the canvas live; the new width persists to `dockWidth` on release. Hidden in full-screen mode.

### Changed

- The right-sidebar toggle (T R / toolbar button) no longer closes the canvas in either mode — the canvas only closes via ✕ or Escape.
- In mirror mode, the host toolbar's "Toggle right sidebar" button is hidden via CSS so its icon doesn't sit flush against the canvas's left edge. The T R keyboard shortcut still toggles the sidebar.
- Host-side CSS is now re-injectable via `provideStyle({key, style})` so settings changes (`dockBehavior` / `dockWidth`) take effect without a reload.

### Removed

- Old "force-open right sidebar + overlay on top + hide sidebar contents" behavior of docked mode. The replacement (reserve-space via host CSS) is more predictable and lets the sidebar stay a usable panel while the canvas is open.

## [1.1.0] — 2026-05-16

First feature release after the marketplace launch. Introduces cross-hierarchy relationship visualization, PNG export, and matching toolbar iconography. 64 unit tests pass; `npm audit` clean.

### Added

- Node relationship connectors with lazy-edges + badges UX. Two user-created DB properties of type `:node` — `relates_to` and `depends_on` — surface in Tree Chart, Right Tree, and Mind Map views:
  - **Badges** (always visible): every node with relationships gets corner annotations — `→N` top-right for outgoing, `←N` bottom-right for incoming. Signals "this node participates in relationships" at a glance without cluttering the canvas.
  - **Lazy edges** (on click): edges are hidden at rest. Clicking a node focuses it — the node gets an accent halo and *only its* edges fade in (`depends_on` = solid arrowed bezier; `relates_to` = dashed bezier). Clicking empty canvas clears the focus. Both interactions preserve the existing click-to-navigate behavior.
  - **Stacked-column routing**: when source and target share an x-range (vertical stack), the bezier arcs outward to the right instead of slicing through intermediate boxes.
  - **Optional labels** (`showRelationshipLabels`, off by default): renders the property name as a small pill at each visible curve's midpoint. Useful as a visual cue at first; turn off once line styles become familiar.
- Property extraction tolerates DB-graph realities: top-level namespaced keys (`user.property/foo-XYZ`), leading-colon keys (`:user.property/foo-XYZ`), `.properties` sub-object, and ref values shaped as bare UUID / `{block/uuid}` / `{uuid}` / `{id: <number>}` (numeric `:db/id` resolved via `Editor.getBlock`, cached per build). Match by ident prefix, not title, so renames keep working.
- **PNG export from the toolbar.** New ⬇ download button saves `outline-canvas-<view>-<timestamp>.png` to your downloads folder. New 📋 copy button writes the image to the system clipboard via `navigator.clipboard.write`. Both render WYSIWYG — current pan/zoom + all edges always + labels follow setting + no badges/halo/chrome. Icons are inlined Tabler Icons SVGs matching Logseq's iconography.
- Static PNG macro renderer surfaces badges (but not edges, since there's no interaction surface). Clicking the inline image opens the interactive view.
- `showRelationships` setting (default on) hides badges + halo + edges + labels in one toggle.
- `AGENTS.md` — operational landmines and workflow expectations for agents working on the repo.

### Fixed

- macOS full-screen mode: toolbar now reserves 84 px on the left so the native window controls (traffic lights) no longer overlay the first view button.

### Changed

- `src/index.ts` now splits layout-compute (camera-resetting) from element composition (cheap, used on focus changes), so clicking a node to focus its relationships no longer resets pan/zoom.
- `src/offscreen.ts`: extracted a private `renderElementsToDataURL` primitive that both the macro renderer and the live export share, removing canvas-setup duplication.
- Deduped the `LogseqBlock` interface — exported from `adapter.ts` and imported into `index.ts` (was declared twice with slightly different shapes).
- Removed dev-banner `console.log("OutlineCanvas loaded!/ready!")` calls from plugin init.
- `.gitignore` expanded: `.vite/`, `.eslintcache`, `*.cache`, `*.tmp`, `*.swp`, `*~`, `.cursor/`, `.codeium/`. `AGENTS.md` is deliberately tracked, unlike the agent-state directories.

## [1.0.1] — 2026-05-15

### Fixed

- DB-graph node references now render as the referenced entity's title instead of the raw `[[uuid]]` storage form. Block titles in DB graphs encode references as `[[uuid]]`; the adapter previously stripped only the brackets, so a block titled `[[69fd1b8a-…]]` displayed its UUID. The adapter now resolves each UUID via the Editor SDK (block then page fallback), with per-build caching, bounded recursion for nested refs, and a visible placeholder when a ref can't be resolved.
- Long URLs and file paths no longer overflow node boxes or collide with sibling nodes. `adaptiveWidth` now grows the box to fit the longest unbreakable token on a single line (capped at 720 px); `wrapText` falls back to splitting on URL/path separators (`/ ? & = - _ . :`) and ultimately character-wise so the universal "every line ≤ box width" invariant always holds.

### Added

- Vitest test runner with 22 unit tests covering the adapter (UUID-ref resolution, cache dedup, recursion, cycles, fetch failures) and text layout (grow-to-fit, cap, separator-break, the line-width invariant). Functions accept an optional measurer / fetcher for deterministic testing.

## [1.0.0] — 2026-05-01

First marketplace-ready release. Stabilises the renderer macro syntax (`{{renderer :outline-canvas[, <view>]}}`), the five plugin settings (`defaultView`, `maxDepth`, `depthMode`, `showEmptyBlocks`, `animateViewSwitch`), the slash commands (`/outline`, `/outline-canvas`), and the `Cmd+Shift+O` keybinding. Future breaking changes to any of those will require a 2.0.0 release. Targets Logseq DB graphs only; gated via `unsupportedGraphType: "file"` in the manifest.

### Fixed

- Restore docked and full-screen modes after Logseq's April 2026 plugin-libs refactor (logseq/logseq#12395). Logseq now persists the plugin container's layout and silently drops `left/top/right/bottom/width/height` keys from `setMainUIInlineStyle` once `data-inited_layout="true"` — the canvas would show an empty sidebar iframe, and the maximize (⊞) / close (✕) buttons became unresponsive. Inline styles are now applied directly to `.lsp-iframe-sandbox-container` with `setProperty(..., "important")`, bypassing the gate.
- Sidebar topbar no longer steals clicks on macOS. `.cp__right-sidebar-topbar` uses `-webkit-app-region: drag`, which hijacks mouse events in its pixel region for OS window-dragging — visible symptom was Treemap / maximize / close buttons silently failing when the iframe's toolbar wrapped to two rows. A host-side `:has()` CSS rule now hides Logseq's `#right-sidebar` while the plugin iframe has `.visible`, disabling the drag region along with it.

### Changed

- Toolbar click handling consolidated into a single capture-phase delegated listener on `#app` (view switcher, maximize, close, zoom, fit-to-view).
- `:has()` CSS selector now sources plugin id from `logseq.baseInfo.id` instead of a hard-coded literal.
- `setDockedStyle` collapsed to a single `setContainerStyle` call with spread geometry, removing duplicated position/zIndex/borderLeft keys and the transient 40 vw flash before the measured rect applied.
- Dev server bound to `127.0.0.1` (loopback) instead of `0.0.0.0` to avoid LAN exposure during local development.
- Bumped `@logseq/libs` to `^0.3.3` and `vite` to `^8.0.10`. Added `overrides` for `dompurify@^3.4.2` and `lodash-es@^4.18.1` to clear known transitive vulnerabilities through the SDK.

### Removed

- Dead `mousedown` "close on click outside `.oc-root`" listener — in full-screen mode the iframe covers the viewport, so every click is inside `.oc-root` and the close path was unreachable.

## [0.1.0] — 2026-04-08

### Added

- Eight diagram views rendered to Canvas2D: Tree Chart, Tree Table, Roadmap ↕, Roadmap →, Mind Map, Right Tree, Fishbone, Treemap.
- Recursive depth rendering for Tree Chart, Right Tree, and Mind Map — configurable via `maxDepth` + `depthMode` (`recursive` | `flat`) settings.
- Inline macro renderer: `{{renderer :outline-canvas[, <view>]}}` renders a static PNG; click opens the interactive canvas.
- Docked mode (overlays `#right-sidebar-container`) and full-screen mode, toggled via toolbar button or `Cmd+Shift+O`.
- Pan / zoom / fit-to-view / click-to-navigate canvas interactions.
- Light and dark theme support with live switching via `onThemeModeChanged`.
- Multi-line text wrapping with adaptive node widths.
- Treemap hover breadcrumb.
- Live updates via `logseq.DB.onChanged` (500 ms debounced).
- Plugin settings: `defaultView`, `maxDepth`, `depthMode`, `showEmptyBlocks`, `animateViewSwitch`.
- Slash commands: `/outline` (opens focused on current block), `/outline-canvas` (inserts macro).
- DB-graph-only gate via `unsupportedGraphType: "file"` in the manifest.
