import "@logseq/libs";
import type {
  ViewId,
  ViewDef,
  RenderElement,
  TreeNode,
  LayoutResult,
  EdgeSpec,
  RelKind,
} from "./types";
import {
  registerSettings,
  getSettings,
  parseNameList,
  DOCK_WIDTH_MIN,
  DOCK_WIDTH_MAX,
} from "./settings";
import {
  fetchTree,
  fetchBlockTree,
  flattenDeep,
  buildTree,
  filterRefsToSet,
  collectExternalRefs,
  defaultFetcher,
} from "./adapter";
import type { LogseqBlock } from "./adapter";
import { buildEdgeElements, buildEdgeLabels } from "./views/edges";
import { buildBadges, buildFocusHalo } from "./views/badges";
import { edgeFocusArg } from "./views/visibility";
import { selectGhosts, layoutGhosts, GHOST_CAP, type GhostNode } from "./views/ghosts";
import { fetchIncomingRefs } from "./reverse-refs";
import { refreshRegistry, type PropertyEntry } from "./discovery";
import { identToKind } from "./relations";
import { render, hitTest } from "./renderer";
import { createState, fitToView, zoomIn, zoomOut, attachHandlers } from "./controller";
import { buildUI, STYLES, setActiveView, applyThemeToUI, updateDockButton, applyPlatformClass, updateFullscreenClass } from "./ui";
import { setTheme } from "./colors";
import { renderToDataURL, exportCurrentViewAsDataURL } from "./offscreen";
import { layoutTreeChart } from "./views/tree-chart";
import { layoutTreeTable } from "./views/tree-table";
import { layoutRoadmapAlt, layoutRoadmapLinear } from "./views/roadmap";
import { layoutMindMap } from "./views/mind-map";
import { layoutRightTree } from "./views/right-tree";
import { layoutFishbone } from "./views/fishbone";
import { layoutTreemap, treemapHitBoxes } from "./views/treemap";

const VIEWS: ViewDef[] = [
  { id: "tree", label: "Tree Chart", icon: "⎅", layout: layoutTreeChart },
  { id: "table", label: "Tree Table", icon: "⊟", layout: layoutTreeTable },
  { id: "roadmap_alt", label: "Roadmap ↕", icon: "⟿", layout: layoutRoadmapAlt },
  { id: "roadmap", label: "Roadmap →", icon: "→", layout: layoutRoadmapLinear },
  { id: "mind", label: "Mind Map", icon: "◎", layout: layoutMindMap },
  { id: "rtree", label: "Right Tree", icon: "⊳", layout: layoutRightTree },
  { id: "fish", label: "Fishbone", icon: "⟜", layout: layoutFishbone },
  { id: "tmap", label: "Treemap", icon: "▦", layout: layoutTreemap },
];

// Plugin state
let activeView: ViewId = "tree";
let currentTree: TreeNode | null = null;
let currentDisplayTree: TreeNode | null = null;
let currentLayout: LayoutResult | null = null;
let focusedUuid: string | null = null;
let currentElements: RenderElement[] = [];
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let controllerState = createState();
let cleanupController: (() => void) | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Off-page endpoints for `relationshipScope: "graph"`. Resolving them needs
 * async work (title lookups + one reverse query), but rebuildLayout is sync,
 * so results are cached against a signature of the rendered uuid set and the
 * refresh re-triggers a rebuild when it lands.
 */
interface GhostState {
  signature: string;
  nodes: GhostNode[];
  /** Edges whose source is a ghost — no tree node declares these. */
  incoming: EdgeSpec[];
  overflow: number;
}
let ghostState: GhostState | null = null;
let ghostRefreshInFlight = "";
/**
 * The vocabulary is derived from the graph (tagged properties) plus settings,
 * so it is refreshed when either changes — keyed on a signature of the
 * settings that feed it, and cleared outright on a graph switch.
 */
let registrySignature: string | null = null;
let propertyCatalog: PropertyEntry[] = [];
let isDocked = true; // default to docked mode

/**
 * Logseq persists plugin container layout and silently ignores
 * setMainUIInlineStyle's position/size keys once `data-inited_layout` is set
 * (see libs/src/LSPlugin.core.ts main-ui:style handler). Apply our dock /
 * full-screen styles directly to the container instead — bypasses both the
 * gate and the async Postmate round-trip.
 */
