import { describe, it, expect } from "vitest";
import type { EdgeSpec, Rect } from "../types";
import { selectGhosts, layoutGhosts, GHOST_CAP } from "./ghosts";

// Same dependency-injection trick text.test.ts uses: no canvas in node env.
const measure = (text: string, fontSize: number): number => text.length * fontSize * 0.6;

const spec = (sourceUuid: string, targetUuid: string): EdgeSpec => ({
  sourceUuid, targetUuid, kind: "supports",
});

describe("selectGhosts", () => {
  const tree = new Set(["T1", "T2"]);

  it("picks the endpoint that is not in the tree", () => {
    const out = selectGhosts([spec("T1", "OUT"), spec("IN", "T2")], tree, 10);
    expect(out.uuids.sort()).toEqual(["IN", "OUT"]);
    expect(out.overflow).toBe(0);
  });

  it("ignores specs where both endpoints are in the tree", () => {
    expect(selectGhosts([spec("T1", "T2")], tree, 10).uuids).toEqual([]);
  });

  it("orders by connection count, most connected first", () => {
    const specs = [spec("T1", "LOW"), spec("T1", "HIGH"), spec("T2", "HIGH")];
    expect(selectGhosts(specs, tree, 10).uuids).toEqual(["HIGH", "LOW"]);
  });

  it("caps the list and reports the overflow rather than truncating silently", () => {
    const specs = [spec("T1", "A"), spec("T1", "B"), spec("T1", "C")];
    const out = selectGhosts(specs, tree, 2);
    expect(out.uuids).toHaveLength(2);
    expect(out.overflow).toBe(1);
  });

  it("is deterministic for equal counts (first appearance wins)", () => {
    const specs = [spec("T1", "B"), spec("T1", "A")];
    expect(selectGhosts(specs, tree, 10).uuids).toEqual(["B", "A"]);
  });

  it("counts an endpoint once per edge, not once per direction", () => {
    const specs = [spec("T1", "X"), spec("X", "T2")];
    const out = selectGhosts(specs, tree, 10);
    expect(out.uuids).toEqual(["X"]);
  });

  it("exposes a sane default cap", () => {
    expect(GHOST_CAP).toBeGreaterThan(0);
  });
});

describe("layoutGhosts", () => {
  const bounds = { x: 0, y: 0, w: 500, h: 300 };

  it("returns nothing for an empty ghost list", () => {
    const out = layoutGhosts([], bounds, 0, measure);
    expect(out.elements).toEqual([]);
    expect(out.rects.size).toBe(0);
    expect(out.bounds).toEqual(bounds);
  });

  it("places ghosts in a gutter to the right of the layout", () => {
    const out = layoutGhosts([{ uuid: "G1", title: "Off-page block" }], bounds, 0, measure);
    const rect = out.rects.get("G1") as Rect;
    expect(rect.x).toBeGreaterThanOrEqual(bounds.x + bounds.w);
  });

  it("stacks multiple ghosts without overlapping", () => {
    const out = layoutGhosts(
      [{ uuid: "G1", title: "One" }, { uuid: "G2", title: "Two" }],
      bounds,
      0,
      measure
    );
    const a = out.rects.get("G1") as Rect;
    const b = out.rects.get("G2") as Rect;
    expect(b.y).toBeGreaterThanOrEqual(a.y + a.h);
  });

  it("extends bounds to cover the gutter", () => {
    const out = layoutGhosts([{ uuid: "G1", title: "One" }], bounds, 0, measure);
    const rect = out.rects.get("G1") as Rect;
    expect(out.bounds.x + out.bounds.w).toBeGreaterThanOrEqual(rect.x + rect.w);
  });

  it("carries the uuid on the box so click-to-navigate works", () => {
    const out = layoutGhosts([{ uuid: "G1", title: "One" }], bounds, 0, measure);
    const box = out.elements.find((e) => e.type === "box" && e.uuid === "G1");
    expect(box).toBeDefined();
  });

  it("renders ghosts dashed so they never read as tree nodes", () => {
    const out = layoutGhosts([{ uuid: "G1", title: "One" }], bounds, 0, measure);
    const box = out.elements.find(
      (e): e is Extract<typeof e, { type: "box" }> => e.type === "box" && e.uuid === "G1"
    );
    expect(box?.dash?.length).toBeGreaterThan(0);
  });

  it("adds a +N more chip when ghosts were capped", () => {
    const out = layoutGhosts([{ uuid: "G1", title: "One" }], bounds, 4, measure);
    const texts = out.elements.filter((e) => e.type === "text").map((e) => (e as { text: string }).text);
    expect(texts.some((t) => t.includes("4"))).toBe(true);
  });

  it("adds no chip when nothing overflowed", () => {
    const out = layoutGhosts([{ uuid: "G1", title: "One" }], bounds, 0, measure);
    const texts = out.elements.filter((e) => e.type === "text").map((e) => (e as { text: string }).text);
    expect(texts.some((t) => t.includes("more"))).toBe(false);
  });
});
