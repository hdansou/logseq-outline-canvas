import type { RelKind, BuiltinKind } from "./types";
import { theme, relSlotColor } from "./colors";

/** Line styling for one relationship kind. Colors live in `colors.ts`. */
export interface RelStyle {
  /** Line width in canvas units */
  lw: number;
  /** Dash pattern; omitted = solid */
  dash?: number[];
  /** Arrowhead at the target end — directed relations only */
  arrowEnd?: boolean;
}

/** Where a kind came from. Built-ins win name collisions. */
export type KindSource = "builtin" | "tag" | "explicit";

/** One entry in the active vocabulary. */
export interface RelationDef {
  kind: RelKind;
  style: RelStyle;
  source: KindSource;
  /** Property ident, when the kind was discovered from the graph. */
  ident?: string;
}

/**
 * The five curated kinds. These ship with hand-picked styles and always win a
 * name collision, so a graph that happens to tag its own `supports` property
 * gets the style people already recognise.
 *
 * Dash patterns are unique per kind so the overlay stays readable for
 * colorblind users and in grayscale prints — same principle as the branch
 * palette in colors.ts.
 */
export const BUILTIN_STYLES: Record<BuiltinKind, RelStyle> = {
  // Symmetric association — the only undirected built-in, hence no arrowhead.
  relates_to: { lw: 1.3, dash: [6, 4] },
  // Directional dependency: A needs B.
  depends_on: { lw: 1.6, arrowEnd: true },
  // Evidential: A backs up B.
  supports: { lw: 1.5, dash: [10, 3], arrowEnd: true },
  // Evidential negative: A argues against B.
  contradicts: { lw: 1.5, dash: [3, 3], arrowEnd: true },
  // Composition across the hierarchy: A is a component of B.
  part_of: { lw: 1.4, dash: [9, 3, 2, 3], arrowEnd: true },
};

export const BUILTIN_KINDS = Object.keys(BUILTIN_STYLES) as BuiltinKind[];

const BUILTIN_SET = new Set<string>(BUILTIN_KINDS);

/** True for one of the five curated kinds. */
export function isBuiltinKind(kind: string): kind is BuiltinKind {
  return BUILTIN_SET.has(kind);
}

/**
 * Line styles available to user-defined kinds. Eight visually distinct dash
 * patterns; past that they repeat, and the Relations popover says so rather
 * than implying every kind is distinguishable.
 */
export const STYLE_SLOTS: RelStyle[] = [
  { lw: 1.5, dash: [8, 4] },
  { lw: 1.5, dash: [12, 3] },
  { lw: 1.4, dash: [4, 4] },
  { lw: 1.5, dash: [16, 4] },
  { lw: 1.4, dash: [6, 2, 2, 2] },
  { lw: 1.5, dash: [10, 5] },
  { lw: 1.4, dash: [3, 3, 8, 3] },
  { lw: 1.5, dash: [14, 2, 4, 2] },
];

/**
 * Deterministic palette slot for a kind name (FNV-1a). Hashing the *name*
 * rather than the list position is what keeps a kind's color and dash stable
 * when the user adds or removes other kinds.
 */
export function relPaletteIndex(kind: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < kind.length; i++) {
    hash ^= kind.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % STYLE_SLOTS.length;
}

/** A property carrying the marker tag, as discovered in the graph. */
export interface DiscoveredProperty {
  ident: string;
  title: string;
}

export interface RegistryInput {
  /** Properties carrying the marker tag. */
  tagged: DiscoveredProperty[];
  /** Names typed by the user, for properties that may not exist yet. */
  explicit: string[];
  /** Kinds the user has flipped to undirected. Built-ins are unaffected. */
  undirected?: string[];
}

/**
 * Merge the three sources into one vocabulary, in precedence order:
 * built-ins, then tag-discovered, then explicit names. First occurrence of a
 * name wins, so a built-in keeps its curated style and a name given both by
 * tag and by hand appears once.
 */
export function buildRegistry(input: RegistryInput): RelationDef[] {
  const undirected = new Set(input.undirected ?? []);
  const defs: RelationDef[] = BUILTIN_KINDS.map((kind) => ({
    kind,
    style: BUILTIN_STYLES[kind],
    source: "builtin" as const,
  }));
  const seen = new Set<string>(BUILTIN_KINDS);

  const addCustom = (kind: string, source: KindSource, ident?: string): void => {
    const name = kind.trim();
    if (!name || seen.has(name)) return;
    seen.add(name);
    // Direction can't be inferred from a name, so custom kinds are directed
    // by default (four of five built-ins are) unless flipped by the user.
    const slot = STYLE_SLOTS[relPaletteIndex(name)];
    defs.push({
      kind: name,
      style: { ...slot, arrowEnd: !undirected.has(name) },
      source,
      ident,
    });
  };

  for (const prop of input.tagged) addCustom(prop.title, "tag", prop.ident);
  for (const name of input.explicit) addCustom(name, "explicit");

  return defs;
}

/** The vocabulary in force. Defaults to built-ins until discovery runs. */
let activeRegistry: RelationDef[] = buildRegistry({ tagged: [], explicit: [] });

export function setRegistry(defs: RelationDef[]): void {
  activeRegistry = defs;
}

export function resetRegistry(): void {
  activeRegistry = buildRegistry({ tagged: [], explicit: [] });
}

export function registryKinds(): RelationDef[] {
  return activeRegistry;
}

/**
 * Style for a kind. An unregistered kind still draws — it falls back to its
 * palette slot — so a relationship never silently disappears just because the
 * registry is mid-refresh.
 */
export function relStyle(kind: RelKind): RelStyle {
  const def = activeRegistry.find((d) => d.kind === kind);
  if (def) return def.style;
  if (isBuiltinKind(kind)) return BUILTIN_STYLES[kind];
  return { ...STYLE_SLOTS[relPaletteIndex(kind)], arrowEnd: true };
}

/**
 * Property ident → kind, for every kind discovered from the graph. This is
 * what the adapter matches against: a lookup, rather than reconstructing
 * idents with a regex, which also makes matching rename-stable.
 */
export function identToKind(): Record<string, RelKind> {
  const out: Record<string, RelKind> = {};
  for (const def of activeRegistry) {
    if (def.ident) out[def.ident] = def.kind;
  }
  return out;
}

/**
 * Line color for a kind: the curated hue for a built-in, otherwise the branch
 * color at the kind's palette slot.
 */
export function relColor(kind: RelKind): string {
  if (isBuiltinKind(kind)) return theme().rel[kind];
  return relSlotColor(relPaletteIndex(kind));
}