function getPluginContainer(): HTMLElement | null {
  try {
    const id = (logseq as { baseInfo?: { id?: string } }).baseInfo?.id;
    const doc = parent.document;
    const byPid = id
      ? (doc.querySelector(`.lsp-iframe-sandbox-container[data-pid="${id}"]`) as HTMLElement | null)
      : null;
    if (byPid) return byPid;
    return (window.frameElement?.parentElement as HTMLElement | null) ?? null;
  } catch {
    return null;
  }
}

function camelToKebab(k: string): string {
  return k.replace(/([A-Z])/g, "-$1").toLowerCase();
}

function setContainerStyle(style: Partial<CSSStyleDeclaration>): void {
  const el = getPluginContainer();
  if (!el) {
    logseq.setMainUIInlineStyle(style as Record<string, string>);
    return;
  }
  if (el.dataset?.inited_layout) delete el.dataset.inited_layout;
  Object.entries(style).forEach(([k, v]) => {
    el.style.setProperty(camelToKebab(k), String(v), "important");
  });
}

function getCanvasSize(): { w: number; h: number } {
  const rect = canvas!.getBoundingClientRect();
  return { w: rect.width, h: rect.height };
}

function redraw(): void {
  if (!canvas || !ctx) return;
  const { w, h } = getCanvasSize();
  render(ctx, currentElements, controllerState.transform, w, h);
}

/**
 * Compose the flat RenderElement list from the cached layout, current focus,
 * and badges/halo. Cheap — called on every focus change or theme refresh.
 * Caller is responsible for triggering a redraw afterward.
 */
function composeElements(): void {
  if (!currentDisplayTree || !currentLayout) {
    currentElements = currentLayout?.elements ?? [];
    return;
  }
  const settings = getSettings();
  const rects = currentLayout.nodeRectsByUuid;
  const wantOverlay = settings.showRelationships && !!rects;

  // `edgeVisibility` decides the focus regime; edges and labels share it so
  // a label can never outlive the curve it belongs to.
  const focusArg = edgeFocusArg(settings.edgeVisibility, focusedUuid);

  // Edges whose source is off-page: no tree node declares them, so they ride
  // alongside the tree refs rather than inside them.
  const ghostSpecs = settings.relationshipScope === "graph" && ghostState
    ? ghostState.incoming
    : [];

  const overlay = wantOverlay
    ? buildEdgeElements(currentDisplayTree, rects!, focusArg, ghostSpecs)
    : [];
  const labels = wantOverlay && settings.showRelationshipLabels
    ? buildEdgeLabels(currentDisplayTree, rects!, focusArg, ghostSpecs)
    : [];
  const badges = wantOverlay
    ? buildBadges(currentDisplayTree, rects!, ghostSpecs)
    : [];
  const halo = wantOverlay
    ? buildFocusHalo(focusedUuid, rects!)
    : [];

  // Render order (low → high z): halo, layout elements, edges, labels, badges.
  currentElements = [...halo, ...currentLayout.elements, ...overlay, ...labels, ...badges];
}

/** Stable identity for a pruned tree: which blocks it renders, in order. */
function treeSignature(root: TreeNode): string {
  const parts: string[] = [];
  (function walk(n: TreeNode): void {
    if (n.uuid) parts.push(n.uuid);
    for (const c of n.children) walk(c);
  })(root);
  return parts.join("|");
}

/** Every uuid rendered by the tree. */
function treeUuidSet(root: TreeNode): Set<string> {
  const out = new Set<string>();
  (function walk(n: TreeNode): void {
    if (n.uuid) out.add(n.uuid);
    for (const c of n.children) walk(c);
  })(root);
  return out;
}

/**
 * Resolve the off-page endpoints for `relationshipScope: "graph"`: outgoing
 * refs the tree already declares plus incoming refs recovered by one reverse
 * query, capped by connection count, with titles resolved for display.
 *
 * Fires from rebuildLayout and calls it again once resolved. Guarded against
 * overlapping runs so a fast sequence of rebuilds doesn't stack queries.
 */
