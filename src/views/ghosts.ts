import type { EdgeSpec, RenderElement, Rect } from "../types";
import { theme, MUTED, LEAF_TEXT } from "../colors";
import { measureBoxHeight, adaptiveWidth, type MeasureFn } from "../text";

/** An off-page endpoint rendered in the gutter. */
export interface GhostNode {
  uuid: string;
  title: string;
}

/** Default ceiling on how many ghosts get drawn. */
export const GHOST_CAP = 12;

const GHOST_W = 150;
const GHOST_MIN_H = 34;
const GHOST_GAP = 12;
const GUTTER_GAP = 90;
const FONT_SIZE = 11;
const FONT_WEIGHT = 400;
const CHIP_H = 20;

/**
 * Choose which off-page endpoints to draw, most-connected first.
 *
 * An "external endpoint" is whichever side of a spec is not a tree node —
 * the target for an outgoing ref, the source for an incoming one. Counting
 * is per edge, so a block that is both the source of one edge and the target
 * of another counts twice and sorts higher, which is what we want: the
 * busiest off-page blocks are the ones worth the gutter space.
 *
 * Ties resolve by first appearance so the gutter is stable across renders.
 * Anything past `cap` is reported as `overflow` rather than dropped quietly.
 */
export function selectGhosts(
  specs: EdgeSpec[],
  treeUuids: Set<string>,
  cap: number = GHOST_CAP
): { uuids: string[]; overflow: number } {
  const counts = new Map<string, number>();

  for (const spec of specs) {
    for (const uuid of [spec.sourceUuid, spec.targetUuid]) {
      if (!treeUuids.has(uuid)) {
        counts.set(uuid, (counts.get(uuid) ?? 0) + 1);
      }
    }
  }

  // Map preserves insertion order, so an index lookup gives us a stable
  // tie-break without stamping a counter onto every entry.
  const order = [...counts.keys()];
  const ranked = order
    .slice()
    .sort((a, b) => (counts.get(b)! - counts.get(a)!) || (order.indexOf(a) - order.indexOf(b)));

  return {
    uuids: ranked.slice(0, cap),
    overflow: Math.max(0, ranked.length - cap),
  };
}

/**
 * Lay ghosts out in a column to the right of the diagram and hand back their
 * rects so the edge builder can connect to them like any other node.
 *
 * This runs *after* the view's own layout, which is why no view engine needs
 * to know ghosts exist: edges, labels, and badges all read
 * `LayoutResult.nodeRectsByUuid`, so an off-page endpoint needs a rect, not a
 * layout algorithm.
 */
export function layoutGhosts(
  ghosts: GhostNode[],
  bounds: { x: number; y: number; w: number; h: number },
  overflow: number,
  measure?: MeasureFn
): {
  elements: RenderElement[];
  rects: Map<string, Rect>;
  bounds: { x: number; y: number; w: number; h: number };
} {
  const rects = new Map<string, Rect>();
  if (ghosts.length === 0) {
    return { elements: [], rects, bounds };
  }

  const t = theme();
  const elements: RenderElement[] = [];
  const x = bounds.x + bounds.w + GUTTER_GAP;
  let y = bounds.y;

  for (const ghost of ghosts) {
    const w = adaptiveWidth(ghost.title, GHOST_W, FONT_SIZE, FONT_WEIGHT, undefined, measure);
    const h = measureBoxHeight(ghost.title, w, FONT_SIZE, FONT_WEIGHT, GHOST_MIN_H, measure);

    elements.push({
      type: "box",
      x, y, w, h,
      fill: t.tableStripe,
      stroke: t.muted,
      lw: 1,
      rad: 8,
      // Dashed outline: a ghost lives outside the hierarchy and must never
      // read as one of its nodes.
      dash: [4, 3],
      text: ghost.title,
      textColor: LEAF_TEXT(),
      textSize: FONT_SIZE,
      textWeight: FONT_WEIGHT,
      uuid: ghost.uuid,
    });
    rects.set(ghost.uuid, { x, y, w, h });
    y += h + GHOST_GAP;
  }

  if (overflow > 0) {
    elements.push({
      type: "text",
      text: `+${overflow} more off-page`,
      x: x + GHOST_W / 2,
      y: y + CHIP_H / 2,
      color: MUTED(),
      size: 10,
      weight: 500,
      align: "center",
      baseline: "middle",
    });
    y += CHIP_H;
  }

  const right = Math.max(
    bounds.x + bounds.w,
    ...[...rects.values()].map((r) => r.x + r.w)
  );
  const bottom = Math.max(bounds.y + bounds.h, y);

  return {
    elements,
    rects,
    bounds: {
      x: bounds.x,
      y: bounds.y,
      w: right - bounds.x,
      h: bottom - bounds.y,
    },
  };
}
