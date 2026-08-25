import type { ViewId } from "./types";

export type DepthMode = "recursive" | "flat";
export type DockBehavior = "mirror" | "overlay";

export interface PluginSettings {
  defaultView: ViewId;
  maxDepth: number;
  depthMode: DepthMode;
  showEmptyBlocks: boolean;
  animateViewSwitch: boolean;
  showRelationships: boolean;
  showRelationshipLabels: boolean;
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