async function refreshGhosts(pruned: TreeNode, signature: string): Promise<void> {
  if (ghostRefreshInFlight === signature) return;
  ghostRefreshInFlight = signature;

  try {
    const treeUuids = treeUuidSet(pruned);
    const outgoing = collectExternalRefs(pruned);

    const incomingAll = await fetchIncomingRefs([...treeUuids], identToKind());
    // A ref declared by a block already in the tree is not "incoming" — the
    // tree walk found it, and double-counting would inflate its badge.
    const incoming = incomingAll.filter((s) => !treeUuids.has(s.sourceUuid));

    const { uuids, overflow } = selectGhosts(
      [...outgoing, ...incoming],
      treeUuids,
      GHOST_CAP
    );
    const chosen = new Set(uuids);

    const nodes: GhostNode[] = await Promise.all(
      uuids.map(async (uuid) => ({
        uuid,
        title: (await defaultFetcher(uuid))?.trim() || `\u2197 ${uuid.slice(0, 8)}`,
      }))
    );

    ghostState = {
      signature,
      nodes,
      incoming: incoming.filter((s) => chosen.has(s.sourceUuid)),
      overflow,
    };
  } catch {
    ghostState = { signature, nodes: [], incoming: [], overflow: 0 };
  } finally {
    ghostRefreshInFlight = "";
  }

  // Only redraw if this result is still the one the canvas wants.
  if (currentTree) rebuildLayout();
}

/**
 * Recompute the full layout from the current tree, view, and settings, then
 * compose elements and reset the camera. Called when the tree changes, the
 * view changes, or settings change — NOT on focus changes (those use
 * composeElements() to avoid resetting the user's pan/zoom state).
 */
function rebuildLayout(): void {
  if (!currentTree) return;
  const settings = getSettings();
  const pruned = flattenDeep(currentTree, settings.maxDepth, settings.depthMode);

  const graphScope = settings.showRelationships && settings.relationshipScope === "graph";
  const signature = treeSignature(pruned);
  // Depth pruning changes which blocks count as off-page, so the cache is
  // keyed on the pruned tree, not the fetched one.
  if (graphScope && ghostState?.signature !== signature) {
    void refreshGhosts(pruned, signature);
  }
  const ghosts = graphScope && ghostState?.signature === signature ? ghostState : null;

  // Refs to a ghost we chose to draw survive the filter; refs past the cap
  // are still dropped, so we never draw an edge into empty space.
  const allowed = new Set(ghosts?.nodes.map((n) => n.uuid) ?? []);
  const tree = settings.showRelationships ? filterRefsToSet(pruned, allowed) : pruned;
  const view = VIEWS.find((v) => v.id === activeView)!;
  let result = view.layout(tree, settings.maxDepth);

  if (ghosts && ghosts.nodes.length) {
    const gutter = layoutGhosts(ghosts.nodes, result.bounds, ghosts.overflow);
    const rects = new Map(result.nodeRectsByUuid ?? []);
    for (const [uuid, rect] of gutter.rects) rects.set(uuid, rect);
    result = {
      elements: [...result.elements, ...gutter.elements],
      bounds: gutter.bounds,
      nodeRectsByUuid: rects,
    };
  }

  currentDisplayTree = tree;
  currentLayout = result;
  composeElements();

  // Diagnostic: surface ref state once per rebuild so users can debug missing connectors.
  let refCount = 0;
  (function count(n: TreeNode): void {
    refCount += n.refs?.length ?? 0;
    for (const c of n.children) count(c);
  })(tree);
  console.debug(
    `[OutlineCanvas] view=${activeView} focus=${focusedUuid ?? "none"} refs(intra-tree)=${refCount} rects=${result.nodeRectsByUuid?.size ?? 0}`
  );

  const { w, h } = getCanvasSize();
  controllerState.transform = fitToView(result.bounds, w, h);
  redraw();
}

/** Set the focused node and refresh display (no camera reset). */
function setFocus(uuid: string | null): void {
  if (focusedUuid === uuid) return;
  focusedUuid = uuid;
  composeElements();
  redraw();
}

/**
 * Make sure the vocabulary matches the graph and settings before any tree is
 * built — the adapter resolves property keys through the registry, so a stale
 * registry means missing connectors. Cheap when nothing changed: one string
 * comparison.
 */
