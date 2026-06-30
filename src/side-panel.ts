import type { TreeNode } from "../types";

/**
 * Side panel for displaying selected ERD node details.
 * Shows: Entity Name, UUID, Node Types, Properties, Outgoing Relationships
 */

export interface SidePanelConfig {
  containerId: string;
}

export class SidePanel {
  private container: HTMLElement | null = null;
  private isVisible = false;

  constructor(config: SidePanelConfig) {
    const el = document.getElementById(config.containerId);
    if (el) {
      this.container = el;
    }
  }

  /**
   * Show node details in the side panel.
   * All content is read-only.
   */
  show(node: TreeNode | null): void {
    if (!this.container) return;

    if (!node) {
      this.hide();
      return;
    }

    this.isVisible = true;
    this.container.style.display = "block";
    this.container.innerHTML = this.renderNodeDetails(node);
  }

  /**
   * Hide the side panel.
   */
  hide(): void {
    if (!this.container) return;
    this.isVisible = false;
    this.container.style.display = "none";
    this.container.innerHTML = "";
  }

  /**
   * Check if the panel is currently visible.
   */
  getVisible(): boolean {
    return this.isVisible;
  }

  /**
   * Render node details as HTML.
   */
  private renderNodeDetails(node: TreeNode): string {
    const sections: string[] = [];

    // Entity Name
    sections.push(`
      <div class="oc-sp-section">
        <div class="oc-sp-label">Entity Name</div>
        <div class="oc-sp-value oc-sp-entity-name">${escapeHtml(node.name)}</div>
      </div>
    `);

    // UUID
    if (node.uuid) {
      const shortUuid = node.uuid.slice(0, 8);
      sections.push(`
        <div class="oc-sp-section">
          <div class="oc-sp-label">UUID</div>
          <div class="oc-sp-value oc-sp-uuid" title="${escapeHtml(node.uuid)}">${escapeHtml(shortUuid)}...</div>
        </div>
      `);
    }

    // Node Types (from tags)
    if (node.types && node.types.length > 0) {
      const typesHtml = node.types
        .map((t) => `<span class="oc-sp-type-badge">${escapeHtml(t)}</span>`)
        .join("");
      sections.push(`
        <div class="oc-sp-section">
          <div class="oc-sp-label">Node Types</div>
          <div class="oc-sp-types">${typesHtml}</div>
        </div>
      `);
    }

    // Properties
    if (node.properties && Object.keys(node.properties).length > 0) {
      const propsHtml = Object.entries(node.properties)
        .map(([key, value]) => `
          <div class="oc-sp-property-row">
            <span class="oc-sp-prop-key">${escapeHtml(key)}</span>
            <span class="oc-sp-prop-value">${escapeHtml(String(value))}</span>
          </div>
        `)
        .join("");
      sections.push(`
        <div class="oc-sp-section">
          <div class="oc-sp-label">Properties</div>
          <div class="oc-sp-properties">${propsHtml}</div>
        </div>
      `);
    }

    // Outgoing Relationships
    if (node.refs && node.refs.length > 0) {
      const outgoingRefs = node.refs.filter((r) => r.kind === "outgoing");
      if (outgoingRefs.length > 0) {
        const refsHtml = outgoingRefs
          .map((r) => `<div class="oc-sp-ref-item">→ ${escapeHtml(r.targetUuid.slice(0, 8))}...</div>`)
          .join("");
        sections.push(`
          <div class="oc-sp-section">
            <div class="oc-sp-label">Outgoing Relationships</div>
            <div class="oc-sp-refs">${refsHtml}</div>
          </div>
        `);
      }
    }

    return `
      <div class="oc-side-panel">
        <div class="oc-sp-header">
          <span class="oc-sp-title">Entity Details</span>
          <button class="oc-sp-close" id="oc-sp-close-btn" title="Close">×</button>
        </div>
        <div class="oc-sp-content">
          ${sections.join("")}
        </div>
      </div>
    `;
  }
}

/**
 * Escape HTML special characters.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * CSS styles for the side panel.
 */
export const SIDE_PANEL_STYLES = `
.oc-side-panel {
  position: absolute;
  top: 60px;
  right: 12px;
  width: 280px;
  max-height: calc(100vh - 120px);
  background: var(--oc-surface);
  border: 1px solid var(--oc-border);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  z-index: 100;
  display: none;
}

.oc-sp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--oc-border);
  background: var(--oc-bg);
}

.oc-sp-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--oc-text);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.oc-sp-close {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  background: transparent;
  border: 1px solid var(--oc-border);
  color: var(--oc-text-muted);
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.12s;
}

.oc-sp-close:hover {
  border-color: #e5484d;
  color: #ff9592;
  background: #e5484d18;
}

.oc-sp-content {
  padding: 12px;
  overflow-y: auto;
  max-height: calc(100vh - 140px);
}

.oc-sp-section {
  margin-bottom: 16px;
}

.oc-sp-section:last-child {
  margin-bottom: 0;
}

.oc-sp-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--oc-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
}

.oc-sp-value {
  font-size: 12px;
  color: var(--oc-text);
  line-height: 1.4;
}

.oc-sp-entity-name {
  font-weight: 600;
  font-size: 13px;
}

.oc-sp-uuid {
  font-family: var(--oc-font);
  font-size: 10px;
  color: var(--oc-text-muted);
}

.oc-sp-types {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.oc-sp-type-badge {
  display: inline-block;
  padding: 3px 8px;
  background: var(--oc-accent-dim);
  border: 1px solid var(--oc-accent);
  border-radius: 4px;
  font-size: 10px;
  font-weight: 500;
  color: var(--oc-accent-text);
}

.oc-sp-properties {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.oc-sp-property-row {
  display: flex;
  flex-direction: column;
  padding: 6px 8px;
  background: var(--oc-bg);
  border: 1px solid var(--oc-border);
  border-radius: 4px;
}

.oc-sp-prop-key {
  font-size: 10px;
  font-weight: 500;
  color: var(--oc-text-muted);
  margin-bottom: 2px;
}

.oc-sp-prop-value {
  font-size: 11px;
  color: var(--oc-text);
  word-break: break-word;
}

.oc-sp-refs {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.oc-sp-ref-item {
  font-size: 11px;
  color: var(--oc-text);
  font-family: var(--oc-font);
  padding: 4px 6px;
  background: var(--oc-bg);
  border: 1px solid var(--oc-border);
  border-radius: 4px;
}
`;
