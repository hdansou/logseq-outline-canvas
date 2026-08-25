/**
 * Kinds of cross-hierarchy relationships rendered as connectors. Each kind is
 * driven by a user-created Logseq DB property of type `:node` with a matching
 * ident. Line style lives in `relations.ts`, color in the theme's `rel` map.
 */
export type RelKind =
  | "relates_to"
  | "depends_on"
  | "supports"
  | "contradicts"
  | "part_of";

/** An outgoing relationship edge declared on a block */
export interface NodeRef {
  kind: RelKind;
  targetUuid: string;
}

/** Internal tree node converted from Logseq BlockEntity */
export interface TreeNode {
  name: string;
  children: TreeNode[];
  depth: number;
  id: number;
  uuid: string;
  refs?: NodeRef[];
}

/** Positioned box element */
export interface BoxElement {
  type: "box";
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  stroke: string;
  lw: number;
  rad: number;
  text?: string;
  textColor?: string;
  textSize?: number;
  textWeight?: number;
  dash?: number[];
  uuid?: string;
}

/** Straight line element */
export interface LineElement {
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  lw: number;
  /** Dash pattern for the line; solid when omitted. */
  dash?: number[];
  /** When true, draw a filled arrowhead at (x2, y2) pointing along the line direction. */
  arrowEnd?: boolean;
}

/** Cubic bezier curve element */
export interface CurveElement {
  type: "curve";
  x1: number;
  y1: number;
  cx1: number;
  cy1: number;
  cx2: number;
  cy2: number;
  x2: number;
  y2: number;
  color: string;
  lw: number;
  /** Dash pattern; solid when omitted. */
  dash?: number[];
  /** When true, draw an arrowhead at (x2, y2) tangent to the curve. */
  arrowEnd?: boolean;
}

/** Standalone text element */
export interface TextElement {
  type: "text";
  text: string;
  x: number;
  y: number;
  color: string;
  size: number;
  weight: number;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
}

/** Filled circle element */
export interface DotElement {
  type: "dot";
  x: number;
  y: number;
  r: number;
  color: string;
}

export type RenderElement =
  | BoxElement
  | LineElement
  | CurveElement
  | TextElement
  | DotElement;

/** Rectangle in canvas coordinates */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Output of a layout engine */
export interface LayoutResult {
  elements: RenderElement[];
  bounds: { x: number; y: number; w: number; h: number };
  /**
   * Optional map of node UUID → laid-out rect. Populated by views that
   * support connector overlays (Tree Chart, Right Tree, Mind Map). Other
   * views may leave this undefined.
   */
  nodeRectsByUuid?: Map<string, Rect>;
}

/** View identifiers */
export type ViewId =
  | "tree"
  | "table"
  | "roadmap_alt"
  | "roadmap"
  | "mind"
  | "rtree"
  | "fish"
  | "tmap";

/** View registry entry */
export interface ViewDef {
  id: ViewId;
  label: string;
  icon: string;
  layout: (root: TreeNode, maxDepth: number) => LayoutResult;
}

/** Pan/zoom transform state */
export interface Transform {
  ox: number;
  oy: number;
  scale: number;
}
