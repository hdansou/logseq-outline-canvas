import type { RelKind } from "./types";

/** Deuteranopia-safe color palette — 8 colors with unique dash patterns */
export interface BranchColor {
  /** Solid fill (18% alpha) */
  fill: string;
  /** Stroke color */
  stroke: string;
  /** Text color (for labels on the fill background) */
  text: string;
  /** Leaf fill (12% alpha) */
  leafFill: string;
  /** Leaf stroke (35% alpha) */
  leafStroke: string;
  /** Background zone fill (8% alpha) */
  zone: string;
  /** Unique dash pattern for accessibility */
  dash: number[];
}

/** Semantic theme tokens that change between light and dark */
export interface Theme {
  mode: "light" | "dark";
  /** Canvas background */
  bg: string;
  /** Root node / heading text */
  rootText: string;
  /** Leaf node text */
  leafText: string;
  /** Muted/secondary text */
  muted: string;
  /** Root node fill */
  rootFill: string;
  /** Root node stroke */
  rootStroke: string;
  /** Root node glow (semi-transparent) */
  rootGlow1: string;
  rootGlow2: string;
  /** Root box background for mind-map/right-tree style */
  rootBoxFill: string;
  /** Table background */
  tableBg: string;
  /** Table header background */
  tableHeaderBg: string;
  /** Table border */
  tableBorder: string;
  /** Table stripe (alternating row) */
  tableStripe: string;
  /** Accent color (spine, separators) */
  accent: string;
  accentDim: string;
  accentText: string;
  /** Spine dot inner fill */
  spineDotInner: string;
  /** Connector overlay: line color per relationship kind */
  rel: Record<RelKind, string>;
  /** Outgoing-count badge fill */
  badgeOut: string;
  /** Incoming-count badge fill */
  badgeIn: string;
  /** Branch colors */
  colors: BranchColor[];
}

const DARK_COLORS: BranchColor[] = [
  { fill: "#3e63dd18", stroke: "#3e63dd", text: "#8da4ef", leafFill: "#3e63dd0c", leafStroke: "#3e63dd35", zone: "#3e63dd08", dash: [8, 4] },
  { fill: "#f7680018", stroke: "#f76800", text: "#ffa057", leafFill: "#f768000c", leafStroke: "#f7680035", zone: "#f7680008", dash: [12, 3] },
  { fill: "#6e56cf18", stroke: "#6e56cf", text: "#b4a3e8", leafFill: "#6e56cf0c", leafStroke: "#6e56cf35", zone: "#6e56cf08", dash: [4, 4] },
  { fill: "#00a2c718", stroke: "#00a2c7", text: "#6cd4e8", leafFill: "#00a2c70c", leafStroke: "#00a2c735", zone: "#00a2c708", dash: [16, 4] },
  { fill: "#e5484d18", stroke: "#e5484d", text: "#ff9592", leafFill: "#e5484d0c", leafStroke: "#e5484d35", zone: "#e5484d08", dash: [6, 2, 2, 2] },
  { fill: "#d6409f18", stroke: "#d6409f", text: "#ef8fcc", leafFill: "#d6409f0c", leafStroke: "#d6409f35", zone: "#d6409f08", dash: [10, 5] },
  { fill: "#46a75818", stroke: "#46a758", text: "#7ccf8e", leafFill: "#46a7580c", leafStroke: "#46a75835", zone: "#46a75808", dash: [3, 3] },
  { fill: "#ffe07018", stroke: "#ffe070", text: "#f5d56a", leafFill: "#ffe0700c", leafStroke: "#ffe07035", zone: "#ffe07008", dash: [14, 2, 4, 2] },
];

