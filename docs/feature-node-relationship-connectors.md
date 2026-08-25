# Feature: Node Relationship Connectors

**Version:** 1.2
**Date:** August 24, 2026
**Status:** Implemented (v1.1.0; kind set extended in v1.3.0)
**Initial Scope:** May 15, 2026

**v1.3 revision (Aug 25, 2026):** two follow-ups driven by live use — connectors can now stay drawn at rest (`edgeVisibility`) and can reach targets outside the rendered page (`relationshipScope`). See §14.

**v1.2 revision (Aug 24, 2026):** the recognised relationship set grows from two kinds to five — `supports`, `contradicts` and `part_of` join `relates_to` and `depends_on`. Kinds are now declared once in `src/relations.ts` (line style) plus the theme's `rel` color map; nothing else in the pipeline is kind-aware.

---

## 1. Summary

Render cross-hierarchy relationships between blocks as visual connectors on the canvas. Five user-created Logseq DB properties of type `:node` drive the overlay:

| Kind | Meaning | Directed | Line |
|---|---|---|---|
| **`relates_to`** | symmetric association between two blocks | no | dashed `[6,4]`, lw 1.3 |
| **`depends_on`** | source depends on target | yes | solid, lw 1.6 |
| **`supports`** | source is evidence for target | yes | dashed `[10,3]`, lw 1.5 |
| **`contradicts`** | source argues against target | yes | dashed `[3,3]`, lw 1.5 |
| **`part_of`** | source is a component of target | yes | dash-dot `[9,3,2,3]`, lw 1.4 |

Dash patterns are unique per kind so the encoding survives grayscale and colorblind viewing — the same accessibility rule the branch palette follows.

When OutlineCanvas renders a subtree, any block carrying these properties whose target is **also** in the rendered subtree becomes a candidate for a visual connector between the two boxes. The tree hierarchy still drives layout; relationships are an overlay pass.

UX uses a **lazy edges + badges** model: at rest the diagram is clean (no edges drawn) — every node carrying refs shows small corner badges with outgoing / incoming counts. Clicking a node focuses it (accent halo) and fades in just its edges. This scales to dense graphs without spaghetti and preserves tree readability.

## 2. Motivation

Block hierarchy alone can't capture all real-world structure. Project tasks under one parent often depend on tasks under a different parent. Concepts in one branch of a knowledge tree relate to concepts in another. Users can express these relationships in Logseq as node-typed properties, but the diagram historically dropped that signal because it only walked parent → child links.

Connectors make the second graph visible without flattening the first.

## 3. Scope

### In scope (v1.1)

- Reading all five relationship properties off DB-graph blocks (both top-level namespaced keys and the `.properties` sub-object, with or without leading colon).
- Supporting `:db.cardinality/one` and `:db.cardinality/many` value shapes, plus the four ref shapes the SDK surfaces: bare UUID string, `{"block/uuid": "..."}`, `{uuid: "..."}`, and `{id: <number>}` (numeric `:db/id` resolved via async `Editor.getBlock`).
- Connectors in three views: **Tree Chart**, **Right Tree**, **Mind Map**.
- Drawing connectors only between nodes already visible in the rendered subtree (intra-tree only).
- Differentiated visual encoding per kind: unique color + dash pattern, arrowhead on every directed kind (`relates_to` — the only symmetric kind — has none). Table in §1.
- **Stacked-column routing**: when source and target share an x-range (would strike through intermediate boxes on a straight path), the curve arcs outward on the same-side faces to avoid occlusion.
- **Lazy edges**: nothing drawn at rest. Click a node → its outgoing + incoming edges fade in. Click empty canvas → fade out. Existing click-to-navigate behaviour preserved.
- **Badges**: every node touched by refs gets corner annotations — `→N` top-right (outgoing), `←N` bottom-right (incoming). Color-coded to match edge styles. Pure visual indicators; not hit-test targets.
- **Focus halo**: accent-colored ring around the currently focused node so the user knows whose edges they're looking at.
- **Optional edge labels** (off by default, `showRelationshipLabels` setting): small pill at each visible curve's midpoint showing the property name, with bg-colored fill so it occludes crossing connectors cleanly.
- **Export PNG**: download button (⬇) and copy-to-clipboard button (📋) in the toolbar — both render the current WYSIWYG view (current pan/zoom, all edges shown, no badges/halo/chrome) using the Tabler Icons set Logseq uses.
- Light + dark theme support with semantic tokens.
- Static PNG macro renderer (`{{renderer :outline-canvas}}`) surfaces badges (counts) but not edges — clicking the inline image opens the interactive view where the user can focus a node.
- `showRelationships` master toggle (default on) — when off, edges/badges/halo/labels all disappear.

