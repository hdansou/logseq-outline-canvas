import { describe, it, expect, vi } from "vitest";
import {
  resolveNodeRefs,
  buildTree,
  filterIntraTreeRefs,
  filterRefsToSet,
  collectExternalRefs,
  flattenDeep,
} from "./adapter";
import type { TreeNode } from "./types";

const UUID_A = "11111111-1111-1111-1111-111111111111";
const UUID_B = "22222222-2222-2222-2222-222222222222";
const UUID_BUG = "69fd1b8a-9fda-4a4b-982b-836e19aeb5e6"; // from the reported bug

describe("resolveNodeRefs", () => {
  it("returns text unchanged and never calls the fetcher when there are no refs", async () => {
    const fetcher = vi.fn(async () => null);
    const result = await resolveNodeRefs("just plain text", fetcher);
    expect(result).toBe("just plain text");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("leaves non-UUID page-name refs alone (only UUID-form refs are resolved)", async () => {
    const fetcher = vi.fn(async () => null);
    const result = await resolveNodeRefs("see [[Some Page]]", fetcher);
    expect(result).toBe("see [[Some Page]]");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("resolves a single UUID ref to the referenced title (the reported bug)", async () => {
    const fetcher = vi.fn(async (id: string) =>
      id === UUID_BUG ? "tasky-reference child" : null
    );
    const result = await resolveNodeRefs(`[[${UUID_BUG}]]`, fetcher);
    expect(result).toBe("tasky-reference child");
  });

  it("resolves multiple UUID refs interleaved with other text", async () => {
    const fetcher = vi.fn(async (id: string) =>
      id === UUID_A ? "Alpha" : id === UUID_B ? "Beta" : null
    );
    const result = await resolveNodeRefs(
      `before [[${UUID_A}]] middle [[${UUID_B}]] after`,
      fetcher
    );
    expect(result).toBe("before Alpha middle Beta after");
  });

  it("dedupes lookups: same UUID appearing twice triggers fetcher once", async () => {
    const fetcher = vi.fn(async () => "Title");
    await resolveNodeRefs(`[[${UUID_A}]] and again [[${UUID_A}]]`, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("recursively resolves nested refs when a resolved title contains another ref", async () => {
    const fetcher = vi.fn(async (id: string) =>
      id === UUID_A ? `outer with [[${UUID_B}]]` : "inner"
    );
    const result = await resolveNodeRefs(`[[${UUID_A}]]`, fetcher);
    expect(result).toBe("outer with inner");
  });

  it("does not infinite-loop on cyclic refs (depth cap)", async () => {
    const fetcher = vi.fn(async (id: string) =>
      id === UUID_A ? `[[${UUID_B}]]` : `[[${UUID_A}]]`
    );
    const result = await resolveNodeRefs(`[[${UUID_A}]]`, fetcher);
    // Cache means each uuid is fetched at most once
    expect(fetcher.mock.calls.length).toBeLessThanOrEqual(2);
    expect(typeof result).toBe("string");
  });

  it("falls back to a non-UUID placeholder when the fetcher returns null", async () => {
    const fetcher = vi.fn(async () => null);
    const result = await resolveNodeRefs(`[[${UUID_A}]]`, fetcher);
    expect(result).not.toContain(UUID_A);
    expect(result.length).toBeGreaterThan(0);
  });

  it("survives a fetcher that throws (treats as unresolved)", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("boom");
    });
    const result = await resolveNodeRefs(`[[${UUID_A}]]`, fetcher);
    expect(typeof result).toBe("string");
    expect(result).not.toContain(UUID_A);
  });
});

describe("buildTree (end-to-end ref resolution)", () => {
  it("resolves UUID refs in a block title so the rendered name is the referenced entity's title", async () => {
    const fetcher = vi.fn(async (id: string) =>
      id === UUID_BUG ? "Referenced Block Title" : null
    );
    const blocks = [
      {
        uuid: "block-1",
        title: `[[${UUID_BUG}]]`,
        children: [],
      },
    ];
    const tree = await buildTree(blocks, "Page", false, fetcher);
    // Single top-level block becomes root, so its resolved title shows up at the root
    expect(tree.name).toBe("Referenced Block Title");
  });

  it("resolves refs inside child blocks too", async () => {
    const fetcher = vi.fn(async (id: string) =>
      id === UUID_A ? "Child Title" : null
    );
    const blocks = [
      {
        uuid: "parent",
        title: "Parent",
        children: [
          { uuid: "child-1", title: `[[${UUID_A}]]`, children: [] },
        ],
      },
    ];
    const tree = await buildTree(blocks, "Page", false, fetcher);
    expect(tree.name).toBe("Parent");
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].name).toBe("Child Title");
  });
});

describe("buildTree with relationship properties", () => {
  const PROP_RELATES = "user.property/relates_to-HG66AZUl";
  const PROP_DEPENDS = "user.property/depends_on-SfjMwya6";
  const PROP_RELATES_COLON = ":user.property/relates_to-HG66AZUl";
  const PROP_DEPENDS_COLON = ":user.property/depends_on-SfjMwya6";
  const PROP_OTHER = "user.property/blocks-XYZ";
  const TGT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const TGT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const noResolve = vi.fn(async () => null);

  it("extracts a single :cardinality/one ref via {block/uuid} value shape, from .properties", async () => {
    const fetcher = vi.fn(async () => null);
    const blocks = [
      {
        uuid: "p",
        title: "Parent",
        children: [
          {
            uuid: "c",
            title: "Child",
            properties: { [PROP_DEPENDS]: { "block/uuid": TGT_A } },
            children: [],
          },
        ],
      },
    ];
    const tree = await buildTree(blocks, "Page", false, fetcher, noResolve);
    expect(tree.children[0].refs).toEqual([{ kind: "depends_on", targetUuid: TGT_A }]);
  });

  it("extracts refs from top-level namespaced keys (DB-graph style)", async () => {
    const fetcher = vi.fn(async () => null);
    const blocks: unknown[] = [
      {
        uuid: "c",
        title: "Block",
        // Property as top-level key (no .properties wrapper)
        [PROP_DEPENDS]: { "block/uuid": TGT_A },
        children: [],
      },
    ];
    const tree = await buildTree(blocks as never, "Page", false, fetcher, noResolve);
    expect(tree.refs).toEqual([{ kind: "depends_on", targetUuid: TGT_A }]);
  });

  it("tolerates leading-colon keys (:user.property/...)", async () => {
    const fetcher = vi.fn(async () => null);
    const blocks: unknown[] = [
      {
        uuid: "c",
        title: "Block",
        [PROP_RELATES_COLON]: { uuid: TGT_A },
        children: [],
      },
    ];
    const tree = await buildTree(blocks as never, "Page", false, fetcher, noResolve);
    expect(tree.refs).toEqual([{ kind: "relates_to", targetUuid: TGT_A }]);
  });

  it("extracts multiple targets from :cardinality/many (array value)", async () => {
    const fetcher = vi.fn(async () => null);
    const blocks = [
      {
        uuid: "c",
        title: "Block",
        properties: { [PROP_RELATES]: [{ "block/uuid": TGT_A }, { uuid: TGT_B }] },
        children: [],
      },
    ];
    const tree = await buildTree(blocks, "Page", false, fetcher, noResolve);
    expect(tree.refs).toEqual([
      { kind: "relates_to", targetUuid: TGT_A },
      { kind: "relates_to", targetUuid: TGT_B },
    ]);
  });

  it("accepts bare UUID string values", async () => {
    const fetcher = vi.fn(async () => null);
    const blocks = [
      { uuid: "c", title: "Block", properties: { [PROP_DEPENDS]: TGT_A }, children: [] },
    ];
    const tree = await buildTree(blocks, "Page", false, fetcher, noResolve);
    expect(tree.refs).toEqual([{ kind: "depends_on", targetUuid: TGT_A }]);
  });

  it("resolves :db/id-shaped ref values via the idResolver", async () => {
    const fetcher = vi.fn(async () => null);
    const idResolver = vi.fn(async (id: number) => (id === 99 ? TGT_A : null));
    const blocks = [
      { uuid: "c", title: "Block", properties: { [PROP_DEPENDS]: { id: 99 } }, children: [] },
    ];
    const tree = await buildTree(blocks, "Page", false, fetcher, idResolver);
    expect(tree.refs).toEqual([{ kind: "depends_on", targetUuid: TGT_A }]);
  });

  it("caches id-resolver lookups (one call per unique numeric id)", async () => {
    const fetcher = vi.fn(async () => null);
    const idResolver = vi.fn(async (id: number) => (id === 99 ? TGT_A : null));
    const blocks = [
      {
        uuid: "p",
        title: "Parent",
        properties: { [PROP_DEPENDS]: { id: 99 } },
        children: [
          { uuid: "c1", title: "C1", properties: { [PROP_DEPENDS]: { id: 99 } }, children: [] },
        ],
      },
    ];
    await buildTree(blocks, "Page", false, fetcher, idResolver);
    expect(idResolver).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["supports", "user.property/supports-Qz1aB2"],
    ["contradicts", "user.property/contradicts-Rt7cD9"],
    ["part_of", "user.property/part_of-Uv3eF4"],
  ])("extracts %s refs", async (kind, propKey) => {
    const fetcher = vi.fn(async () => null);
    const blocks = [
      { uuid: "c", title: "Block", properties: { [propKey]: { "block/uuid": TGT_A } }, children: [] },
    ];
    const tree = await buildTree(blocks, "Page", false, fetcher, noResolve);
    expect(tree.refs).toEqual([{ kind, targetUuid: TGT_A }]);
  });

  it("keeps refs of different kinds on the same block distinct", async () => {
    const fetcher = vi.fn(async () => null);
    const blocks = [
      {
        uuid: "c",
        title: "Block",
        properties: {
          "user.property/supports-Qz1aB2": { "block/uuid": TGT_A },
          "user.property/contradicts-Rt7cD9": { "block/uuid": TGT_A },
        },
        children: [],
      },
    ];
    const tree = await buildTree(blocks, "Page", false, fetcher, noResolve);
    expect(tree.refs).toEqual([
      { kind: "supports", targetUuid: TGT_A },
      { kind: "contradicts", targetUuid: TGT_A },
    ]);
  });

  it("ignores user-properties whose ident is not a known relationship kind", async () => {
    const fetcher = vi.fn(async () => null);
    const blocks = [
      {
        uuid: "c",
        title: "Block",
        properties: { [PROP_OTHER]: { "block/uuid": TGT_A } },
        children: [],
      },
    ];
    const tree = await buildTree(blocks, "Page", false, fetcher, noResolve);
    expect(tree.refs ?? []).toEqual([]);
  });

  it("dedupes when the same property appears at top level and in .properties", async () => {
    const fetcher = vi.fn(async () => null);
    const blocks: unknown[] = [
      {
        uuid: "c",
        title: "Block",
        [PROP_DEPENDS]: { "block/uuid": TGT_A },
        properties: { [PROP_DEPENDS]: { "block/uuid": TGT_A } },
        children: [],
      },
    ];
    const tree = await buildTree(blocks as never, "Page", false, fetcher, noResolve);
    expect(tree.refs).toEqual([{ kind: "depends_on", targetUuid: TGT_A }]);
  });
});

describe("filterIntraTreeRefs", () => {
  const node = (uuid: string, children: TreeNode[] = [], refs?: TreeNode["refs"]): TreeNode => ({
    name: uuid, uuid, depth: 0, id: 0, children, refs,
  });

  it("keeps refs whose target is in the tree", () => {
    const tree = node("A", [
      node("B", [], [{ kind: "depends_on", targetUuid: "C" }]),
      node("C"),
    ]);
    const filtered = filterIntraTreeRefs(tree);
    expect(filtered.children[0].refs).toEqual([{ kind: "depends_on", targetUuid: "C" }]);
  });

  it("drops refs whose target is not in the tree", () => {
    const tree = node("A", [
      node("B", [], [{ kind: "depends_on", targetUuid: "OUTSIDE" }]),
    ]);
    const filtered = filterIntraTreeRefs(tree);
    expect(filtered.children[0].refs ?? []).toEqual([]);
  });

  it("does not mutate the input tree", () => {
    const inputRefs = [{ kind: "depends_on" as const, targetUuid: "OUTSIDE" }];
    const tree = node("A", [node("B", [], inputRefs)]);
    filterIntraTreeRefs(tree);
    expect(tree.children[0].refs).toEqual(inputRefs);
  });

  it("handles a node with no refs gracefully", () => {
    const tree = node("A", [node("B")]);
    const filtered = filterIntraTreeRefs(tree);
    expect(filtered.children[0].refs ?? []).toEqual([]);
  });
});

describe("flattenDeep preserves refs", () => {
  const node = (uuid: string, depth: number, children: TreeNode[] = [], refs?: TreeNode["refs"]): TreeNode => ({
    name: uuid, uuid, depth, id: 0, children, refs,
  });

  it("preserves refs through recursive mode", () => {
    const tree = node("A", 0, [
      node("B", 1, [], [{ kind: "relates_to", targetUuid: "C" }]),
      node("C", 1),
    ]);
    const out = flattenDeep(tree, 5, "recursive");
    expect(out.children[0].refs).toEqual([{ kind: "relates_to", targetUuid: "C" }]);
  });

  it("drops refs to nodes that were pruned away at maxDepth", () => {
    // B has a depends_on ref to C, which is at depth 3 and gets pruned at maxDepth=2
    const tree = node("A", 0, [
      node("B", 1, [], [{ kind: "depends_on", targetUuid: "C" }]),
      node("X", 1, [node("C", 2)]),  // C is at depth 2; with maxDepth=2, X is rendered but its children (C) are pruned
    ]);
    const pruned = flattenDeep(tree, 2, "recursive");
    const afterFilter = filterIntraTreeRefs(pruned);
    expect(afterFilter.children[0].refs ?? []).toEqual([]);
  });
});

describe("collectExternalRefs", () => {
  const node = (uuid: string, children: TreeNode[] = [], refs?: TreeNode["refs"]): TreeNode => ({
    name: uuid, uuid, depth: 0, id: 0, children, refs,
  });

  it("returns refs whose target is outside the tree, with their source", () => {
    const tree = node("A", [
      node("B", [], [{ kind: "depends_on", targetUuid: "OUTSIDE" }]),
      node("C", [], [{ kind: "supports", targetUuid: "B" }]),
    ]);
    expect(collectExternalRefs(tree)).toEqual([
      { sourceUuid: "B", kind: "depends_on", targetUuid: "OUTSIDE" },
    ]);
  });

  it("returns an empty list when every target is in the tree", () => {
    const tree = node("A", [node("B", [], [{ kind: "supports", targetUuid: "A" }])]);
    expect(collectExternalRefs(tree)).toEqual([]);
  });

  it("keeps one entry per source/kind/target triple, not per unique target", () => {
    const tree = node("A", [
      node("B", [], [{ kind: "supports", targetUuid: "OUT" }]),
      node("C", [], [{ kind: "contradicts", targetUuid: "OUT" }]),
    ]);
    expect(collectExternalRefs(tree)).toHaveLength(2);
  });
});

describe("filterRefsToSet", () => {
  const node = (uuid: string, children: TreeNode[] = [], refs?: TreeNode["refs"]): TreeNode => ({
    name: uuid, uuid, depth: 0, id: 0, children, refs,
  });

  it("keeps refs pointing at allowed uuids outside the tree", () => {
    const tree = node("A", [node("B", [], [{ kind: "part_of", targetUuid: "GHOST" }])]);
    const out = filterRefsToSet(tree, new Set(["GHOST"]));
    expect(out.children[0].refs).toEqual([{ kind: "part_of", targetUuid: "GHOST" }]);
  });

  it("still drops refs that are neither in-tree nor allowed", () => {
    const tree = node("A", [node("B", [], [{ kind: "part_of", targetUuid: "NOPE" }])]);
    const out = filterRefsToSet(tree, new Set(["GHOST"]));
    expect(out.children[0].refs ?? []).toEqual([]);
  });

  it("filterIntraTreeRefs is the empty-allowance case", () => {
    const tree = node("A", [node("B", [], [{ kind: "part_of", targetUuid: "GHOST" }])]);
    expect(filterIntraTreeRefs(tree)).toEqual(filterRefsToSet(tree, new Set()));
  });
});
