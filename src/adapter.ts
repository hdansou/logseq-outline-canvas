import type { TreeNode, NodeRef, RelKind, EdgeSpec } from "./types";
import { REL_KIND_ALTERNATION } from "./relations";

// Block shape from @logseq/libs. Properties in DB graphs can surface as
// namespaced top-level keys (e.g. `user.property/foo-XYZ`) AND/OR inside a
// `.properties` sub-object — `[key: string]: unknown` covers both.
export interface LogseqBlock {
  uuid: string;
  content?: string;
  title?: string;
  children?: LogseqBlock[];
  properties?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Resolves a UUID to the referenced entity's display title. Return null if unresolvable. */
export type RefFetcher = (uuid: string) => Promise<string | null>;

/** Resolves a numeric `:db/id` entity reference to a block UUID. */
export type IdResolver = (id: number) => Promise<string | null>;

let nextId = 0;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REF_RE = /\[\[([^\[\]]+)\]\]/g;
const MAX_REF_DEPTH = 3;

/**
 * Match property keys of the form `user.property/<kind>-<suffix>` for any kind
 * in the relationship registry (relates_to, depends_on, supports, contradicts,
 * part_of). Leading colon (namespaced-keyword form) tolerated. Suffix part is
 * optional (matches a built-in ident too, should Logseq ever ship one). Match
 * on ident is rename-stable; if a user renames the property after creation the
 * connector keeps drawing — acceptable v1.
 */
const REL_KEY_RE = new RegExp(
  `^:?user\\.property\\/(${REL_KIND_ALTERNATION})(?:-[A-Za-z0-9_-]+)?$`
);

/**
 * Replace `[[uuid]]` node references inside text with the referenced entity's
 * title. Page-name refs like `[[Some Page]]` are left untouched (they fall
 * through to the existing wiki-link handling in stripMarkdown).
 *
 * Cache is shared across one tree build to dedupe lookups and to bound the
 * blast radius of cyclic references (a→b→a) alongside MAX_REF_DEPTH.
 */
export async function resolveNodeRefs(
  text: string,
  fetcher: RefFetcher,
  cache: Map<string, string> = new Map(),
  depth = 0
): Promise<string> {
  if (depth >= MAX_REF_DEPTH || !text.includes("[[")) return text;

  REF_RE.lastIndex = 0;
  const hits: { match: string; uuid: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = REF_RE.exec(text)) !== null) {
    const inner = m[1].trim();
    if (UUID_RE.test(inner)) hits.push({ match: m[0], uuid: inner });
  }
  if (hits.length === 0) return text;

  const uniqueUuids = [...new Set(hits.map((h) => h.uuid))].filter((u) => !cache.has(u));
  await Promise.all(
    uniqueUuids.map(async (uuid) => {
      let title: string | null = null;
      try {
        title = await fetcher(uuid);
      } catch { /* unresolved */ }
      cache.set(uuid, title?.trim() || `↗ ${uuid.slice(0, 8)}`);
    })
  );

  let result = text;
  for (const { match, uuid } of hits) {
    const resolved = await resolveNodeRefs(cache.get(uuid)!, fetcher, cache, depth + 1);
    result = result.split(match).join(resolved);
  }
  return result;
}

/**
 * Default id resolver: numeric `:db/id` → block UUID via the Logseq SDK.
 * In DB graphs, :node-typed properties surface ref values as `{ id: <number> }`,
 * and we need the target's UUID to wire the connector to its rendered rect.
 */
const defaultIdResolver: IdResolver = async (id) => {
  try {
    const block = await logseq.Editor.getBlock(id);
    const uuid = (block as Record<string, unknown> | null)?.uuid as string | undefined;
    return uuid && UUID_RE.test(uuid) ? uuid : null;
  } catch {
    return null;
  }
};