### Out of scope (deferred)

- **External targets.** If `A depends_on B` and only A is in the rendered subtree, the edge is dropped silently. No phantom nodes, no edge-of-canvas stubs.
- **Other views.** Treemap, Fishbone, Roadmap ↕, Roadmap →, Tree Table render source/target nodes as usual but draw no connector and show no badge.
- **Generic property discovery.** Only the five kinds in the registry (matched by ident prefix — see §4.2). Arbitrary node-typed properties are ignored. Adding a sixth kind is a three-line change (`RelKind`, `REL_STYLES`, both theme `rel` maps) that the `Record<RelKind, …>` types make exhaustive at compile time.
- **Connector hover/click affordances.** Curves are not interactive — the focused-node click is the only interaction.
- **Orthogonal / collision-avoiding edge routing.** Curves may visually cross tree branches in dense subtrees; the stacked-column routing covers the common cases but isn't a full router.
- **Reverse-direction Datascript queries.** Edges are sourced exclusively from outgoing properties on visible nodes. A node's "incoming" count is derived by walking the in-memory tree's `refs`, not from a global graph query.

## 4. Data Model

### 4.1 Property storage in Logseq DB graphs

User-created properties have auto-generated namespaced idents with random suffixes:

```edn
:user.property/relates_to-HG66AZUl
:user.property/depends_on-SfjMwya6
```

The ident is **immutable** once assigned. In JS via `@logseq/libs`, properties surface as **top-level namespaced keys** on the block object — `block["user.property/relates_to-HG66AZUl"]` (or with a leading colon: `block[":user.property/relates_to-HG66AZUl"]`). The legacy `.properties` sub-object is also checked as a defensive fallback.

A block carrying a relationship surfaces (variously) as:

```ts
{
  uuid: "69e2f7b5-0784-...",
  title: "**User-defined properties** ...",
  "user.property/relates_to-HG66AZUl": { id: 1234 }                       // numeric :db/id
  // OR { "block/uuid": "69e2f7b5-..." } / { uuid: "..." } / "uuid-string" / array-of-any
}
```

### 4.2 Property identification strategy — IDENT PREFIX

The plugin matches on the ident's local-name prefix:

```
^:?user\.property\/(relates_to|depends_on)(?:-[A-Za-z0-9_-]+)?$
```

**Decision changed from initial scope.** The original plan was title-matching (resolve each property ident → its `:block/title` via `Editor.getBlock(ident)`, then check title equals `relates_to` / `depends_on`). In practice this added one extra round-trip per unique property and depended on `getBlock` accepting namespaced idents — a hard-to-verify SDK boundary. Prefix matching is:

- **Synchronous and zero-cost** — no extra lookups per property.
- **Stable enough** — the user creates properties named after the kinds; if they rename one later, the connector keeps drawing for that property. We treat this as an acceptable v1 edge case.

### 4.3 Adapter additions

`TreeNode` gains:

