import type { EntityKind, SelectionRef } from "./contracts";

/**
 * Per-panel mapping table: which selection EntityKinds a panel can correlate
 * to its own data. Anything else must surface an explicit "not correlated"
 * state (never silently ignored) per the Phase 5 acceptance rule.
 */
export const SELECTION_MAPPINGS: Record<string, EntityKind[]> = {
  "ros-graph-explorer": ["node", "topic"],
  "data-inspector": ["topic", "node"],
  "world-3d-viewer": ["frame", "node"],
  "terrain-viewer": ["robot", "node", "terrain_region"],
  "replay-timeline": ["session_event", "topic"],
  charts: ["topic"],
  "network-topology": [],
};

export function supportedKindsFor(panelId: string): EntityKind[] {
  // ctx.panelId is the dockview key ("panel-<pluginId>"); accept both forms
  const key = panelId.startsWith("panel-") ? panelId.slice("panel-".length) : panelId;
  return SELECTION_MAPPINGS[key] ?? [];
}

export function isCorrelated(panelId: string, ref: SelectionRef | null): boolean {
  if (!ref) return true;
  return supportedKindsFor(panelId).includes(ref.kind);
}

export function uncorrelatedReason(panelId: string, ref: SelectionRef): string {
  const supported = supportedKindsFor(panelId);
  if (supported.length === 0) {
    return `not correlated: this panel has no mapping for "${ref.kind}" selections yet`;
  }
  return `not correlated: "${ref.kind}" selections don't map to this panel (supported: ${supported.join(", ")})`;
}