/**
 * Extract target UUIDs from a property value. :node-typed property values come
 * through @logseq/libs in several shapes depending on cardinality and how the
 * SDK normalizes them:
 *
 *   "uuid-string"                              cardinality :one, normalized
 *   { "block/uuid": "uuid-string" }            datascript ref tuple shape
 *   { uuid: "uuid-string" }                    hydrated entity shape
 *   { id: <number> }                           DB-graph short ref (needs resolve)
 *   [<any of the above>]                       cardinality :many
 *
 * Numeric `id` refs need an async lookup; we cache resolved ids per build.
 */
async function extractRefUuids(
  value: unknown,
  idCache: Map<number, string | null>,
  idResolver: IdResolver
): Promise<string[]> {
  if (value == null) return [];
  if (Array.isArray(value)) {
    const all = await Promise.all(value.map((v) => extractRefUuids(v, idCache, idResolver)));
    return all.flat();
  }
  if (typeof value === "string") return UUID_RE.test(value) ? [value] : [];
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const blockUuid = obj["block/uuid"];
    if (typeof blockUuid === "string" && UUID_RE.test(blockUuid)) return [blockUuid];
    if (typeof obj.uuid === "string" && UUID_RE.test(obj.uuid as string)) {
      return [obj.uuid as string];
    }
    if (typeof obj.id === "number") {
      const id = obj.id as number;
      let cached = idCache.get(id);
      if (cached === undefined) {
        cached = await idResolver(id);
        idCache.set(id, cached);
      }
      return cached ? [cached] : [];
    }
  }
  return [];
}

/**
 * Walk a block's property surface and emit a NodeRef for every value attached
 * to a `relates_to` / `depends_on` property. Checks both top-level namespaced
 * keys (DB-graph style) and the `.properties` sub-object (legacy / fallback).
 * Dedupes if a key appears in both places.
 */