const LIGHT_COLORS: BranchColor[] = [
  { fill: "#3e63dd15", stroke: "#3e63dd", text: "#2a4ec7", leafFill: "#3e63dd0a", leafStroke: "#3e63dd40", zone: "#3e63dd08", dash: [8, 4] },
  { fill: "#f7680015", stroke: "#e05500", text: "#c44d00", leafFill: "#f768000a", leafStroke: "#f7680040", zone: "#f7680008", dash: [12, 3] },
  { fill: "#6e56cf15", stroke: "#6e56cf", text: "#5746a8", leafFill: "#6e56cf0a", leafStroke: "#6e56cf40", zone: "#6e56cf08", dash: [4, 4] },
  { fill: "#00a2c715", stroke: "#0090b0", text: "#007a96", leafFill: "#00a2c70a", leafStroke: "#00a2c740", zone: "#00a2c708", dash: [16, 4] },
  { fill: "#e5484d15", stroke: "#dc3d43", text: "#c33", leafFill: "#e5484d0a", leafStroke: "#e5484d40", zone: "#e5484d08", dash: [6, 2, 2, 2] },
  { fill: "#d6409f15", stroke: "#d6409f", text: "#b5338a", leafFill: "#d6409f0a", leafStroke: "#d6409f40", zone: "#d6409f08", dash: [10, 5] },
  { fill: "#46a75815", stroke: "#388e3c", text: "#2d7a30", leafFill: "#46a7580a", leafStroke: "#46a75840", zone: "#46a75808", dash: [3, 3] },
  { fill: "#d4a01515", stroke: "#b8860b", text: "#8a6508", leafFill: "#d4a0150a", leafStroke: "#d4a01540", zone: "#d4a01508", dash: [14, 2, 4, 2] },
];

const DARK_THEME: Theme = {
  mode: "dark",
  bg: "#0d0f14",
  rootText: "#edeef0",
  leafText: "#a8a8b2",
  muted: "#6f7380",
  rootFill: "#46a75818",
  rootStroke: "#46a758",
  rootGlow1: "#46a75808",
  rootGlow2: "#46a75810",
  rootBoxFill: "#1a1d2480",
  tableBg: "#111318",
  tableHeaderBg: "#1a1d24",
  tableBorder: "#2b2d35",
  tableStripe: "#ffffff04",
  accent: "#46a758",
  accentDim: "#46a75820",
  accentText: "#7ccf8e",
  spineDotInner: "#0d0f14",
  rel: {
    relates_to: "#a8a8b2a0",
    depends_on: "#f76800d8",
    supports: "#46a758d8",
    contradicts: "#e5484dd8",
    part_of: "#6e56cfd8",
  },
  badgeOut: "#f76800d8",
  badgeIn: "#a8a8b2a0",
  colors: DARK_COLORS,
};

const LIGHT_THEME: Theme = {
  mode: "light",
  bg: "#f8f9fa",
  rootText: "#1a1a2e",
  leafText: "#555568",
  muted: "#8888a0",
  rootFill: "#46a75815",
  rootStroke: "#388e3c",
  rootGlow1: "#46a75808",
  rootGlow2: "#46a75810",
  rootBoxFill: "#ffffff90",
  tableBg: "#ffffff",
  tableHeaderBg: "#f0f1f3",
  tableBorder: "#d8dae0",
  tableStripe: "#00000006",
  accent: "#388e3c",
  accentDim: "#46a75818",
  accentText: "#2d7a30",
  spineDotInner: "#f8f9fa",
  rel: {
    relates_to: "#555568a0",
    depends_on: "#c44d00d8",
    supports: "#2d7a30d8",
    contradicts: "#dc3d43d8",
    part_of: "#5746a8d8",
  },
  badgeOut: "#c44d00d8",
  badgeIn: "#555568a0",
  colors: LIGHT_COLORS,
};

/** Active theme — mutable, updated by setTheme() */
let activeTheme: Theme = DARK_THEME;

/** Get the current theme */
export function theme(): Theme {
  return activeTheme;
}

/** Switch between light and dark themes */
export function setTheme(mode: "light" | "dark"): void {
  activeTheme = mode === "light" ? LIGHT_THEME : DARK_THEME;
}

/** Get color for a branch index from the active theme */
export function branchColor(index: number): BranchColor {
  const cols = activeTheme.colors;
  return cols[index % cols.length];
}

// Convenience accessors that read from active theme
export function BG(): string { return activeTheme.bg; }
export function ROOT_TEXT(): string { return activeTheme.rootText; }
export function LEAF_TEXT(): string { return activeTheme.leafText; }
export function MUTED(): string { return activeTheme.muted; }

/** Font family for labels */
export const FONT = "'IBM Plex Mono', 'SF Mono', monospace";