```ts
export type RelKind =
  | "relates_to" | "depends_on" | "supports" | "contradicts" | "part_of";

interface NodeRef {
  kind: RelKind;
  targetUuid: string;
}

interface TreeNode {
  // ... existing fields
  refs?: NodeRef[];
}
```

`convertBlock` calls `extractRefs(block, idCache, idResolver)`:

1. Iterate top-level block keys + `.properties` sub-object.
2. For each key matching the relationship prefix regex, walk the value via `extractRefUuids`:
   - `string` → UUID-shaped string used directly
   - `{"block/uuid": "..."}` → use directly
   - `{uuid: "..."}` → use directly
   - `{id: <number>}` → call `idResolver(id)` (default: `Editor.getBlock(id)` → `.uuid`), cache the resolution per build
   - `Array<...>` → flatMap over members
3. Push a `NodeRef` per resolved target uuid, dedup'd (`kind|target` signature) across top-level + `.properties` paths.

### 4.4 Intra-tree filter

`filterIntraTreeRefs(root: TreeNode): TreeNode` collects every node UUID in the tree into a `Set`, then walks again and drops any `NodeRef` whose `targetUuid` is not in the set. Runs **after** `flattenDeep` pruning, so refs into depth-pruned subtrees are also dropped. Returns a structurally-cloned tree — input is untouched.

## 5. Layout & Rendering

### 5.1 Layout output

`LayoutResult` gains `nodeRectsByUuid?: Map<string, Rect>`. Populated by Tree Chart, Right Tree, Mind Map. Other views leave it undefined; the overlay pipeline produces nothing for them.

### 5.2 Edge overlay — `src/views/edges.ts`

```ts
buildEdgeElements(root, rectsByUuid, focusedUuid?): RenderElement[]
buildEdgeLabels(root, rectsByUuid, focusedUuid?): RenderElement[]
```

`focusedUuid` semantics:
- `undefined` → eager mode: emit every edge (used by PNG export).
- `string` → lazy mode: only edges where source OR target = focused.
- `null` → suppress entirely (used by macro renderer / pre-interaction state).

Per-edge geometry:

- Compute `dx`, `dy` between source/target centers.
- **Stacked case** (x-ranges overlap, |dy| > 8): anchor both endpoints on the right faces; push control points further right by `max(50, |dy| * 0.45)`. Curve bulges outward, around intermediate boxes.
- **Horizontal-dominant**: anchor on facing left/right faces, mid-x control points (matches tree-branch bezier style).
- **Vertical-dominant** (no x-overlap): anchor on top/bottom faces, mid-y control points.

Each edge becomes a `CurveElement`. `depends_on` adds `arrowEnd: true` (filled triangle tangent to curve at endpoint). `relates_to` adds `dash: [6, 4]`.

Labels (`buildEdgeLabels`): same filtering and geometry; at `t = 0.5` along the curve, emit a `BoxElement` pill (solid bg fill, kind-colored border) and centered `TextElement` with the property name.

### 5.3 Renderer primitives

- `LineElement` and `CurveElement` both carry optional `dash?: number[]` and `arrowEnd?: boolean`.
- New `drawArrowHead(ctx, x1, y1, x2, y2, color, lw)` — filled triangle. For curves the arrow direction is tangent at the endpoint, computed from the `(cp2 → endpoint)` vector.

### 5.4 Badges — `src/views/badges.ts`

```ts
buildBadges(root, rectsByUuid): RenderElement[]
buildFocusHalo(focusedUuid, rectsByUuid): RenderElement[]
```

- One pass over the tree builds `Map<uuid, outCount>` and `Map<uuid, inCount>`.
- For each rect with non-zero counts: emit a pill (rounded box) + centered text. Outgoing badge top-right (`badgeOut` fill), incoming bottom-right (`badgeIn` fill) — badge colors are kind-agnostic, since a node's counts aggregate across kinds. Text color: theme `bg` for inverted contrast.
- Badges deliberately have no `uuid` so `hitTest` skips them — the node body underneath remains clickable.
- Focus halo: single bordered, accent-dim-filled box drawn behind the focused rect (extends ±6px). Rendered before layout elements so it sits under the node.

