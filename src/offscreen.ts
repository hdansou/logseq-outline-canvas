import type { TreeNode, ViewId, RenderElement, LayoutResult, Transform } from "./types";
import { render } from "./renderer";
import { fitToView } from "./controller";
import { filterIntraTreeRefs } from "./adapter";
import { buildBadges } from "./views/badges";
import { buildEdgeElements, buildEdgeLabels } from "./views/edges";
import { layoutTreeChart } from "./views/tree-chart";
import { layoutTreeTable } from "./views/tree-table";
import { layoutRoadmapAlt, layoutRoadmapLinear } from "./views/roadmap";
import { layoutMindMap } from "./views/mind-map";
import { layoutRightTree } from "./views/right-tree";
import { layoutFishbone } from "./views/fishbone";
import { layoutTreemap } from "./views/treemap";

const VIEW_LAYOUTS: Record<ViewId, (root: TreeNode, maxDepth: number) => LayoutResult> = {
  tree: layoutTreeChart,
  table: layoutTreeTable,
  roadmap_alt: layoutRoadmapAlt,
  roadmap: layoutRoadmapLinear,
  mind: layoutMindMap,
  rtree: layoutRightTree,
  fish: layoutFishbone,
  tmap: layoutTreemap,
};

/**
 * Render a flat element list to an off-screen canvas and return a PNG data URL.
 * Shared primitive for both the static macro renderer and the live export path.
 */
function renderElementsToDataURL(
  elements: RenderElement[],
  transform: Transform,
  width: number,
  height: number
): string {
  const canvas = document.createElement("canvas");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  render(ctx, elements, transform, width, height);
  return canvas.toDataURL("image/png");
}

/**
 * Render a tree to an off-screen canvas and return a PNG data URL.
 * Used for inline macro rendering where we can't embed an interactive canvas.
 */
export function renderToDataURL(
  tree: TreeNode,
  viewId: ViewId,
  maxDepth: number,
  width: number = 800,
  height: number = 500
): string {
  const layoutFn = VIEW_LAYOUTS[viewId] ?? layoutTreeChart;
  const filtered = filterIntraTreeRefs(tree);
  const result = layoutFn(filtered, maxDepth);
  // Static PNG: surface relationships via badges (counts) only — no edges
  // drawn. Clicking the inline image opens the interactive view where the
  // user can focus a node to see its edges.
  const badges = result.nodeRectsByUuid
    ? buildBadges(filtered, result.nodeRectsByUuid)
    : [];
  const elements: RenderElement[] = [...result.elements, ...badges];
  const transform = fitToView(result.bounds, width, height, 30);
  return renderElementsToDataURL(elements, transform, width, height);
}

/**
 * Export the live canvas view to a PNG data URL.
 *
 * WYSIWYG: reuses the live layout, transform (current pan/zoom), and canvas
 * dimensions — what you see is what you get. All edges are drawn, whatever
 * their relationship kind, regardless of focus state or the
 * `showRelationships` setting. Labels are included only when `showLabels`
 * is true (mirrors the live `showRelationshipLabels` setting). Badges and
 * focus halo are NOT included — exporters typically want the graph itself,
 * not transient interaction chrome.
 */
export function exportCurrentViewAsDataURL(
  displayTree: TreeNode,
  layout: LayoutResult,
  width: number,
  height: number,
  transform: Transform,
  showLabels: boolean = false
): string {
  const edges = layout.nodeRectsByUuid
    ? buildEdgeElements(displayTree, layout.nodeRectsByUuid)
    : [];
  const labels = showLabels && layout.nodeRectsByUuid
    ? buildEdgeLabels(displayTree, layout.nodeRectsByUuid)
    : [];
  const elements: RenderElement[] = [...layout.elements, ...edges, ...labels];
  return renderElementsToDataURL(elements, transform, width, height);
}
