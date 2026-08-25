/// <reference types="@logseq/libs" />
import type { EdgeSpec, RelKind } from "./types";
import { REL_KINDS } from "./relations";

/**
 * Incoming relationships are invisible to the adapter: it discovers refs by
 * walking the blocks of the rendered page, so a block on *another* page that
 * declares `supports -> <block here>` is never seen. Recovering those needs a
 * reverse query — one per tree build, not one per node.
 *
 * Property idents carry a per-graph suffix (`:user.property/supports-rsddWi2L`),
 * so the ident set is resolved by title first, then used as the query's
 * property filter.
 */

type Row = unknown[];

/** Shape we read out of a datascript pull; everything else is ignored. */
interface PulledEntity {
  uuid?: string;
  ident?: string;
  title?: string;
}

function asEntity(value: unknown): PulledEntity | null {
  return value && typeof value === "object" ? (value as PulledEntity) : null;
}

const KIND_SET = new Set<string>(REL_KINDS);

/**
 * Build ident → kind from pulled property entities, keyed by the property's
 * title. Matching on title (not ident) is what makes this suffix-agnostic.
 */
export function identsByKind(rows: unknown[] | undefined): Record<string, RelKind> {
  const out: Record<string, RelKind> = {};
  for (const row of rows ?? []) {
    const entity = asEntity(Array.isArray(row) ? row[0] : row);
    if (!entity?.ident || !entity.title) continue;
    if (KIND_SET.has(entity.title)) out[entity.ident] = entity.title as RelKind;
  }
  return out;
}

/**
 * Turn `[referring-block, property-ident, referenced-block]` rows into edge
 * specs. Rows naming an unknown property, or missing an endpoint, are
 * dropped; identical triples collapse to one edge.
 */
export function specsFromQueryRows(
  rows: unknown[] | undefined,
  idents: Record<string, RelKind>
): EdgeSpec[] {
  const seen = new Set<string>();
  const out: EdgeSpec[] = [];

  for (const row of rows ?? []) {
    if (!Array.isArray(row) || row.length < 3) continue;
    const source = asEntity(row[0]);
    const ident = typeof row[1] === "string" ? row[1] : null;
    const target = asEntity(row[2]);
    if (!source?.uuid || !target?.uuid || !ident) continue;

    const kind = idents[ident];
    if (!kind) continue;

    const sig = `${source.uuid}|${kind}|${target.uuid}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push({ sourceUuid: source.uuid, kind, targetUuid: target.uuid });
  }

  return out;
}

/** Resolve the graph's relationship property idents. One query per build. */
export async function fetchRelationIdents(): Promise<Record<string, RelKind>> {
  try {
    const rows = await logseq.DB.datascriptQuery<unknown[]>(
      `[:find (pull ?p [:db/ident :block/title])
        :where
        [?p :block/tags :logseq.class/Property]
        [?p :db/ident ?i]
        [(str ?i) ?s]
        [(clojure.string/starts-with? ?s ":user.property/")]]`
    );
    return identsByKind(rows);
  } catch {
    return {};
  }
}

/**
 * Find blocks outside the rendered tree that point *into* it via a
 * relationship property. `targetUuids` is the tree's uuid set; results whose
 * source is already in the tree are dropped by the caller's ghost selection.
 */
export async function fetchIncomingRefs(
  targetUuids: string[],
  idents: Record<string, RelKind>
): Promise<EdgeSpec[]> {
  const identList = Object.keys(idents);
  if (identList.length === 0 || targetUuids.length === 0) return [];

  // Set literals rather than :in inputs — the JS bridge serializes inputs as
  // JSON, which cannot express a keyword or a uuid literal.
  const identSet = `#{${identList.join(" ")}}`;
  const uuidSet = `#{${targetUuids.map((u) => `#uuid "${u}"`).join(" ")}}`;

  // Clause order matters: bind ?tgt from the rendered uuids first so the
  // variable-attribute scan runs against those blocks instead of every datom
  // in the graph.
  try {
    const rows = await logseq.DB.datascriptQuery<unknown[]>(
      `[:find (pull ?src [:block/uuid]) ?attr (pull ?tgt [:block/uuid])
        :where
        [?tgt :block/uuid ?tuuid]
        [(contains? ${uuidSet} ?tuuid)]
        [?src ?attr ?tgt]
        [(contains? ${identSet} ?attr)]]`
    );
    return specsFromQueryRows(rows, idents);
  } catch {
    return [];
  }
}