### 5.5 Theme tokens

| Token | Dark | Light | Purpose |
|---|---|---|---|
| `rel.relates_to` | `#a8a8b2a0` | `#555568a0` | `relates_to` line + label pill stroke |
| `rel.depends_on` | `#f76800d8` | `#c44d00d8` | `depends_on` line + arrowhead |
| `rel.supports` | `#46a758d8` | `#2d7a30d8` | `supports` line + arrowhead |
| `rel.contradicts` | `#e5484dd8` | `#dc3d43d8` | `contradicts` line + arrowhead |
| `rel.part_of` | `#6e56cfd8` | `#5746a8d8` | `part_of` line + arrowhead |
| `badgeOut` | `#f76800d8` | `#c44d00d8` | outgoing (`→N`) badge fill |
| `badgeIn` | `#a8a8b2a0` | `#555568a0` | incoming (`←N`) badge fill |

Halo reuses existing `accent` / `accentDim`. Label pills reuse `bg` (fill) + `muted` (text).

### 5.6 Render order (low → high z)

```
focus halo
└─ layout elements (tree branches + node boxes)
   └─ overlay edges (curves)
      └─ edge labels (pill + text)
         └─ badges (pill + text)
```

## 6. Settings

| Key | Type | Default | Description |
|---|---|---|---|
| `showRelationships` | `boolean` | `true` | Master toggle. When off, edges + badges + halo + labels all suppressed; canvas renders as v1.0. |
| `showRelationshipLabels` | `boolean` | `false` | Show property-name labels at curve midpoints. Useful at first; off-by-default to keep the diagram quiet once line styles become familiar. |
| `edgeVisibility` | `enum` | `"lazy"` | When edges are drawn: `lazy` (only for the focused node — the v1.1 behavior), `always` (every edge, all the time), `off` (never; badges and halo still render). See §14.1. |
| `relationshipScope` | `enum` | `"page"` | How far refs may reach: `page` (both endpoints must be in the rendered tree — the v1.1 behavior) or `graph` (off-page endpoints render as ghost nodes in a gutter). See §14.2. |

No per-property toggle, no per-view toggle.

## 7. PNG Output

### 7.1 Inline macro renderer (`offscreen.renderToDataURL`)

`{{renderer :outline-canvas}}` produces a **static** PNG with:
- Layout elements (tree)
- **Badges** (counts) — discovery signal for "this graph has relationships"
- **No** edges (no interactivity in a static image; would clutter)
- **No** halo / focus state

Clicking the inline image opens the interactive view where the user can focus a node to see its edges.

### 7.2 Live export (`offscreen.exportCurrentViewAsDataURL`)

Triggered by the ⬇ download or 📋 copy button in the canvas toolbar. WYSIWYG — uses the live transform (pan/zoom) and canvas dimensions. Includes:
- Layout elements
- **All** edges (eager — passes `focusedUuid` undefined)
- **Labels** if `showRelationshipLabels` is on (mirrors live setting)
- **No** badges, halo, or interaction chrome

The Copy button uses `navigator.clipboard.write([new ClipboardItem({"image/png": blob})])` and surfaces success/error via `logseq.UI.showMsg`. Falls back gracefully if the clipboard API isn't available.

## 8. Toolbar Icons

Switched from Unicode glyphs to inlined **Tabler Icons** SVGs (the icon set Logseq itself uses) for the new download and copy buttons. Stroke uses `currentColor` so they pick up the existing button color + hover state.

## 9. Platform Considerations

In full-screen mode on macOS, the iframe covers the whole window — including the area where the OS draws the native window controls (traffic lights). The toolbar applies `padding-left: 84px` via the `.oc-fullscreen.oc-platform-mac` class combo to clear that area. Docked mode is unaffected.

