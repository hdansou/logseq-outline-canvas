import type { TreeNode, RenderElement, Rect, RelKind, CurveElement, EdgeSpec } from "../types";
import { theme } from "../colors";
import { REL_STYLES } from "../relations";

interface Edge {
  x1: number; y1: number;
  cx1: number; cy1: number;
  cx2: number; cy2: number;
  x2: number; y2: number;
}

/**
 * Compute a bezier path between two rects. When the rects overlap horizontally
 * (vertically-stacked column case), anchor on the same right faces and arc
 * outward to the right so the curve goes *around* intermediate boxes rather
 * than slicing through them. Otherwise anchor on facing edges and use a
 * gentle bezier (same visual language as tree-branch connectors).
 */
function pickEdgeGeometry(s: Rect, t: Rect): Edge {
  const sCx = s.x + s.w / 2;
  const sCy = s.y + s.h / 2;
  const tCx = t.x + t.w / 2;
  const tCy = t.y + t.h / 2;
  const dx = tCx - sCx;
  const dy = tCy - sCy;

  // Horizontal overlap: source and target share x-range. A straight line
  // between facing edges would strike through obstacles in the column.
  const overlap = !(s.x + s.w < t.x || t.x + t.w < s.x);

  if (overlap && Math.abs(dy) > 8) {
    // Stacked: same-side anchors (both right), bulge outward to the right.
    const fromX = s.x + s.w;
    const fromY = sCy;
    const toX = t.x + t.w;
    const toY = tCy;
    const bulge = Math.max(50, Math.abs(dy) * 0.45);
    return {
      x1: fromX, y1: fromY,
      cx1: fromX + bulge, cy1: fromY,
      cx2: toX + bulge, cy2: toY,
      x2: toX, y2: toY,
    };
  }

  if (Math.abs(dx) >= Math.abs(dy)) {
    // Horizontal-dominant: anchor on facing left/right faces, mid-x control points.
    const fromX = dx >= 0 ? s.x + s.w : s.x;
    const fromY = sCy;
    const toX = dx >= 0 ? t.x : t.x + t.w;
    const toY = tCy;
    const midX = (fromX + toX) / 2;
    return {
      x1: fromX, y1: fromY,
      cx1: midX, cy1: fromY,
      cx2: midX, cy2: toY,
      x2: toX, y2: toY,
    };
  }

  // Vertical-dominant (no x-overlap): anchor on top/bottom faces, mid-y controls.
  const fromX = sCx;
  const fromY = dy >= 0 ? s.y + s.h : s.y;
  const toX = tCx;
  const toY = dy >= 0 ? t.y : t.y + t.h;
  const midY = (fromY + toY) / 2;
  return {
    x1: fromX, y1: fromY,
    cx1: fromX, cy1: midY,
    cx2: toX, cy2: midY,
    x2: toX, y2: toY,
  };
}

/** Point at t=0.5 on a cubic bezier — the perceptual midpoint of the curve. */
function bezierMidpoint(g: Edge): { x: number; y: number } {
  return {
    x: 0.125 * g.x1 + 0.375 * g.cx1 + 0.375 * g.cx2 + 0.125 * g.x2,
    y: 0.125 * g.y1 + 0.375 * g.cy1 + 0.375 * g.cy2 + 0.125 * g.y2,
  };
}

const LABEL_FONT_SIZE = 10;
const LABEL_H = 16;
const LABEL_PAD_X = 7;
const LABEL_CHAR_W = LABEL_FONT_SIZE * 0.62; // IBM Plex Mono approx

function makeEdge(s: Rect, t: Rect, kind: RelKind): CurveElement {
  const style = REL_STYLES[kind];
  return {
    type: "curve",
    ...pickEdgeGeometry(s, t),
    color: theme().rel[kind],
    lw: style.lw,
    ...(style.dash ? { dash: style.dash } : {}),
    ...(style.arrowEnd ? { arrowEnd: true } : {}),
  };
}

