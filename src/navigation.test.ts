import { describe, it, expect } from "vitest";
import { shouldReloadForRoute } from "./navigation";

const base = { visible: true, pinnedBlockUuid: null, nextPageKey: "page-b", lastPageKey: "page-a" };

describe("shouldReloadForRoute", () => {
  it("reloads when the visible canvas moves to a different page", () => {
    expect(shouldReloadForRoute(base)).toBe(true);
  });

  it("does nothing while the canvas is hidden", () => {
    expect(shouldReloadForRoute({ ...base, visible: false })).toBe(false);
  });

  it("stays put when the canvas is pinned to a block", () => {
    // A canvas opened on a specific block is scoped to that block, not to
    // whatever page the user wanders to next.
    expect(shouldReloadForRoute({ ...base, pinnedBlockUuid: "block-1" })).toBe(false);
  });

  it("ignores a route change that resolves to the same page", () => {
    // Logseq fires route events for in-page anchors too; reloading would
    // throw away the user's pan, zoom, and focused node for nothing.
    expect(shouldReloadForRoute({ ...base, nextPageKey: "page-a" })).toBe(false);
  });

  it("reloads on first navigation when no page has been recorded yet", () => {
    expect(shouldReloadForRoute({ ...base, lastPageKey: null })).toBe(true);
  });

  it("does not reload when the next page cannot be resolved", () => {
    // Route changes to non-page views (search, settings) resolve to nothing;
    // keeping the current diagram beats blanking the canvas.
    expect(shouldReloadForRoute({ ...base, nextPageKey: null })).toBe(false);
  });
});