## 10. Performance

- One DB round-trip per unique numeric `:db/id` ref value, cached per tree build.
- No additional Datascript queries.
- Edge / badge / label composition is pure tree walking + map lookups — runs in O(nodes + refs).
- `composeElements` is split from `rebuildLayout` so focus changes redraw without recomputing layout or resetting camera. Tree/view/setting changes trigger a full `rebuildLayout`.

## 11. Testing

`npm test` runs **64 unit tests** across:

| File | Coverage |
|---|---|
| `src/adapter.test.ts` | UUID ref resolution in titles, refs extraction (one/many cardinality, top-level keys, leading-colon keys, `{id}` async resolution, ident-prefix matching, intra-tree filter, `flattenDeep` preserves refs) |
| `src/text.test.ts` | Text wrapping, adaptive width, separator-break fallback |
| `src/views/edges.test.ts` | Curve geometry (4 quadrants + stacked column), depends_on=arrow / relates_to=dashed, lazy filter (focusedUuid undefined/null/match/miss), label emission |
| `src/views/badges.test.ts` | Outgoing/incoming counts, both-badges-on-one-node, missing-rect skipping, focus halo bounds |

Manual smoke (not automated):
- Create `relates_to` + `depends_on` properties in a Logseq DB graph, link two blocks, render Tree Chart / Right Tree / Mind Map, verify edges appear on focus and badges show counts.
- Toggle `showRelationshipLabels`, verify pills appear/disappear at curve midpoints.
- Trigger ⬇ download and 📋 copy from the toolbar; verify file downloads / clipboard contains PNG with edges.

## 12. Resolved Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Property names | Hardcoded `relates_to` and `depends_on` | Predictable, zero-config |
| Match strategy | **Ident prefix** (`user.property/<kind>-<suffix>`) | Synchronous; no SDK round-trip per property; rename edge case acceptable |
| Endpoint scope | Intra-tree only | External refs dropped at adapter boundary |
| Views | Tree Chart, Right Tree, Mind Map | Recursive layouts with known rect positions |
| Visual: `depends_on` | Solid bezier + arrowhead | Directional semantic |
| Visual: `relates_to` | Dashed bezier, no arrow | Symmetric semantic |
| Stacked-column routing | Same-side anchors + outward bulge | Avoids strike-through when target sits in the same column |
| Lazy edges | Edges hidden at rest; click-to-focus | Scales to dense graphs without spaghetti |
| Badges | Always visible (when `showRelationships` on) | Discovery signal — tells the user relationships exist |
| Labels | Setting-gated (`showRelationshipLabels`, default off) | Useful for newcomers; off keeps diagram quiet |
| PNG macro content | Badges only, no edges | Static image can't be focused; clicking opens interactive |
| Export PNG | All edges shown; labels follow setting; no badges/halo | Static deliverable for sharing |

## 13. Implementation Notes (post-build)

- **`{id: <number>}` was the dominant value shape in practice.** The original spec listed it as one of several possibilities; in real DB graphs it's what the SDK actually returns from `Editor.getBlock` for node-typed property values. The async `idResolver` is exercised every time.
- **Property keys come with a leading colon** in some SDK paths (`:user.property/...`) and without in others. The prefix regex handles both.
- **`block.properties` is mostly empty in DB graphs.** The top-level-key iteration is the primary path; the `.properties` fallback rarely fires but is kept for defense in depth.
- **`Editor.getBlock(<numeric id>)` works reliably.** The original concern about needing `DB.datascriptQuery` fallback never materialized.

## 14. Connector Visibility & Scope (v1.3)

### 14.1 `edgeVisibility` — connectors that persist

Lazy edges keep a dense diagram readable, but they make the *shape* of the relationship graph invisible until you start clicking, and they diverge from the PNG export, which has always drawn every edge regardless of focus. `edgeVisibility` makes the regime a user choice:

