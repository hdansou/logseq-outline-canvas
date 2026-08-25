import type { EdgeVisibility } from "../settings";

/**
 * Translate the `edgeVisibility` setting into the focus argument that
 * `buildEdgeElements` / `buildEdgeLabels` already understand:
 *
 * - a uuid (or null) → lazy: only edges touching that node
 * - `undefined`      → emit every edge (what the PNG exporter passes)
 * - `null`           → emit nothing
 *
 * Keeping the mapping here means the render path stays regime-agnostic: it
 * asks for a focus argument and draws whatever comes back.
 */
export function edgeFocusArg(
  mode: EdgeVisibility,
  focusedUuid: string | null
): string | null | undefined {
  switch (mode) {
    case "always":
      return undefined;
    case "off":
      return null;
    case "lazy":
    default:
      return focusedUuid;
  }
}