async function ensureRegistry(): Promise<void> {
  const s = getSettings();
  const signature = [s.markerTag, s.customKinds, s.undirectedKinds].join("\u0000");
  if (registrySignature === signature) return;

  propertyCatalog = await refreshRegistry({
    markerTag: s.markerTag,
    explicit: parseNameList(s.customKinds),
    undirected: parseNameList(s.undirectedKinds),
  });
  registrySignature = signature;
}

async function loadTree(blockUuid?: string): Promise<void> {
  await ensureRegistry();
  const settings = getSettings();
  currentTree = blockUuid
    ? await fetchBlockTree(blockUuid, settings.showEmptyBlocks)
    : await fetchTree(settings.showEmptyBlocks);

  // New tree → previous focus may not exist anymore.
  focusedUuid = null;

  if (currentTree) {
    rebuildLayout();
  }
}

function switchView(viewId: ViewId): void {
  if (viewId === activeView) return;
  activeView = viewId;

  const app = document.getElementById("app");
  if (app) setActiveView(app, viewId);

  const settings = getSettings();
  if (canvas && settings.animateViewSwitch) {
    canvas.classList.add("oc-fading");
    setTimeout(() => {
      rebuildLayout();
      canvas?.classList.remove("oc-fading");
    }, 180);
  } else {
    rebuildLayout();
  }
}

// --- Dock / Full-screen mode ---


function setDockedStyle(widthOverridePx?: number): void {
  // Both modes share the same fixed strip on the right. The difference is
  // host-side: mirror mode reserves this strip in the app layout via
  // injectHostStyles (so the sidebar opens to the left of it); overlay mode
  // doesn't reserve space — the canvas just floats above app content.
  // widthOverridePx is supplied during a live drag; otherwise we use the
  // persisted dockWidth (vw).
  const { dockBehavior, dockWidth } = getSettings();
  const width = widthOverridePx !== undefined ? `${widthOverridePx}px` : `${dockWidth}vw`;
  setContainerStyle({
    position: "fixed",
    zIndex: dockBehavior === "mirror" ? "999" : "11",
    top: "0",
    right: "0",
    left: "auto",
    width,
    height: "100vh",
    borderLeft: "none",
  });
}

async function applyDockMode(): Promise<void> {
  if (isDocked) {
    setDockedStyle();
  } else {
    // Full-screen mode
    setContainerStyle({
      position: "fixed",
      zIndex: "999",
      top: "0",
      left: "0",
      right: "auto",
      width: "100vw",
      height: "100vh",
      borderLeft: "none",
    });
  }
  updateDockButton(isDocked);
  updateFullscreenClass(isDocked);
  setTimeout(() => {
    if (currentTree) rebuildLayout();
  }, 100);
}

/**
 * Inject host-side CSS. The reserve-space rule (margin-right on
 * #app-container-wrapper) and the toggle-button hide are mirror-only —
 * overlay mode leaves the host layout untouched so the sidebar can coexist
 * with the canvas under default Logseq behavior.
 *
 * Re-callable: uses provideStyle's {key,style} form so re-injection replaces
 * the previous rule when dockBehavior changes.
 */
function injectHostStyles(pluginId: string, widthOverridePx?: number): void {
  const { dockBehavior, dockWidth } = getSettings();
  // Mirror mode reserves the canvas's right-edge strip in the host layout, so
  // Logseq's right sidebar opens to the LEFT of the canvas instead of sliding
  // under it. We shrink #app-container-wrapper (the root layout element) by
  // the canvas width via margin-right. The sidebar lives inside that wrapper,
  // so it naturally fits in the remaining space.
  //
  // Also hide the toolbar's "Toggle right sidebar" button so its icon doesn't
  // sit flush against the canvas's left edge — T R keyboard shortcut still
  // toggles the sidebar.
  //
  // widthOverridePx is used during a live resize drag; skip the transition so
  // the host follows the pointer 1:1 rather than animating per frame.
  const width = widthOverridePx !== undefined ? `${widthOverridePx}px` : `${dockWidth}vw`;
  const transition = widthOverridePx !== undefined ? "none" : "margin-right 0.2s ease";
  const hostHas = `body:has(.lsp-iframe-sandbox-container.visible[data-pid="${pluginId}"])`;
  const sidebarHide =
    dockBehavior === "mirror"
      ? `${hostHas} #app-container-wrapper {
           margin-right: ${width} !important;
           transition: ${transition};
         }
         ${hostHas} [title^="Toggle right sidebar"] {
           visibility: hidden !important;
         }`
      : "";

  logseq.provideStyle({
    key: "outline-canvas-host",
    style: `
      .outline-canvas-btn {
        display: flex;
        align-items: center;
      }
      ${sidebarHide}
      .outline-canvas-inline {
        width: 100%;
        padding: 8px 0;
        cursor: pointer;
      }
      .outline-canvas-inline img {
        width: 100%;
        height: auto;
        border-radius: 8px;
        border: 1px solid var(--ls-border-color, #333);
        transition: border-color 0.15s;
      }
      .outline-canvas-inline img:hover {
        border-color: var(--ls-link-ref-text-color, #46a758);
      }
      .outline-canvas-inline .oc-inline-label {
        font-size: 11px;
        color: var(--ls-secondary-text-color, #888);
        margin-top: 4px;
        text-align: center;
      }
    `,
  });
}

