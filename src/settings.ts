import type { ViewId } from "./types";

export type DepthMode = "recursive" | "flat";
export type DockBehavior = "mirror" | "overlay";
/** When relationship connectors are drawn. See feature spec §14.1. */
export type EdgeVisibility = "lazy" | "always" | "off";
/** How far relationship connectors may reach. See feature spec §14.2. */
export type RelationshipScope = "page" | "graph";

export interface PluginSettings {
  defaultView: ViewId;
  maxDepth: number;
  depthMode: DepthMode;
  showEmptyBlocks: boolean;
  animateViewSwitch: boolean;
  showRelationships: boolean;
  showRelationshipLabels: boolean;
  edgeVisibility: EdgeVisibility;
  relationshipScope: RelationshipScope;
  /** Tag that marks a property as a relationship kind. */
  markerTag: string;
  /** Comma-separated extra kind names, for properties not (yet) tagged. */
  customKinds: string;
  /** Comma-separated kinds to draw without an arrowhead. */
  undirectedKinds: string;
  dockBehavior: DockBehavior;
  dockWidth: number;
}

export const DOCK_WIDTH_MIN = 20;
export const DOCK_WIDTH_MAX = 70;

export const DEFAULTS: PluginSettings = {
  defaultView: "tree",
  maxDepth: 3,
  depthMode: "recursive",
  showEmptyBlocks: false,
  animateViewSwitch: true,
  showRelationships: true,
  showRelationshipLabels: false,
  edgeVisibility: "lazy",
  relationshipScope: "page",
  markerTag: "semantic-connector",
  customKinds: "",
  undirectedKinds: "",
  dockBehavior: "mirror",
  dockWidth: 40,
};

export function registerSettings(): void {
  logseq.useSettingsSchema([
    {
      key: "defaultView",
      type: "enum",
      enumChoices: [
        "tree",
        "table",
        "roadmap_alt",
        "roadmap",
        "mind",
        "rtree",
        "fish",
        "tmap",
      ],
      enumPicker: "select",
      default: DEFAULTS.defaultView,
      title: "Default View",
      description: "Which diagram view to show when opening OutlineCanvas.",
    },
    {
      key: "maxDepth",
      type: "number",
      default: DEFAULTS.maxDepth,
      title: "Maximum Depth",
      description:
        "Maximum nesting depth to render (deeper nodes are flattened).",
    },
    {
      key: "depthMode",
      type: "enum",
      enumChoices: ["recursive", "flat"],
      enumPicker: "select",
      default: DEFAULTS.depthMode,
      title: "Depth Mode",
      description:
        "Recursive: show each depth level as independent connected nodes. Flat: collapse deeper levels into breadcrumb-style leaf labels.",
    },
    {
      key: "showEmptyBlocks",
      type: "boolean",
      default: DEFAULTS.showEmptyBlocks,
      title: "Show Empty Blocks",
      description: "Include blocks with no title in the diagram.",
    },
    {
      key: "animateViewSwitch",
      type: "boolean",
      default: DEFAULTS.animateViewSwitch,
      title: "Animate View Transitions",
      description: "Enable fade animation when switching diagram views.",
    },
    {
      key: "showRelationships",
      type: "boolean",
      default: DEFAULTS.showRelationships,
      title: "Show Relationship Connectors",
      description:
        "Draw lines between blocks that reference each other via 'relates_to', 'depends_on', 'supports', 'contradicts' or 'part_of' node properties (Tree Chart, Right Tree, Mind Map only).",
    },
    {
      key: "showRelationshipLabels",
      type: "boolean",
      default: DEFAULTS.showRelationshipLabels,
      title: "Label Relationship Connectors",
      description:
        "Display the property name ('depends_on', 'supports', …) as a small pill at the midpoint of each connector. Useful as a visual cue at first; turn off once the line styles are familiar.",
    },
    {
      key: "edgeVisibility",
      type: "enum",
      enumChoices: ["lazy", "always", "off"],
      enumPicker: "select",
      default: DEFAULTS.edgeVisibility,
      title: "Connector Visibility",
      description:
        "Lazy: connectors appear only for the node you click (default). Always: every connector stays drawn, matching what the PNG export produces. Off: no connectors, but relationship badges and the focus halo still show. The 'Show Relationship Connectors' toggle above overrides all three.",
    },
    {
      key: "relationshipScope",
      type: "enum",
      enumChoices: ["page", "graph"],
      enumPicker: "select",
      default: DEFAULTS.relationshipScope,
      title: "Relationship Scope",
      description:
        "Page: only draw connectors when both blocks are in the diagram (default). Graph: also draw connectors to and from blocks on other pages, shown as dashed 'ghost' nodes in a gutter on the right. Click a ghost to jump to that block.",
    },
    {
      key: "markerTag",
      type: "string",
      default: DEFAULTS.markerTag,
      title: "Relationship Marker Tag",
      description:
        "Tag a property with this to turn it into a relationship kind on the canvas. Add the tag from the property's own page. The five built-in kinds (relates_to, depends_on, supports, contradicts, part_of) work without it.",
    },
    {
      key: "customKinds",
      type: "string",
      default: DEFAULTS.customKinds,
      title: "Extra Relationship Kinds",
      description:
        "Comma-separated property names to draw as connectors, for properties you haven't tagged (or haven't created yet). Example: rebuts, cites, owns.",
    },
    {
      key: "undirectedKinds",
      type: "string",
      default: DEFAULTS.undirectedKinds,
      title: "Undirected Kinds",
      description:
        "Comma-separated kinds to draw without an arrowhead, for symmetric relationships. Custom kinds are directed by default.",
    },
    {
      key: "dockBehavior",
      type: "enum",
      enumChoices: ["mirror", "overlay"],
      enumPicker: "select",
      default: DEFAULTS.dockBehavior,
      title: "Dock Behavior",
      description:
        "Mirror: canvas reserves its strip in the host layout so the right sidebar opens to the left of the canvas. Overlay: canvas floats above the app without resizing it, sidebar opens under it. In both modes the sidebar can be toggled (T R) independently — the canvas only closes via ✕ or Escape.",
    },
    {
      key: "dockWidth",
      type: "number",
      default: DEFAULTS.dockWidth,
      title: "Canvas Width (vw)",
      description: `Width of the docked canvas as a percentage of the viewport (${DOCK_WIDTH_MIN}–${DOCK_WIDTH_MAX}). Drag the left edge of the canvas to adjust live; this number is the persisted value.`,
    },
  ]);
}

