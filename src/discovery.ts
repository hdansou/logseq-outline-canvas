/// <reference types="@logseq/libs" />
import type { DiscoveredProperty, RelationDef } from "./relations";
import { buildRegistry, setRegistry } from "./relations";

/**
 * The vocabulary is sourced from the graph, not from plugin config alone: any
 * property carrying the marker tag is a relationship kind. One query pulls
 * every user property with its tags; everything below is pure filtering, so
 * the interesting logic stays testable without a graph.
 */

/** One user property as it exists in the graph. */
export interface PropertyEntry {
  ident: string;
  title: string;
  tags: string[];
}

/** Default marker tag. Overridable so a graph with its own convention fits. */
export const DEFAULT_MARKER_TAG = "semantic-connector";

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Read `[(pull ?p [...])]` rows into a flat catalog. */
export function parseCatalog(rows: unknown[] | undefined): PropertyEntry[] {
  const out: PropertyEntry[] = [];

  for (const row of rows ?? []) {
    const entity = (Array.isArray(row) ? row[0] : row) as Record<string, unknown> | undefined;
    if (!entity || typeof entity !== "object") continue;

    const ident = str(entity["db/ident"]) ?? str(entity.ident);
    const title = str(entity["block/title"]) ?? str(entity.title);
    if (!ident || !title) continue;

    const rawTags = entity["block/tags"] ?? entity.tags;
    const tags: string[] = [];
    if (Array.isArray(rawTags)) {
      for (const tag of rawTags) {
        const name =
          typeof tag === "string"
            ? tag
            : str((tag as Record<string, unknown>)?.["block/title"]) ??
              str((tag as Record<string, unknown>)?.title);
        if (name) tags.push(name);
      }
    }

    out.push({ ident, title, tags });
  }

  return out;
}

/** Properties the user marked as relationship kinds. */
export function taggedWith(catalog: PropertyEntry[], markerTag: string): DiscoveredProperty[] {
  return catalog
    .filter((p) => p.tags.includes(markerTag))
    .map((p) => ({ ident: p.ident, title: p.title }));
}

/**
 * Give each kind the ident of the property that shares its name, where one
 * exists. This is what keeps the built-ins working: an existing graph's
 * `supports` property carries no marker tag, but its title still identifies
 * it. Kinds discovered *by* tag already know their ident and keep it.
 */
export function attachIdents(defs: RelationDef[], catalog: PropertyEntry[]): RelationDef[] {
  const byTitle = new Map<string, string>();
  for (const prop of catalog) {
    if (!byTitle.has(prop.title)) byTitle.set(prop.title, prop.ident);
  }
  return defs.map((def) => (def.ident ? def : { ...def, ident: byTitle.get(def.kind) }));
}

/** Pull every user property with its tags. One query per refresh. */
export async function fetchPropertyCatalog(): Promise<PropertyEntry[]> {
  try {
    const rows = await logseq.DB.datascriptQuery<unknown[]>(
      `[:find (pull ?p [:db/ident :block/title {:block/tags [:block/title]}])
        :where
        [?p :block/tags :logseq.class/Property]
        [?p :db/ident ?i]
        [(str ?i) ?s]
        [(clojure.string/starts-with? ?s ":user.property/")]]`
    );
    return parseCatalog(rows);
  } catch {
    return [];
  }
}

export interface RegistryOptions {
  markerTag: string;
  explicit: string[];
  undirected: string[];
}

/**
 * Rebuild and install the active vocabulary from the graph plus settings.
 * Returns the catalog so callers can show what else is available (the
 * Relations popover lists untagged properties as candidates).
 */
export async function refreshRegistry(opts: RegistryOptions): Promise<PropertyEntry[]> {
  const catalog = await fetchPropertyCatalog();
  const defs = attachIdents(
    buildRegistry({
      tagged: taggedWith(catalog, opts.markerTag || DEFAULT_MARKER_TAG),
      explicit: opts.explicit,
      undirected: opts.undirected,
    }),
    catalog
  );
  setRegistry(defs);
  return catalog;
}