function hideCanvas(): void {
  logseq.hideMainUI({ restoreEditingCursor: true });
  // The host CSS rule's :has() condition stops matching once the iframe loses
  // .visible, so the margin-right on #app-container-wrapper is dropped and the
  // app expands back. No sidebar bookkeeping needed.
}

/**
 * Live drag-to-resize on the canvas's left edge. We can't read the parent
 * viewport width directly (cross-origin), so derive it once at drag-start from
 * `iframeWidthPx / (dockWidthVw / 100)`. During the drag we apply pixel
 * widths to both the iframe and the host margin-right; on release we convert
 * the final px back to vw and persist via updateSettings.
 *
 * pointerdown captures the pointer to the handle, and because we keep the
 * iframe's left edge under the cursor as we shrink/grow, the cursor never
 * leaves the iframe — events continue to flow even when dragging across what
 * would otherwise be the parent-frame boundary.
 */
function setupResizeHandle(pluginId: string): void {
  const handle = document.getElementById("oc-resize-handle");
  if (!handle) return;

  let drag: { parentViewportPx: number; currentPx: number } | null = null;

  handle.addEventListener("pointerdown", (e) => {
    if (!isDocked) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    handle.classList.add("oc-dragging");
    const startVw = getSettings().dockWidth;
    const currentPx = window.innerWidth;
    const parentViewportPx = currentPx / (startVw / 100);
    drag = { parentViewportPx, currentPx };
  });

  handle.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const minPx = drag.parentViewportPx * (DOCK_WIDTH_MIN / 100);
    const maxPx = drag.parentViewportPx * (DOCK_WIDTH_MAX / 100);
    const next = Math.max(minPx, Math.min(maxPx, drag.currentPx - e.movementX));
    drag.currentPx = next;
    setDockedStyle(next);
    injectHostStyles(pluginId, next);
  });

  const endDrag = (e: PointerEvent): void => {
    if (!drag) return;
    handle.releasePointerCapture(e.pointerId);
    handle.classList.remove("oc-dragging");
    const finalVw = Math.round((drag.currentPx / drag.parentViewportPx) * 100);
    drag = null;
    // updateSettings triggers onSettingsChanged, which re-injects the host
    // CSS (now in vw, with the transition restored) and re-applies dock mode.
    logseq.updateSettings({ dockWidth: finalVw });
  };
  handle.addEventListener("pointerup", endDrag);
  handle.addEventListener("pointercancel", endDrag);
}

function toggleDockMode(): void {
  isDocked = !isDocked;
  applyDockMode();
}

