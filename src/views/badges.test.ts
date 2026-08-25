import { describe, it, expect } from "vitest";
import type { TreeNode, Rect, TextElement } from "../types";
import { buildBadges, buildFocusHalo } from "./badges";

const node = (uuid: string, children: TreeNode[] = [], refs?: TreeNode["refs"]): TreeNode => ({
  name: uuid, uuid, depth: 0, id: 0, children, refs,
});

const textOf = (els: ReturnType<typeof buildBadges>): TextElement[] =>
  els.filter((e): e is TextElement => e.type === "text");

describe("buildBadges", () => {
  it("emits nothing when no node has refs", () => {
    const tree = node("A", [node("B")]);
    const rects = new Map<string, Rect>([
      ["A", { x: 0, y: 0, w: 100, h: 40 }],
      ["B", { x: 200, y: 0, w: 100, h: 40 }],
    ]);
    expect(buildBadges(tree, rects)).toEqual([]);
  });

  it("emits an outgoing-count badge on the source node", () => {
    const tree = node("A", [], [
      { kind: "depends_on", targetUuid: "B" },
      { kind: "relates_to", targetUuid: "C" },
    ]);
    const rects = new Map<string, Rect>([
      ["A", { x: 0, y: 0, w: 100, h: 40 }],
      ["B", { x: 200, y: 0, w: 100, h: 40 }],
      ["C", { x: 0, y: 200, w: 100, h: 40 }],
    ]);
    const labels = textOf(buildBadges(tree, rects)).map((t) => t.text);
    expect(labels).toContain("→2");
  });

  it("emits an incoming-count badge on the target node", () => {
    const tree = node("A", [
      node("X", [], [{ kind: "depends_on", targetUuid: "B" }]),
      node("Y", [], [{ kind: "relates_to", targetUuid: "B" }]),
      node("B"),
    ]);
    const rects = new Map<string, Rect>([
      ["A", { x: 0, y: 0, w: 100, h: 40 }],
      ["X", { x: 200, y: 0, w: 100, h: 40 }],
      ["Y", { x: 200, y: 60, w: 100, h: 40 }],
      ["B", { x: 400, y: 0, w: 100, h: 40 }],
    ]);
    const labels = textOf(buildBadges(tree, rects)).map((t) => t.text);
    expect(labels).toContain("←2");
  });

  it("emits both badges on a node that's both source and target", () => {
    const tree = node("A", [
      node("X", [], [{ kind: "depends_on", targetUuid: "B" }]),
      node("B", [], [{ kind: "relates_to", targetUuid: "C" }]),
      node("C"),
    ]);
    const rects = new Map<string, Rect>([
      ["A", { x: 0, y: 0, w: 100, h: 40 }],
      ["X", { x: 200, y: 0, w: 100, h: 40 }],
      ["B", { x: 400, y: 0, w: 100, h: 40 }],
      ["C", { x: 600, y: 0, w: 100, h: 40 }],
    ]);
    const labels = textOf(buildBadges(tree, rects)).map((t) => t.text).sort();
    expect(labels).toContain("→1");
    expect(labels).toContain("←1");
  });

  it("skips nodes whose rect is missing from the map", () => {
    const tree = node("A", [], [{ kind: "depends_on", targetUuid: "B" }]);
    // Neither endpoint has a rect → nothing to anchor a badge to.
    const rects = new Map<string, Rect>();
    expect(buildBadges(tree, rects)).toEqual([]);
  });
});

describe("buildFocusHalo", () => {
  const rects = new Map<string, Rect>([
    ["A", { x: 100, y: 50, w: 200, h: 60 }],
  ]);

  it("returns nothing when focusedUuid is null", () => {
    expect(buildFocusHalo(null, rects)).toEqual([]);
  });

  it("returns nothing when focusedUuid is not in the rect map", () => {
    expect(buildFocusHalo("GHOST", rects)).toEqual([]);
  });

  it("emits a single bordered box surrounding the focused rect", () => {
    const els = buildFocusHalo("A", rects);
    expect(els).toHaveLength(1);
    const box = els[0];
    expect(box.type).toBe("box");
    // Halo extends beyond the rect on all sides.
    expect((box as { x: number }).x).toBeLessThan(100);
    expect((box as { y: number }).y).toBeLessThan(50);
    expect((box as { w: number }).w).toBeGreaterThan(200);
    expect((box as { h: number }).h).toBeGreaterThan(60);
  });
});

describe("buildBadges with ghost edges", () => {
  const rects = () => new Map<string, Rect>([
    ["A", { x: 0, y: 0, w: 100, h: 40 }],
    ["G", { x: 300, y: 0, w: 100, h: 40 }],
  ]);

  it("counts an incoming ghost edge on the tree node", () => {
    const tree = node("A");
    const els = buildBadges(tree, rects(), [
      { sourceUuid: "G", kind: "supports", targetUuid: "A" },
    ]);
    const texts = els.filter((e) => e.type === "text").map((e) => (e as { text: string }).text);
    expect(texts).toContain("←1");
  });

  it("counts the outgoing side on the ghost itself", () => {
    const tree = node("A");
    const els = buildBadges(tree, rects(), [
      { sourceUuid: "G", kind: "supports", targetUuid: "A" },
    ]);
    const texts = els.filter((e) => e.type === "text").map((e) => (e as { text: string }).text);
    expect(texts).toContain("→1");
  });

  it("adds ghost counts to existing tree-ref counts rather than replacing them", () => {
    const tree = node("A", [], [{ kind: "depends_on", targetUuid: "G" }]);
    const els = buildBadges(tree, rects(), [
      { sourceUuid: "G", kind: "supports", targetUuid: "A" },
    ]);
    const texts = els.filter((e) => e.type === "text").map((e) => (e as { text: string }).text);
    // A: one outgoing tree ref + one incoming ghost edge.
    expect(texts).toContain("→1");
    expect(texts).toContain("←1");
  });
});
