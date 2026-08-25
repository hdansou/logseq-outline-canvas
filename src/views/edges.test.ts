import { describe, it, expect } from "vitest";
import type { TreeNode, Rect, CurveElement, TextElement } from "../types";
import { buildEdgeElements, buildEdgeLabels } from "./edges";
import { REL_KINDS } from "../relations";

const node = (uuid: string, children: TreeNode[] = [], refs?: TreeNode["refs"]): TreeNode => ({
  name: uuid, uuid, depth: 0, id: 0, children, refs,
});

const curveEls = (els: ReturnType<typeof buildEdgeElements>): CurveElement[] =>
  els.filter((e): e is CurveElement => e.type === "curve");

describe("buildEdgeElements", () => {
  it("returns no elements when there are no refs", () => {
    const tree = node("A", [node("B")]);
    const rects = new Map<string, Rect>([
      ["A", { x: 0, y: 0, w: 100, h: 40 }],
      ["B", { x: 200, y: 0, w: 100, h: 40 }],
    ]);
    expect(buildEdgeElements(tree, rects)).toEqual([]);
  });

  it("skips refs whose target rect is missing", () => {
    const tree = node("A", [
      node("B", [], [{ kind: "depends_on", targetUuid: "MISSING" }]),
    ]);
    const rects = new Map<string, Rect>([
      ["A", { x: 0, y: 0, w: 100, h: 40 }],
      ["B", { x: 200, y: 0, w: 100, h: 40 }],
    ]);
    expect(buildEdgeElements(tree, rects)).toEqual([]);
  });

  it("emits a solid curve with arrowEnd for depends_on", () => {
    const tree = node("A", [], [{ kind: "depends_on", targetUuid: "B" }]);
    const rects = new Map<string, Rect>([
      ["A", { x: 0, y: 0, w: 100, h: 40 }],
      ["B", { x: 200, y: 0, w: 100, h: 40 }],
    ]);
    const curves = curveEls(buildEdgeElements(tree, rects));
    expect(curves).toHaveLength(1);
    expect(curves[0].arrowEnd).toBe(true);
    expect(curves[0].dash).toBeUndefined();
  });

  it("emits a dashed curve without arrow for relates_to", () => {
    const tree = node("A", [], [{ kind: "relates_to", targetUuid: "B" }]);
    const rects = new Map<string, Rect>([
      ["A", { x: 0, y: 0, w: 100, h: 40 }],
      ["B", { x: 200, y: 0, w: 100, h: 40 }],
    ]);
    const curves = curveEls(buildEdgeElements(tree, rects));
    expect(curves).toHaveLength(1);
    expect(curves[0].arrowEnd).toBeFalsy();
    expect(curves[0].dash).toBeDefined();
    expect(curves[0].dash!.length).toBeGreaterThan(0);
  });

  it.each([
    ["supports" as const, true],
    ["contradicts" as const, true],
    ["part_of" as const, true],
  ])("emits a dashed curve for %s (arrow: %s)", (kind, arrow) => {
    const tree = node("A", [], [{ kind, targetUuid: "B" }]);
    const rects = new Map<string, Rect>([
      ["A", { x: 0, y: 0, w: 100, h: 40 }],
      ["B", { x: 200, y: 0, w: 100, h: 40 }],
    ]);
    const curves = curveEls(buildEdgeElements(tree, rects));
    expect(curves).toHaveLength(1);
    expect(curves[0].arrowEnd).toBe(arrow);
    expect(curves[0].dash!.length).toBeGreaterThan(0);
  });

  it("gives every relationship kind a distinct dash signature", () => {
    const rects = new Map<string, Rect>([
      ["A", { x: 0, y: 0, w: 100, h: 40 }],
      ["B", { x: 200, y: 0, w: 100, h: 40 }],
    ]);
    const signatures = REL_KINDS.map((kind) => {
      const c = curveEls(buildEdgeElements(node("A", [], [{ kind, targetUuid: "B" }]), rects))[0];
      return `${(c.dash ?? []).join(",")}|${c.arrowEnd ? "arrow" : ""}`;
    });
    expect(new Set(signatures).size).toBe(REL_KINDS.length);
  });

  it("horizontally-separated targets anchor on right/left faces", () => {
    const tree = node("A", [], [{ kind: "depends_on", targetUuid: "B" }]);
    const rects = new Map<string, Rect>([
      ["A", { x: 0, y: 0, w: 100, h: 40 }],     // right face x = 100, mid y = 20
      ["B", { x: 200, y: 0, w: 100, h: 40 }],   // left face x = 200, mid y = 20
    ]);
    const c = curveEls(buildEdgeElements(tree, rects))[0];
    expect(c.x1).toBe(100);
    expect(c.y1).toBe(20);
    expect(c.x2).toBe(200);
    expect(c.y2).toBe(20);
  });

  it("vertically-stacked targets (x-overlap) anchor on same-side faces and bulge outward", () => {
    // Both boxes share x range [0, 100]; target is far below source. A straight
    // line between facing edges would strike intermediate boxes — geometry must
    // route around by anchoring on the right faces of both and pushing control
    // points to the right.
    const tree = node("A", [], [{ kind: "depends_on", targetUuid: "B" }]);
    const rects = new Map<string, Rect>([
      ["A", { x: 0, y: 0, w: 100, h: 40 }],
      ["B", { x: 0, y: 400, w: 100, h: 40 }],
    ]);
    const c = curveEls(buildEdgeElements(tree, rects))[0];
    // Both anchors on the right face (x = 100)
    expect(c.x1).toBe(100);
    expect(c.x2).toBe(100);
    // Control points pushed further right (outward bulge)
    expect(c.cx1).toBeGreaterThan(100);
    expect(c.cx2).toBeGreaterThan(100);
  });

  it("vertical-only (no x-overlap) anchors on top/bottom faces", () => {
    const tree = node("A", [], [{ kind: "depends_on", targetUuid: "B" }]);
    const rects = new Map<string, Rect>([
      ["A", { x: 0, y: 0, w: 100, h: 40 }],       // bottom y = 40, mid x = 50
      ["B", { x: 200, y: 400, w: 100, h: 40 }],   // top y = 400, mid x = 250
    ]);
    const c = curveEls(buildEdgeElements(tree, rects))[0];
    // dx=200, dy=420 → vertical-dominant, no x-overlap
    expect(c.x1).toBe(50);
    expect(c.y1).toBe(40);
    expect(c.x2).toBe(250);
    expect(c.y2).toBe(400);
  });

  it("emits one curve per ref when a node has multiple refs", () => {
    const tree = node("A", [node("B"), node("C")], [
      { kind: "depends_on", targetUuid: "B" },
      { kind: "relates_to", targetUuid: "C" },
    ]);
    const rects = new Map<string, Rect>([
      ["A", { x: 0, y: 0, w: 100, h: 40 }],
      ["B", { x: 200, y: 0, w: 100, h: 40 }],
      ["C", { x: 0, y: 100, w: 100, h: 40 }],
    ]);
    expect(curveEls(buildEdgeElements(tree, rects))).toHaveLength(2);
  });

  it("walks the whole tree, not just the root", () => {
    const tree = node("A", [
      node("B", [
        node("C", [], [{ kind: "depends_on", targetUuid: "D" }]),
      ]),
      node("D"),
    ]);
    const rects = new Map<string, Rect>([
      ["A", { x: 0, y: 0, w: 100, h: 40 }],
      ["B", { x: 0, y: 100, w: 100, h: 40 }],
      ["C", { x: 0, y: 200, w: 100, h: 40 }],
      ["D", { x: 200, y: 0, w: 100, h: 40 }],
    ]);
    expect(curveEls(buildEdgeElements(tree, rects))).toHaveLength(1);
  });

  describe("focusedUuid", () => {
    const tree = node("A", [
      node("B", [], [{ kind: "depends_on", targetUuid: "C" }]),
      node("C", [], [{ kind: "relates_to", targetUuid: "D" }]),
      node("D", [], [{ kind: "depends_on", targetUuid: "E" }]),
      node("E"),
    ]);
    const rects = new Map<string, Rect>([
      ["A", { x: 0, y: 0, w: 100, h: 40 }],
      ["B", { x: 200, y: 0, w: 100, h: 40 }],
      ["C", { x: 400, y: 0, w: 100, h: 40 }],
      ["D", { x: 600, y: 0, w: 100, h: 40 }],
      ["E", { x: 800, y: 0, w: 100, h: 40 }],
    ]);

    it("emits all edges when focusedUuid is undefined (eager mode)", () => {
      expect(curveEls(buildEdgeElements(tree, rects))).toHaveLength(3);
    });

    it("emits zero edges when focusedUuid is null (PNG / lazy-at-rest mode)", () => {
      expect(buildEdgeElements(tree, rects, null)).toEqual([]);
    });

    it("emits only edges where the focused node is the source", () => {
      // B → C, no incoming on B → 1 edge total
      const els = curveEls(buildEdgeElements(tree, rects, "B"));
      expect(els).toHaveLength(1);
    });

    it("emits edges where the focused node is the target (incoming)", () => {
      // C has incoming from B AND outgoing to D → 2 edges
      const els = curveEls(buildEdgeElements(tree, rects, "C"));
      expect(els).toHaveLength(2);
    });

    it("emits no edges when focusedUuid doesn't match any node", () => {
      expect(buildEdgeElements(tree, rects, "GHOST")).toEqual([]);
    });
  });
});