function setupCanvas(): void {
  canvas = document.getElementById("oc-canvas") as HTMLCanvasElement;
  if (!canvas) return;
  ctx = canvas.getContext("2d");
  if (!ctx) return;

  const resizeObserver = new ResizeObserver(() => {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas!.getBoundingClientRect();
    canvas!.width = rect.width * dpr;
    canvas!.height = rect.height * dpr;
    redraw();
  });
  resizeObserver.observe(canvas);

  controllerState = createState();
  cleanupController = attachHandlers(canvas, controllerState, redraw);

  // Click on a node: focus its relationships AND navigate Logseq to the block.
  // Click on empty canvas: clear focus (edges fade out).
  canvas.addEventListener("click", async (e) => {
    if (controllerState.isDragging) return;
    const rect = canvas!.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const hit = hitTest(currentElements, cx, cy, controllerState.transform);
    if (hit?.uuid) {
      setFocus(hit.uuid);
      const block = await logseq.Editor.getBlock(hit.uuid);
      if (block) {
        const page = await logseq.Editor.getPage((block as Record<string, unknown>).page as number);
        const pageName = (page as Record<string, unknown>)?.originalName as string
          ?? (page as Record<string, unknown>)?.name as string ?? "";
        if (pageName) {
          await logseq.Editor.scrollToBlockInPage(pageName, hit.uuid);
        }
      }
    } else {
      setFocus(null);
    }
  });

  // Treemap breadcrumb hover
  canvas.addEventListener("mousemove", (e) => {
    if (activeView !== "tmap" || !treemapHitBoxes.length) return;
    const bcEl = document.getElementById("oc-breadcrumb");
    if (!bcEl) return;

    const rect = canvas!.getBoundingClientRect();
    const mx = (e.clientX - rect.left - controllerState.transform.ox) / controllerState.transform.scale;
    const my = (e.clientY - rect.top - controllerState.transform.oy) / controllerState.transform.scale;

    let found: (typeof treemapHitBoxes)[0] | null = null;
    for (let i = treemapHitBoxes.length - 1; i >= 0; i--) {
      const h = treemapHitBoxes[i];
      if (mx >= h.x && mx <= h.x + h.w && my >= h.y && my <= h.y + h.h) {
        found = h;
        break;
      }
    }

    if (found) {
      bcEl.textContent = found.path.join(" → ");
      bcEl.classList.add("oc-show");
    } else {
      bcEl.classList.remove("oc-show");
    }
  });

  // Delegated click handler on #app in capture phase. Covers both the
  // toolbar controls (by id) and the view switcher buttons (by class).
  const app = document.getElementById("app");
  app?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement | null)?.closest("button") as HTMLButtonElement | null;
    if (!btn) return;
    if (btn.classList.contains("oc-vb")) {
      const viewId = btn.getAttribute("data-view") as ViewId | null;
      if (viewId) switchView(viewId);
      return;
    }
    switch (btn.id) {
      case "oc-close": hideCanvas(); break;
      case "oc-dock-toggle": toggleDockMode(); break;
      case "oc-zoom-in": {
        const { w, h } = getCanvasSize();
        controllerState.transform = zoomIn(controllerState.transform, w / 2, h / 2);
        redraw();
        break;
      }
      case "oc-zoom-out": {
        const { w, h } = getCanvasSize();
        controllerState.transform = zoomOut(controllerState.transform, w / 2, h / 2);
        redraw();
        break;
      }
      case "oc-fit": rebuildLayout(); break;
      case "oc-export": exportCurrentView(); break;
      case "oc-copy": copyCurrentView(); break;
    }
  }, true);
}

/**
 * Capture the current view as a PNG (WYSIWYG — uses the live transform and
 * canvas dimensions). Includes both `depends_on` and `relates_to` edges
 * regardless of focus / showRelationships. Triggers a browser download.
 */
