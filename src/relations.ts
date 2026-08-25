import type { RelKind } from "./types";

/** Line styling for one relationship kind. Colors live in the theme (`Theme.rel`). */
export interface RelStyle {
  /** Line width in canvas units */
  lw: number;
  /** Dash pattern; omitted = solid */
  dash?: number[];
  /** Arrowhead at the target end — directed relations only */
  arrowEnd?: boolean;
}

/**
 * Registry of every supported relationship kind. Adding a kind means adding it
 * to `RelKind` (types.ts), here, and to the `rel` color map in both themes —
 * the `Record<RelKind, …>` types make all three exhaustive at compile time.
 *
 * Dash patterns are unique per kind so the overlay stays readable for
 * colorblind users and in grayscale prints — same principle as the branch
 * palette in colors.ts.
 */
export const REL_STYLES: Record<RelKind, RelStyle> = {
  // Symmetric association — the only undirected kind, hence no arrowhead.
  relates_to: { lw: 1.3, dash: [6, 4] },
  // Directional dependency: A needs B.
  depends_on: { lw: 1.6, arrowEnd: true },
  // Evidential: A backs up B.
  supports: { lw: 1.5, dash: [10, 3], arrowEnd: true },
  // Evidential negative: A argues against B.
  contradicts: { lw: 1.5, dash: [3, 3], arrowEnd: true },
  // Composition across the hierarchy: A is a component of B.
  part_of: { lw: 1.4, dash: [9, 3, 2, 3], arrowEnd: true },
};

/** Every supported kind, in declaration order. */
export const REL_KINDS = Object.keys(REL_STYLES) as RelKind[];

/**
 * Property idents recognised by the adapter, as a regex alternation group.
 * Sorted longest-first so a kind can never be shadowed by another kind that
 * is its prefix (e.g. a future `part` alongside `part_of`).
 */
export const REL_KIND_ALTERNATION = [...REL_KINDS]
  .sort((a, b) => b.length - a.length)
  .join("|");
