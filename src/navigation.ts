/**
 * When the canvas should follow the user to another page.
 *
 * Split out from the plugin wiring so the decision is testable: the failure
 * modes here are all about *not* reloading (pinned canvases, in-page anchors,
 * non-page routes), and each one throws away pan, zoom, and focus if it is
 * wrong.
 */
export interface RouteState {
  /** Canvas currently on screen. Nothing to do when it isn't. */
  visible: boolean;
  /** Set when the canvas was opened on a specific block rather than a page. */
  pinnedBlockUuid: string | null;
  /** Page the route now resolves to; null for non-page routes. */
  nextPageKey: string | null;
  /** Page the canvas last rendered. */
  lastPageKey: string | null;
}

export function shouldReloadForRoute(state: RouteState): boolean {
  if (!state.visible) return false;
  // A block-scoped canvas is scoped to that block, not to wherever the user
  // navigates next.
  if (state.pinnedBlockUuid) return false;
  // Non-page routes (search, settings, all-pages) resolve to nothing. Keeping
  // the current diagram beats blanking the canvas.
  if (!state.nextPageKey) return false;
  // Logseq fires route events for in-page anchors as well, and a reload would
  // discard the user's pan, zoom, and focused node for no change in content.
  return state.nextPageKey !== state.lastPageKey;
}