function exportCurrentView(): void {
  if (!currentDisplayTree || !currentLayout) return;
  const settings = getSettings();
  const { w, h } = getCanvasSize();
  const dataURL = exportCurrentViewAsDataURL(
    currentDisplayTree,
    currentLayout,
    w,
    h,
    controllerState.transform,
    settings.showRelationshipLabels
  );
  if (!dataURL) return;

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const link = document.createElement("a");
  link.download = `outline-canvas-${activeView}-${ts}.png`;
  link.href = dataURL;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

async function copyCurrentView(): Promise<void> {
  if (!currentDisplayTree || !currentLayout) return;
  const settings = getSettings();
  const { w, h } = getCanvasSize();
  const dataURL = exportCurrentViewAsDataURL(
    currentDisplayTree,
    currentLayout,
    w,
    h,
    controllerState.transform,
    settings.showRelationshipLabels
  );
  if (!dataURL) return;

  try {
    const blob = await (await fetch(dataURL)).blob();
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    logseq.UI.showMsg("OutlineCanvas: image copied to clipboard", "success");
  } catch (err) {
    console.error("OutlineCanvas: clipboard write failed", err);
    logseq.UI.showMsg("OutlineCanvas: clipboard copy failed (try export instead)", "warning");
  }
}

function setupUI(): void {
  const app = document.getElementById("app");
  if (!app) return;

  app.innerHTML = buildUI(VIEWS, activeView);
  setupCanvas();
}

// --- Macro Renderer ---

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function main(): Promise<void> {
  const offHooks: Array<() => void> = [];

  // Settings
  registerSettings();
  activeView = getSettings().defaultView;

  // Detect initial theme
  try {
    const configs = await logseq.App.getUserConfigs();
    const mode = configs?.preferredThemeMode === "light" ? "light" : "dark";
    setTheme(mode);
  } catch {
    setTheme("dark");
  }

  // Listen for theme changes
  const offTheme = logseq.App.onThemeModeChanged(({ mode }) => {
    setTheme(mode === "light" ? "light" : "dark");
    applyThemeToUI();
    if (logseq.isMainUIVisible) {
      rebuildLayout();
    }
  });
  if (typeof offTheme === "function") offHooks.push(offTheme);

  // CSS — injected into parent frame. The sidebar-hide rule is gated on
  // dockBehavior, so we re-inject on settings change using the same key.
  const pluginId = (logseq as { baseInfo?: { id?: string } }).baseInfo?.id ?? "";
  injectHostStyles(pluginId);

  // Inject styles into plugin iframe
  const styleEl = document.createElement("style");
  styleEl.textContent = STYLES;
  document.head.appendChild(styleEl);

  // Load Google Font
  const fontLink = document.createElement("link");
  fontLink.href = "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap";
  fontLink.rel = "stylesheet";
  document.head.appendChild(fontLink);

  // Build UI
  setupUI();
  setupResizeHandle(pluginId);
  applyThemeToUI();
  applyPlatformClass();

  // Model for click handlers
  logseq.provideModel({
    async openOutlineCanvas() {
      await applyDockMode();
      logseq.showMainUI({ autoFocus: true });
      await loadTree();
    },
    async openOutlineCanvasForBlock(e: { dataset: Record<string, string> }) {
      const uuid = e.dataset.blockUuid;
      if (uuid) {
        await applyDockMode();
        logseq.showMainUI({ autoFocus: true });
        await loadTree(uuid);
      }
    },
  });

  // Toolbar button
  logseq.App.registerUIItem("toolbar", {
    key: "outline-canvas-btn",
    template: `
      <a class="button outline-canvas-btn" data-on-click="openOutlineCanvas" title="OutlineCanvas — Visual Diagrams">
        <span style="font-size: 18px;">◈</span>
      </a>
    `,
  });

  // Command palette + keyboard shortcut
  logseq.App.registerCommandPalette(
    {
      key: "outline-canvas-open",
      label: "OutlineCanvas: Open diagram view",
      keybinding: {
        mode: "global",
        binding: "mod+shift+o",
      },
    },
    async () => {
      if (logseq.isMainUIVisible) {
        // Toggle dock/full when already open
        toggleDockMode();
      } else {
        await applyDockMode();
        logseq.showMainUI({ autoFocus: true });
        await loadTree();
      }
    }
  );

  // Slash command — opens focused on current block (interactive overlay)
  logseq.Editor.registerSlashCommand("outline", async () => {
    const block = await logseq.Editor.getCurrentBlock();
    await applyDockMode();
    logseq.showMainUI({ autoFocus: true });
    if (block) {
      await loadTree(block.uuid);
    } else {
      await loadTree();
    }
  });

  // Slash command — inserts inline macro renderer
  logseq.Editor.registerSlashCommand("outline-canvas", async () => {
    try {
      await logseq.Editor.insertAtEditingCursor("{{renderer :outline-canvas}}");
    } catch (err) {
      console.error("OutlineCanvas: Failed to insert macro", err);
      await logseq.UI.showMsg("Failed to insert outline-canvas macro", "error");
    }
  });

  // --- Macro renderer: {{renderer :outline-canvas}} ---
  logseq.App.onMacroRendererSlotted(async ({ slot, payload }) => {
    const [type, viewArg] = payload.arguments;
    if (type !== ":outline-canvas") return;

    const blockUuid = payload.uuid;
    const settings = getSettings();
    const viewId: ViewId = (viewArg?.trim() as ViewId) || settings.defaultView;

    try {
      const block = await logseq.Editor.getBlock(blockUuid, { includeChildren: true });
      if (!block || !block.children || block.children.length === 0) {
        logseq.provideUI({
          key: `outline-canvas-${blockUuid}`,
          slot,
          template: `<div class="outline-canvas-inline">
            <div class="oc-inline-label">OutlineCanvas: Add child blocks to visualize</div>
          </div>`,
        });
        return;
      }

      // Build tree from children — strip macro syntax from root label
      const rawContent = (block as Record<string, unknown>).content as string ?? "Outline";
      const rootLabel = rawContent.replace(/\{\{renderer\s[^}]*\}\}/g, "").replace(/\{\{[^}]*\}\}/g, "").trim() || "Outline";
      await ensureRegistry();
      const tree = await buildTree(
        block.children as unknown as LogseqBlock[],
        rootLabel,
        settings.showEmptyBlocks
      );
      const flattened = flattenDeep(tree, settings.maxDepth, settings.depthMode);

      // Render to image
      const dataURL = renderToDataURL(flattened, viewId, settings.maxDepth, 800, 450);

      logseq.provideUI({
        key: `outline-canvas-${blockUuid}`,
        slot,
        template: `<div class="outline-canvas-inline">
          <img src="${dataURL}" alt="OutlineCanvas diagram"
               data-on-click="openOutlineCanvasForBlock"
               data-block-uuid="${blockUuid}" />
          <div class="oc-inline-label">◈ ${escapeHtml(VIEWS.find(v => v.id === viewId)?.label ?? "Tree Chart")} · Click to interact</div>
        </div>`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      logseq.provideUI({
        key: `outline-canvas-${blockUuid}`,
        slot,
        template: `<div class="outline-canvas-inline">
          <div class="oc-inline-label" style="color: var(--ls-error-text-color, #e55);">
            OutlineCanvas error: ${escapeHtml(msg)}
          </div>
        </div>`,
      });
    }
  });

  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hideCanvas();
    }
  });

  // Property idents are per-graph (they carry a graph-local suffix), so the
  // cache must not survive a graph switch.
  logseq.App.onCurrentGraphChanged(() => {
    registrySignature = null;
    propertyCatalog = [];
    ghostState = null;
  });

  // Live updates via DB.onChanged (debounced)
  const offChanged = logseq.DB.onChanged(() => {
    if (!logseq.isMainUIVisible) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      // A change may have tagged a property, which changes the vocabulary
      // without changing any setting — so re-derive rather than trust the
      // signature.
      registrySignature = null;
      loadTree();
    }, 500);
  });
  if (typeof offChanged === "function") offHooks.push(offChanged);

  // Settings change — re-inject host CSS + re-apply dock geometry when either
  // the dock behavior or the dock width changes (drag end persists dockWidth,
  // which lands here).
  let prevDockBehavior = getSettings().dockBehavior;
  let prevDockWidth = getSettings().dockWidth;
  logseq.onSettingsChanged(() => {
    const { dockBehavior: nextBehavior, dockWidth: nextWidth } = getSettings();
    if (nextBehavior !== prevDockBehavior || nextWidth !== prevDockWidth) {
      prevDockBehavior = nextBehavior;
      prevDockWidth = nextWidth;
      injectHostStyles(pluginId);
      if (logseq.isMainUIVisible && isDocked) {
        applyDockMode();
      }
    }
    if (!logseq.isMainUIVisible) return;

    // Vocabulary settings change what the adapter matches, so the tree has to
    // be rebuilt from source — a re-layout of the existing tree would keep the
    // old refs.
    const s = getSettings();
    const nextKindSig = [s.markerTag, s.customKinds, s.undirectedKinds].join("\u0000");
    if (nextKindSig !== registrySignature) {
      loadTree();
    } else {
      rebuildLayout();
    }
  });

  // Cleanup
  logseq.beforeunload(async () => {
    cleanupController?.();
    offHooks.forEach((off) => off());
    offHooks.length = 0;
    if (debounceTimer) clearTimeout(debounceTimer);
  });

}

logseq.ready(main).catch(console.error);