/** Split a comma-separated setting into trimmed, non-empty names. */
export function parseNameList(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function getSettings(): PluginSettings {
  return {
    defaultView:
      (logseq.settings?.defaultView as ViewId) ?? DEFAULTS.defaultView,
    maxDepth: (logseq.settings?.maxDepth as number) ?? DEFAULTS.maxDepth,
    depthMode:
      (logseq.settings?.depthMode as DepthMode) ?? DEFAULTS.depthMode,
    showEmptyBlocks:
      (logseq.settings?.showEmptyBlocks as boolean) ?? DEFAULTS.showEmptyBlocks,
    animateViewSwitch:
      (logseq.settings?.animateViewSwitch as boolean) ??
      DEFAULTS.animateViewSwitch,
    showRelationships:
      (logseq.settings?.showRelationships as boolean) ??
      DEFAULTS.showRelationships,
    showRelationshipLabels:
      (logseq.settings?.showRelationshipLabels as boolean) ??
      DEFAULTS.showRelationshipLabels,
    edgeVisibility:
      (logseq.settings?.edgeVisibility as EdgeVisibility) ??
      DEFAULTS.edgeVisibility,
    relationshipScope:
      (logseq.settings?.relationshipScope as RelationshipScope) ??
      DEFAULTS.relationshipScope,
    markerTag:
      (logseq.settings?.markerTag as string) ?? DEFAULTS.markerTag,
    customKinds:
      (logseq.settings?.customKinds as string) ?? DEFAULTS.customKinds,
    undirectedKinds:
      (logseq.settings?.undirectedKinds as string) ?? DEFAULTS.undirectedKinds,
    dockBehavior:
      (logseq.settings?.dockBehavior as DockBehavior) ?? DEFAULTS.dockBehavior,
    dockWidth: Math.max(
      DOCK_WIDTH_MIN,
      Math.min(
        DOCK_WIDTH_MAX,
        (logseq.settings?.dockWidth as number) ?? DEFAULTS.dockWidth
      )
    ),
  };
}