describe("buildEdgeLabels", () => {
  const tree: TreeNode = {
    name: "A", uuid: "A", depth: 0, id: 0,
    children: [
      { name: "B", uuid: "B", depth: 1, id: 1, children: [], refs: [{ kind: "depends_on", targetUuid: "C" }] },
      { name: "C", uuid: "C", depth: 1, id: 2, children: [], refs: [{ kind: "relates_to", targetUuid: "D" }] },
      { name: "D", uuid: "D", depth: 1, id: 3, children: [] },
    ],
  };
  const rects = new Map<string, Rect>([
    ["A", { x: 0, y: 0, w: 100, h: 40 }],
    ["B", { x: 200, y: 0, w: 100, h: 40 }],
    ["C", { x: 400, y: 0, w: 100, h: 40 }],
    ["D", { x: 600, y: 0, w: 100, h: 40 }],
  ]);

  const labelTexts = (els: ReturnType<typeof buildEdgeLabels>): string[] =>
    els.filter((e): e is TextElement => e.type === "text").map((e) => e.text);

  it("emits a text element for each edge with the property name", () => {
    expect(labelTexts(buildEdgeLabels(tree, rects))).toEqual(["depends_on", "relates_to"]);
  });

  it("emits a background pill alongside each text label", () => {
    const els = buildEdgeLabels(tree, rects);
    // One pill + one text per edge → 4 elements total for 2 edges
    expect(els).toHaveLength(4);
    expect(els.filter((e) => e.type === "box")).toHaveLength(2);
    expect(els.filter((e) => e.type === "text")).toHaveLength(2);
  });

  it("returns nothing when focusedUuid is null (parity with edges)", () => {
    expect(buildEdgeLabels(tree, rects, null)).toEqual([]);
  });

  it("filters by focusedUuid, same regime as buildEdgeElements", () => {
    expect(labelTexts(buildEdgeLabels(tree, rects, "B"))).toEqual(["depends_on"]);
  });

  it("skips edges whose target rect is missing", () => {
    const partial = new Map(rects);
    partial.delete("D");
    expect(labelTexts(buildEdgeLabels(tree, partial))).toEqual(["depends_on"]);
  });
});
