import type { TreeNode, LayoutResult, RenderElement, Rect } from "../types";
import { theme } from "../colors";
import { measureBoxHeight, adaptiveWidth } from "../text";

const NODE_GAP_Y = 16;
const COL_GAP_X = 40;
const MIN_NODE_W = 180;
const TYPE_BADGE_H = 18;
const PROP_ROW_H = 20;
const PROP_LABEL_W = 90;

interface NodeSize {
  w: number;
  h: number;
}

/**
 * Calculate the size of an ERD entity box based on its content.
 * The box includes:
 * - Entity name (block text)
 * - Type badges (tags)
 * - Properties (from tag inheritance)
 */
function nodeSize(node: TreeNode): NodeSize {
  const t = theme();
  
  // Name dimensions
  const nameFontSize = 13;
  const nameFontWeight = 700;
  const nameW = adaptiveWidth(node.name, MIN_NODE_W, nameFontSize, nameFontWeight);
  const nameH = measureBoxHeight(node.name, nameW, nameFontSize, nameFontWeight, 40);
  
  // Type badges dimensions
  let typesH = 0;
  if (node.types && node.types.length > 0) {
    typesH = TYPE_BADGE_H + 4; // badge height + small gap
  }
  
  // Properties dimensions
  let propsH = 0;
  const props = node.properties;
  if (props) {
    const propCount = Object.keys(props).filter(k => 
      k !== "relates_to" && k !== "depends_on" && 
      k !== "Outgoing" && k !== "outgoing" &&
      k !== "tags"
    ).length;
    if (propCount > 0) {
      propsH = propCount * PROP_ROW_H + 8; // rows + padding
    }
  }
  
  const totalH = nameH + typesH + propsH + 16; // top/bottom padding
  
  return {
    w: Math.max(nameW, MIN_NODE_W),
    h: totalH,
  };
}

/**
 * Calculate subtree height for vertical positioning.
 */
function subtreeHeight(node: TreeNode): number {
  if (!node.children.length) return nodeSize(node).h;
  const childrenH = node.children.reduce((s, c) => s + subtreeHeight(c), 0)
    + (node.children.length - 1) * NODE_GAP_Y;
  return Math.max(nodeSize(node).h, childrenH);
}

/**
 * ERD Layout: positions entities as boxes with types and properties visible.
 * Uses a tree-like layout but renders each node as an ERD entity box.
 */
export function layoutErd(root: TreeNode, _maxDepth: number): LayoutResult {
  const els: RenderElement[] = [];
  const nodeRectsByUuid = new Map<string, Rect>();
  const t = theme();
  let maxX = 0;

  function drawEntityBox(
    node: TreeNode,
    x: number,
    y: number,
    w: number,
    h: number
  ): void {
    const size = nodeSize(node);
    
    // Main entity box
    els.push({
      type: "box",
      x, y, w, h,
      fill: t.surface,
      stroke: t.accent,
      lw: 2,
      rad: 8,
      text: node.name,
      textColor: t.text,
      textSize: 13,
      textWeight: 700,
      uuid: node.uuid,
    });
    
    if (node.uuid) {
      nodeRectsByUuid.set(node.uuid, { x, y, w, h });
    }
    
    let currentY = y + 30; // Start after name area
    
    // Draw type badges
    if (node.types && node.types.length > 0) {
      let badgeX = x + 8;
      for (const type of node.types) {
        const badgeW = type.length * 7 + 12;
        els.push({
          type: "box",
          x: badgeX,
          y: currentY,
          w: badgeW,
          h: TYPE_BADGE_H,
          fill: t.accentDim,
          stroke: t.accent,
          lw: 1,
          rad: 4,
        });
        els.push({
          type: "text",
          text: type,
          x: badgeX + badgeW / 2,
          y: currentY + TYPE_BADGE_H / 2,
          color: t.accentText,
          size: 10,
          weight: 500,
          align: "center",
          baseline: "middle",
        });
        badgeX += badgeW + 4;
      }
      currentY += TYPE_BADGE_H + 8;
    }
    
    // Draw properties
    if (node.properties) {
      const props = node.properties;
      for (const [key, value] of Object.entries(props)) {
        // Skip internal properties
        if (key === "relates_to" || key === "depends_on" || 
            key === "Outgoing" || key === "outgoing" ||
            key === "tags") {
          continue;
        }
        
        const valueStr = String(value);
        
        // Property label background
        els.push({
          type: "box",
          x: x + 8,
          y: currentY,
          w: PROP_LABEL_W,
          h: PROP_ROW_H,
          fill: t.bg,
          stroke: t.border,
          lw: 1,
          rad: 3,
        });
        
        // Property label text
        els.push({
          type: "text",
          text: key,
          x: x + 12,
          y: currentY + PROP_ROW_H / 2,
          color: t.muted,
          size: 10,
          weight: 500,
          align: "left",
          baseline: "middle",
        });
        
        // Property value text
        els.push({
          type: "text",
          text: valueStr.length > 30 ? valueStr.slice(0, 27) + "..." : valueStr,
          x: x + PROP_LABEL_W + 8,
          y: currentY + PROP_ROW_H / 2,
          color: t.text,
          size: 10,
          weight: 400,
          align: "left",
          baseline: "middle",
        });
        
        currentY += PROP_ROW_H;
      }
    }
  }

  function layoutNode(
    node: TreeNode,
    x: number,
    yStart: number
  ): { cy: number; height: number } {
    const size = nodeSize(node);
    const totalH = subtreeHeight(node);
    const cy = yStart + totalH / 2;
    const boxY = cy - size.h / 2;
    
    // Draw the entity box with all its content
    drawEntityBox(node, x, boxY, size.w, size.h);
    
    maxX = Math.max(maxX, x + size.w);
    
    if (node.children.length) {
      const childX = x + size.w + COL_GAP_X;
      const childrenTotalH = node.children.reduce((s, c) => s + subtreeHeight(c), 0)
        + (node.children.length - 1) * NODE_GAP_Y;
      let childY = yStart + (totalH - childrenTotalH) / 2;
      
      node.children.forEach((child) => {
        const childResult = layoutNode(child, childX, childY);
        
        // Bezier curve connecting parent to child
        const sx = x + size.w, sy = cy;
        const ex = childX, ey = childResult.cy;
        const cpx = (sx + ex) / 2;
        els.push({
          type: "curve",
          x1: sx, y1: sy,
          cx1: cpx, cy1: sy,
          cx2: cpx, cy2: ey,
          x2: ex, y2: ey,
          color: t.border + "50",
          lw: 1.5,
        });
        
        childY += childResult.height + NODE_GAP_Y;
      });
    }
    
    return { cy, height: totalH };
  }

  const result = layoutNode(root, 25, 25);
  return {
    elements: els,
    bounds: { x: 0, y: 0, w: maxX + 40, h: result.height + 50 },
    nodeRectsByUuid,
  };
}