| Value | Edges | Halo | Badges |
|---|---|---|---|
| `lazy` (default) | only those touching the focused node | yes | yes |
| `always` | all of them, at rest | yes (still marks the focused node) | yes |
| `off` | none | yes | yes |

No new rendering code is required. `buildEdgeElements(root, rects, focusedUuid?)` already encodes all three regimes in its third parameter: a uuid means lazy, `undefined` means emit everything (what the exporter passes), `null` means suppress. The setting maps onto that parameter:

```
lazy   -> focusedUuid          (string | null)
always -> undefined
off    -> null
```

`buildEdgeLabels` follows the same regime so labels never outlive their edges. Focus itself is unchanged in every mode — clicking still navigates and still paints the halo, because with `always` the user still needs to know which node they selected.

**Interaction with `showRelationships`.** The master toggle still wins: when it is off, nothing in the overlay renders regardless of `edgeVisibility`. `off` is therefore *not* redundant with it — `off` keeps badges and halo (the discovery signal) while dropping only the curves.

### 14.2 `relationshipScope` — connectors across the graph

Today `filterIntraTreeRefs` drops any ref whose target is not already a node in the rendered tree, so a relationship that crosses a page boundary vanishes silently. `relationshipScope: "graph"` keeps those relationships by giving their off-page endpoints somewhere to live.

**Ghost nodes.** The insight that keeps this cheap: edges, labels, and badges are computed purely from `LayoutResult.nodeRectsByUuid`. An off-page endpoint therefore needs a *rect*, not a view-engine change. After the active view returns its layout, a post-layout pass:

1. Collects every external target uuid (deduped) and resolves its title through the existing `RefFetcher` (block title, then page title, then `↗ <8-char uuid>`).
2. Lays each out as a compact node stacked in a gutter to the right of `bounds`, visually distinct from tree nodes (dashed stroke, muted fill) so a ghost never reads as part of the hierarchy.
3. Inserts each rect into `nodeRectsByUuid` and extends `bounds` to cover the gutter.

Everything downstream then works unchanged. Ghosts carry their real uuid, so the existing hit-test gives click-to-navigate for free.

**Incoming edges are a separate problem.** Refs are discovered by walking the blocks *of the rendered page*, so a block elsewhere in the graph that declares `supports -> <block on this page>` is invisible no matter what the filter does. Recovering those needs one reverse query per tree build:

- Resolve the five property idents once per graph (they carry per-graph suffixes, e.g. `:user.property/supports-rsddWi2L`), by title.
- One `logseq.DB.datascriptQuery` finding blocks whose value for any of those idents is one of the rendered tree's block ids.
- Each hit becomes a ghost *source*, drawn with the same kind styling; direction is preserved (ghost -> tree node).

One query per build, not one per node.

**Caps.** Fan-in and fan-out are unbounded in a real graph. Ghosts are capped (default 12, most-connected first); the overflow is reported as a single `+N more` chip in the gutter rather than silently truncated. Badge counts always reflect the *true* totals, so a capped diagram never lies about how connected a node is.

**Defaults and blast radius.** `relationshipScope` defaults to `page`, so existing graphs render exactly as before. The three recursive views (Tree Chart, Right Tree, Mind Map) are the only ones affected, as with every other part of the overlay.

**Not in scope.** A multi-page force-directed graph view. That is a new view with its own layout engine, camera, and performance story — not an extension of this overlay.

### 14.3 Authoring is still out of scope

Worth recording, since it constrains any future "draw an edge on the canvas" feature: plugins may *assign* values to existing user properties, but Logseq rejects creating them — `upsertProperty(":user.property/...")` fails with *"Plugins can only upsert its own properties"*, and properties a plugin creates land under `:plugin.property.<pid>/...`, which the adapter deliberately does not match. Any authoring UI would depend on the user having created the five properties by hand first.