async function extractRefs(
  block: LogseqBlock,
  idCache: Map<number, string | null>,
  idResolver: IdResolver
): Promise<NodeRef[]> {
  const out: NodeRef[] = [];
  const seen = new Set<string>(); // `${kind}|${uuid}` dedup

  const addFrom = async (key: string, value: unknown): Promise<void> => {
    const m = REL_KEY_RE.exec(key);
    if (!m) return;
    const kind = m[1] as RelKind;
    for (const targetUuid of await extractRefUuids(value, idCache, idResolver)) {
      const sig = `${kind}|${targetUuid}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      out.push({ kind, targetUuid });
    }
  };

  // Top-level keys (preferred DB-graph surface).
  for (const [key, value] of Object.entries(block)) {
    await addFrom(key, value);
  }

  // Legacy / fallback: `.properties` sub-object.
  const props = block.properties;
  if (props && typeof props === "object") {
    for (const [key, value] of Object.entries(props)) {
      await addFrom(key, value);
    }
  }

  return out;
}

/** Default fetcher: resolves via Logseq SDK (block first, then page). */
export const defaultFetcher: RefFetcher = async (uuid) => {
  try {
    const block = await logseq.Editor.getBlock(uuid);
    if (block) {
      const t = (block as Record<string, unknown>).title as string | undefined
        ?? (block as Record<string, unknown>).content as string | undefined;
      if (t && t.trim()) return t;
    }
  } catch { /* fall through */ }
  try {
    const page = await logseq.Editor.getPage(uuid);
    if (page) {
      const t = (page as Record<string, unknown>).originalName as string | undefined
        ?? (page as Record<string, unknown>).name as string | undefined
        ?? (page as Record<string, unknown>).title as string | undefined;
      if (t && t.trim()) return t;
    }
  } catch { /* fall through */ }
  return null;
};

/** Strip inline markdown formatting from text */
function stripMarkdown(text: string): string {
  return text
    .replace(/\{\{renderer\s[^}]*\}\}/g, "") // macro renderers
    .replace(/\{\{[^}]*\}\}/g, "") // other macros
    .replace(/\*\*(.+?)\*\*/g, "$1") // bold
    .replace(/\*(.+?)\*/g, "$1") // italic
    .replace(/__(.+?)__/g, "$1") // bold alt
    .replace(/_(.+?)_/g, "$1") // italic alt
    .replace(/~~(.+?)~~/g, "$1") // strikethrough
    .replace(/`(.+?)`/g, "$1") // inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links
    .replace(/\[\[([^\]]+)\]\]/g, "$1") // wiki links (page-name fallback — strip brackets only)
    .trim();
}

/** Convert a Logseq block tree to an internal TreeNode tree */
async function convertBlock(
  block: LogseqBlock,
  depth: number,
  showEmpty: boolean,
  fetcher: RefFetcher,
  cache: Map<string, string>,
  idResolver: IdResolver,
  idCache: Map<number, string | null>
): Promise<TreeNode | null> {
  const rawText = block.content ?? block.title ?? "";
  const resolved = await resolveNodeRefs(rawText, fetcher, cache);
  const name = stripMarkdown(resolved);

  if (!name && (!block.children || block.children.length === 0) && !showEmpty) {
    return null;
  }

  const refs = await extractRefs(block, idCache, idResolver);

  const children: TreeNode[] = [];
  if (block.children) {
    for (const child of block.children) {
      const node = await convertBlock(child, depth + 1, showEmpty, fetcher, cache, idResolver, idCache);
      if (node) children.push(node);
    }
  }

  return {
    name: name || "(empty)",
    children,
    depth,
    id: nextId++,
    uuid: block.uuid,
    refs,
  };
}

/** Build a tree from a page's block tree, wrapping multiple roots in a virtual node */
export async function buildTree(
  blocks: LogseqBlock[],
  pageName: string,
  showEmpty: boolean,
  fetcher: RefFetcher = defaultFetcher,
  idResolver: IdResolver = defaultIdResolver
): Promise<TreeNode> {
  nextId = 0;
  const cache = new Map<string, string>();
  const idCache = new Map<number, string | null>();

  const children: TreeNode[] = [];
  for (const block of blocks) {
    const node = await convertBlock(block, 1, showEmpty, fetcher, cache, idResolver, idCache);
    if (node) children.push(node);
  }

  if (children.length === 1 && children[0].name) {
    // Single top-level block becomes root
    children[0].depth = 0;
    return reindex(children[0], 0);
  }

  // Multiple top-level blocks: wrap in a virtual root
  return {
    name: pageName,
    children,
    depth: 0,
    id: nextId++,
    uuid: "",
    refs: [],
  };
}

/** Re-index depths after restructuring */
function reindex(node: TreeNode, depth: number): TreeNode {
  node.depth = depth;
  for (const child of node.children) {
    reindex(child, depth + 1);
  }
  return node;
}

/**
 * Prepare a tree for rendering based on depth mode.
 *
 * - "recursive": prune at maxDepth, preserve full tree structure for
 *   views to render each level as independent connected nodes.
 * - "flat": prune at maxDepth, then collapse to 3 levels with
 *   breadcrumb-style leaf labels (e.g. "A > B > C").
 */
export function flattenDeep(
  root: TreeNode,
  maxDepth: number,
  mode: "recursive" | "flat" = "recursive"
): TreeNode {
  const clone = structuredClone(root);
  pruneAtDepth(clone, maxDepth);
  if (mode === "flat") {
    collapseToThreeLevels(clone);
  }
  return clone;
}

/** Remove children from nodes at or beyond maxDepth */
function pruneAtDepth(node: TreeNode, maxDepth: number): void {
  if (node.depth >= maxDepth - 1) {
    node.children = [];
    return;
  }
  for (const child of node.children) {
    pruneAtDepth(child, maxDepth);
  }
}

/** Collapse a tree of arbitrary depth into 3 levels with breadcrumb leaf labels */
function collapseToThreeLevels(root: TreeNode): void {
  for (const branch of root.children) {
    const newLeaves: TreeNode[] = [];
    for (const child of branch.children) {
      if (child.children.length === 0) {
        child.depth = 2;
        newLeaves.push(child);
      } else {
        gatherLeaves(child, "", newLeaves, 2);
      }
    }
    branch.children = newLeaves;
    branch.depth = 1;
  }
  root.depth = 0;
}

function gatherLeaves(
  node: TreeNode,
  prefix: string,
  out: TreeNode[],
  targetDepth: number
): void {
  const label = prefix ? `${prefix} > ${node.name}` : node.name;
  if (node.children.length === 0) {
    out.push({ ...node, name: label, depth: targetDepth, children: [] });
  } else {
    for (const child of node.children) {
      gatherLeaves(child, label, out, targetDepth);
    }
  }
}

/** Fetch the current page's block tree from Logseq and build an internal tree */
export async function fetchTree(showEmpty: boolean): Promise<TreeNode | null> {
  const page = await logseq.Editor.getCurrentPage();
  if (!page) return null;

  const pageName =
    (page as Record<string, unknown>).originalName as string ??
    (page as Record<string, unknown>).name as string ??
    "Untitled";

  const blocks = await logseq.Editor.getPageBlocksTree(pageName);
  if (!blocks || blocks.length === 0) return null;

  return buildTree(blocks as unknown as LogseqBlock[], pageName, showEmpty);
}

/** Fetch a specific block and its children as a tree */
export async function fetchBlockTree(
  uuid: string,
  showEmpty: boolean
): Promise<TreeNode | null> {
  const block = await logseq.Editor.getBlock(uuid, { includeChildren: true });
  if (!block) return null;

  nextId = 0;
  const cache = new Map<string, string>();
  const idCache = new Map<number, string | null>();
  const node = await convertBlock(
    block as unknown as LogseqBlock,
    0,
    showEmpty,
    defaultFetcher,
    cache,
    defaultIdResolver,
    idCache
  );
  return node;
}

/** Collect every uuid present in the tree. */
function treeUuids(root: TreeNode): Set<string> {
  const present = new Set<string>();
  (function collect(n: TreeNode): void {
    if (n.uuid) present.add(n.uuid);
    for (const c of n.children) collect(c);
  })(root);
  return present;
}

/**
 * Drop any refs whose target is neither in the tree nor in `alsoAllowed`.
 * The allowance is how `relationshipScope: "graph"` keeps refs pointing at
 * off-page targets alive: the ghost uuids selected for rendering are passed
 * in, so refs to them survive while refs to targets we chose not to draw
 * (over the cap) are still dropped.
 *
 * Runs after `flattenDeep` so refs into pruned subtrees are also dropped.
 * Returns a structurally-cloned tree (input untouched).
 */
export function filterRefsToSet(root: TreeNode, alsoAllowed: Set<string>): TreeNode {
  const present = treeUuids(root);

  return (function walk(n: TreeNode): TreeNode {
    const refs = n.refs?.filter(
      (r) => present.has(r.targetUuid) || alsoAllowed.has(r.targetUuid)
    );
    return {
      ...n,
      children: n.children.map(walk),
      refs: refs && refs.length ? refs : [],
    };
  })(root);
}

/**
 * Drop any refs whose target UUID is not present elsewhere in the tree —
 * the `relationshipScope: "page"` behavior.
 */
export function filterIntraTreeRefs(root: TreeNode): TreeNode {
  return filterRefsToSet(root, new Set());
}

/**
 * Refs that point outside the rendered tree, paired with the uuid of the
 * block that declares them. These are the candidates for ghost nodes under
 * `relationshipScope: "graph"`; under `"page"` they are simply dropped.
 */
export function collectExternalRefs(root: TreeNode): EdgeSpec[] {
  const present = treeUuids(root);
  const out: EdgeSpec[] = [];

  (function walk(n: TreeNode): void {
    if (n.uuid && n.refs) {
      for (const r of n.refs) {
        if (!present.has(r.targetUuid)) {
          out.push({ sourceUuid: n.uuid, kind: r.kind, targetUuid: r.targetUuid });
        }
      }
    }
    for (const c of n.children) walk(c);
  })(root);

  return out;
}