/** Flatten every relationship declared on a tree node into an EdgeSpec. */
function collectSpecs(root: TreeNode): EdgeSpec[] {
  const out: EdgeSpec[] = [];
  (function walk(node: TreeNode): void {
    if (node.uuid && node.refs) {
      for (const ref of node.refs) {
        out.push({ sourceUuid: node.uuid, kind: ref.kind, targetUuid: ref.targetUuid });
      }
    }
    for (const child of node.children) walk(child);
  })(root);
  return out;
}

/**
 * Resolve the specs that should actually be drawn: both endpoints must have
 * a rect, and the focus regime must admit them.
 *
 * `focusedUuid` semantics (shared by every consumer):
 * - a uuid → only edges touching that node ("lazy edges")
 * - `undefined` → every edge (eager / preview / PNG export)
 * - `null` → nothing
 */
function visibleSpecs(
  specs: EdgeSpec[],
  rectsByUuid: Map<string, Rect>,
  focusedUuid?: string | null
): { spec: EdgeSpec; source: Rect; target: Rect }[] {
  if (focusedUuid === null) return [];
  const out: { spec: EdgeSpec; source: Rect; target: Rect }[] = [];

  for (const spec of specs) {
    if (
      focusedUuid !== undefined &&
      spec.sourceUuid !== focusedUuid &&
      spec.targetUuid !== focusedUuid
    ) {
      continue;
    }
    const source = rectsByUuid.get(spec.sourceUuid);
    const target = rectsByUuid.get(spec.targetUuid);
    if (!source || !target) continue;
    out.push({ spec, source, target });
  }

  return out;
}

/**
 * Build connector overlay elements for every relationship whose source and
 * target both have rects. Caller is expected to have already filtered tree
 * refs (via `filterRefsToSet`) so a missing rect is a defensive skip, not the
 * normal path.
 *
 * `extraSpecs` carries edges whose source is not a tree node — ghost
 * endpoints under `relationshipScope: "graph"`. They are styled and focused
 * exactly like tree refs.
 *
 * See `visibleSpecs` for the `focusedUuid` regime.
 */
export function buildEdgeElements(
  root: TreeNode,
  rectsByUuid: Map<string, Rect>,
  focusedUuid?: string | null,
  extraSpecs: EdgeSpec[] = []
): RenderElement[] {
  return visibleSpecs(
    [...collectSpecs(root), ...extraSpecs],
    rectsByUuid,
    focusedUuid
  ).map(({ spec, source, target }) => makeEdge(source, target, spec.kind));
}

/**
 * Render property-name labels at the midpoint of every visible relationship
 * edge. Each label is a pill (solid bg-colored background so it occludes
 * crossing connectors) with the property name in muted text. Follows the
 * same focus regime as buildEdgeElements, so a label never outlives its edge.
 */
export function buildEdgeLabels(
  root: TreeNode,
  rectsByUuid: Map<string, Rect>,
  focusedUuid?: string | null,
  extraSpecs: EdgeSpec[] = []
): RenderElement[] {
  const els: RenderElement[] = [];
  const t_ = theme();

  for (const { spec, source, target } of visibleSpecs(
    [...collectSpecs(root), ...extraSpecs],
    rectsByUuid,
    focusedUuid
  )) {
    const mid = bezierMidpoint(pickEdgeGeometry(source, target));
    const label = spec.kind;
    const w = label.length * LABEL_CHAR_W + LABEL_PAD_X * 2;

    // Solid bg-colored pill to occlude crossing curves for readability.
    els.push({
      type: "box",
      x: mid.x - w / 2,
      y: mid.y - LABEL_H / 2,
      w, h: LABEL_H,
      fill: t_.bg,
      stroke: t_.rel[spec.kind],
      lw: 1,
      rad: LABEL_H / 2,
    });
    els.push({
      type: "text",
      text: label,
      x: mid.x,
      y: mid.y,
      color: t_.muted,
      size: LABEL_FONT_SIZE,
      weight: 500,
      align: "center",
      baseline: "middle",
    });
  }

  return els;
}
