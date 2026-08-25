import type { TreeNode, RenderElement, Rect, EdgeSpec } from "../types";
import { theme } from "../colors";

const BADGE_H = 16;
const BADGE_PAD_X = 5;
const BADGE_FONT_SIZE = 10;
// Approximate char width in IBM Plex Mono at 10px (mono so fairly stable).
const CHAR_W = BADGE_FONT_SIZE * 0.62;

interface EdgeIndex {
  outgoing: Map<string, number>;
  incoming: Map<string, number>;
}

/**
 * Count outgoing refs by node, and incoming refs by target node. Walks once.
 * `extraSpecs` folds in edges that no tree node declares — ghost sources
 * under `relationshipScope: "graph"` — so a node's badge reflects every
 * relationship touching it, not just the ones its own block spells out.
 */
function buildIndex(root: TreeNode, extraSpecs: EdgeSpec[]): EdgeIndex {
  const outgoing = new Map<string, number>();
  const incoming = new Map<string, number>();
  const bump = (m: Map<string, number>, key: string): void => {
    m.set(key, (m.get(key) ?? 0) + 1);
  };

  (function walk(n: TreeNode): void {
    if (n.uuid && n.refs && n.refs.length) {
      outgoing.set(n.uuid, (outgoing.get(n.uuid) ?? 0) + n.refs.length);
      for (const r of n.refs) bump(incoming, r.targetUuid);
    }
    for (const c of n.children) walk(c);
  })(root);

  for (const spec of extraSpecs) {
    bump(outgoing, spec.sourceUuid);
    bump(incoming, spec.targetUuid);
  }

  return { outgoing, incoming };
}

type Corner = "top-right" | "bottom-right";

function makeBadge(rect: Rect, text: string, corner: Corner, fill: string, fg: string): RenderElement[] {
  const badgeW = Math.max(BADGE_H, text.length * CHAR_W + BADGE_PAD_X * 2);
  // Slight overhang outside the node rect so the badge "lifts off" the corner.
  const x = rect.x + rect.w - badgeW + 4;
  const y = corner === "top-right"
    ? rect.y - BADGE_H / 2
    : rect.y + rect.h - BADGE_H / 2;

  return [
    {
      type: "box",
      x, y, w: badgeW, h: BADGE_H,
      fill, stroke: "", lw: 0, rad: BADGE_H / 2,
      // uuid intentionally omitted so hitTest skips badges
    },
    {
      type: "text",
      text,
      x: x + badgeW / 2,
      y: y + BADGE_H / 2,
      color: fg,
      size: BADGE_FONT_SIZE,
      weight: 600,
      align: "center",
      baseline: "middle",
    },
  ];
}

/**
 * Render outgoing / incoming count badges in the corners of each node that
 * has refs touching it. Badges are informational only — they're not hit-test
 * targets and they don't carry uuids, so node click-to-navigate still works
 * through the body of the box behind them.
 */
export function buildBadges(
  root: TreeNode,
  rects: Map<string, Rect>,
  extraSpecs: EdgeSpec[] = []
): RenderElement[] {
  const els: RenderElement[] = [];
  const { outgoing, incoming } = buildIndex(root, extraSpecs);
  const t = theme();

  for (const [uuid, rect] of rects) {
    const out = outgoing.get(uuid) ?? 0;
    const inc = incoming.get(uuid) ?? 0;
    if (out > 0) {
      els.push(...makeBadge(rect, `→${out}`, "top-right", t.badgeOut, t.bg));
    }
    if (inc > 0) {
      els.push(...makeBadge(rect, `←${inc}`, "bottom-right", t.badgeIn, t.bg));
    }
  }

  return els;
}

/**
 * Build a "halo" outline behind the focused node so the user can clearly see
 * which node's relationships are currently surfaced. Returned elements should
 * be drawn BEFORE the layout elements (lower z-order).
 */
export function buildFocusHalo(focusedUuid: string | null, rects: Map<string, Rect>): RenderElement[] {
  if (!focusedUuid) return [];
  const rect = rects.get(focusedUuid);
  if (!rect) return [];
  const t = theme();
  const m = 6;
  return [{
    type: "box",
    x: rect.x - m, y: rect.y - m,
    w: rect.w + m * 2, h: rect.h + m * 2,
    fill: t.accentDim,
    stroke: t.accent,
    lw: 2,
    rad: 12,
  }];
}
