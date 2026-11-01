import { PanelRegistry, type PanelPlugin } from "../sdk/contracts";
import { GraphExplorerPanel } from "./graph-explorer";
import { DataInspectorPanel } from "./inspector";
import { World3DPanel } from "./world3d";
import { TerrainPanel } from "./terrain";
import { ReplayPanel } from "./replay";
import { ChartsPanel } from "./charts";

export const graphExplorer: PanelPlugin = {
  id: "ros-graph-explorer",
  version: "1.0.0",
  contractVersion: 1,
  displayName: "ROS Graph Explorer",
  description: "Nodes, topics, pub/sub edges, QoS compatibility, activity",
  requiredCapabilities: ["graph.read"],
  component: GraphExplorerPanel,
};

export const dataInspector: PanelPlugin = {
  id: "data-inspector",
  version: "1.0.0",
  contractVersion: 1,
  displayName: "Data Inspector",
  description: "Topic list, metadata, bounded message samples",
  requiredCapabilities: ["topics.read"],
  component: DataInspectorPanel,
};

export const world3d: PanelPlugin = {
  id: "world-3d-viewer",
  version: "1.0.0",
  contractVersion: 1,
  displayName: "3D World Viewer",
  description: "TF frame tree, occupancy grid, camera overlay",
  requiredCapabilities: ["tf.read"],
  component: World3DPanel,
};

export const terrain: PanelPlugin = {
  id: "terrain-viewer",
  version: "1.0.0",
  contractVersion: 1,
  displayName: "Terrain Viewer",
  description: "H3 confidence/staleness/conflict layers",
  requiredCapabilities: ["terrain.read"],
  component: TerrainPanel,
};

export const replay: PanelPlugin = {
  id: "replay-timeline",
  version: "1.0.0",
  contractVersion: 1,
  displayName: "Replay Timeline",
  description: "Session playback with event markers and time cursor",
  requiredCapabilities: ["sessions.read"],
  component: ReplayPanel,
};

export const charts: PanelPlugin = {
  id: "charts",
  version: "1.0.0",
  contractVersion: 1,
  displayName: "Charts",
  description: "Derived numeric series from message fields",
  requiredCapabilities: ["topics.read"],
  component: ChartsPanel,
};

export const panelRegistry: PanelRegistry = new PanelRegistry();
for (const p of [graphExplorer, dataInspector, world3d, terrain, replay, charts]) {
  panelRegistry.register(p);
}

export * from "./graph-explorer";
export type { PanelPlugin };
