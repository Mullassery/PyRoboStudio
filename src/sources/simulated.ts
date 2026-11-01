import type {
  CapabilitySet,
  DataSource,
  GraphSnapshot,
  SessionEvent,
  SessionSummary,
  TerrainRegion,
  TfTree,
  TopicSample,
} from "../sdk/contracts";

const SIM_ROBOT_ROOT = "sim://arena";

function bigNow(): bigint {
  return BigInt(Date.now()) * 1_000_000n;
}

function buildGraph(): GraphSnapshot {
  const nodes = [
    { id: "n/robot1/teleop", ns: "/robot1", name: "teleop", kind: "node" as const },
    { id: "n/robot1/perception", ns: "/robot1", name: "perception", kind: "node" as const },
    { id: "n/robot1/planner", ns: "/robot1", name: "planner", kind: "node" as const },
    { id: "n/robot1/controller", ns: "/robot1", name: "controller", kind: "node" as const },
    { id: "n/robot2/planner", ns: "/robot2", name: "planner", kind: "node" as const },
    { id: "n/robot2/controller", ns: "/robot2", name: "controller", kind: "node" as const },
    { id: "n/sim/world", ns: "/sim", name: "world", kind: "node" as const },
  ];
  const topics = [
    { id: "t/cmd_vel_1", name: "/robot1/cmd_vel", msgType: "geometry_msgs/msg/Twist", pubCount: 1, subCount: 1, qos: { depth: 5, summary: "best_effort, depth 5" } },
    { id: "t/scan_1", name: "/robot1/scan", msgType: "sensor_msgs/msg/LaserScan", pubCount: 1, subCount: 1, qos: { depth: 10, summary: "best_effort, depth 10" } },
    { id: "t/odom_1", name: "/robot1/odom", msgType: "nav_msgs/msg/Odometry", pubCount: 1, subCount: 2, qos: { summary: "reliable, volatile" } },
    { id: "t/cmd_vel_2", name: "/robot2/cmd_vel", msgType: "geometry_msgs/msg/Twist", pubCount: 1, subCount: 1, qos: { depth: 5, summary: "best_effort, depth 5" } },
    { id: "t/tf", name: "/tf", msgType: "tf2_msgs/msg/TFMessage", pubCount: 3, subCount: 2, qos: { depth: 100, summary: "reliable, depth 100" } },
  ];
  const edges = [
    { id: "e1", nodeId: "n/robot1/teleop", topicId: "t/cmd_vel_1", direction: "pub" as const, qosCompat: "ok" as const },
    { id: "e2", nodeId: "n/robot1/controller", topicId: "t/cmd_vel_1", direction: "sub" as const, qosCompat: "ok" as const },
    { id: "e3", nodeId: "n/robot1/perception", topicId: "t/scan_1", direction: "pub" as const, qosCompat: "ok" as const },
    { id: "e4", nodeId: "n/robot1/controller", topicId: "t/scan_1", direction: "sub" as const, qosCompat: "ok" as const },
    { id: "e5", nodeId: "n/robot1/controller", topicId: "t/odom_1", direction: "sub" as const, qosCompat: "ok" as const },
    { id: "e6", nodeId: "n/sim/world", topicId: "t/odom_1", direction: "pub" as const, qosCompat: "ok" as const },
    { id: "e7", nodeId: "n/robot2/planner", topicId: "t/cmd_vel_2", direction: "pub" as const, qosCompat: "unknown" as const },
    { id: "e8", nodeId: "n/robot2/controller", topicId: "t/cmd_vel_2", direction: "sub" as const, qosCompat: "unknown" as const },
    { id: "e9", nodeId: "n/sim/world", topicId: "t/tf", direction: "pub" as const, qosCompat: "ok" as const },
    { id: "e10", nodeId: "n/robot1/controller", topicId: "t/tf", direction: "pub" as const, qosCompat: "ok" as const },
    { id: "e11", nodeId: "n/robot2/controller", topicId: "t/tf", direction: "sub" as const, qosCompat: "ok" as const },
    { id: "e12", nodeId: "n/robot1/planner", topicId: "t/odom_1", direction: "sub" as const, qosCompat: "ok" as const },
  ];
  const activity = [
    { topicId: "t/cmd_vel_1", hz: 20.0, lastRxNs: bigNow(), reliability: "observed" as const },
    { topicId: "t/scan_1", hz: 10.0, lastRxNs: bigNow(), reliability: "observed" as const },
    { topicId: "t/odom_1", reliability: "unmeasured" as const },
    { topicId: "t/cmd_vel_2", hz: 0, lastRxNs: bigNow(), reliability: "none" as const },
  ];
  return { nodes, topics, edges, activity };
}

const activityByTopic = new Map(buildGraph().activity.map((a) => [a.topicId, a]));

const graph: GraphSnapshot = buildGraph();

function topicSamples(topicId: string, max: number): TopicSample[] {
  const cfg: Record<string, (i: number) => unknown> = {
    "t/cmd_vel_1": (i: number) => ({ linear: { x: 0.5 + i * 0.01, y: 0, z: 0 }, angular: { z: Math.sin(i / 10) } }),
    "t/scan_1": () => ({ ranges: Array.from({ length: 8 }, (_, i) => 0.5 + (i % 4) * 0.25), angle_min: 0, angle_max: 3.14 }),
    "t/odom_1": (i: number) => ({ position: { x: i * 0.1, y: 0 }, orientation: { z: 0 } }),
    "t/cmd_vel_2": () => ({ linear: { x: 0, y: 0, z: 0 }, angular: { z: 0 } }),
  };
  const gen = cfg[topicId];
  const t0 = bigNow() - 10_000_000_000n;
  return Array.from({ length: Math.min(max, 10) }, (_, i) => ({
    topicId,
    seq: i,
    timestampNs: t0 + BigInt(i) * 100_000_000n,
    payload: gen ? gen(i) : { note: "unsupported message type" },
  }));
}

const tf: TfTree = {
  frames: [
    { frameId: "odom", authority: "sim/world" },
    { frameId: "base_link", parentId: "odom", translation: [1.0, 0.5, 0.0], rotation: [0, 0, 0, 1] },
    { frameId: "laser", parentId: "base_link", translation: [0.2, 0, 0.3], rotation: [0, 0, 0, 1] },
    { frameId: "camera", parentId: "base_link", translation: [0.2, 0, 0.5], rotation: [0, 0, 0, 1] },
  ],
};

const sessions: SessionSummary[] = [
  {
    id: "sim-session-001",
    format: "fixture",
    origin: "simulated",
    span: { startNs: 0n, endNs: 10_000_000_000n, clockDomain: "session_ns" },
    topicCount: 4,
    eventCount: 3,
    degraded: ["fixture data: not a real recording"],
  },
];

const sessionEvents: SessionEvent[] = [
  { id: "ev1", sessionId: "sim-session-001", timestampNs: 1_000_000_000n, kind: "communication_gap", label: "cmd_vel gap 0.4s", severity: "warn" },
  { id: "ev2", sessionId: "sim-session-001", timestampNs: 4_200_000_000n, kind: "navigation_deadlock", label: "controller stall near corner", severity: "error" },
  { id: "ev3", sessionId: "sim-session-001", timestampNs: 8_000_000_000n, kind: "recovery", label: "controller resumed", severity: "info" },
];

const terrain: TerrainRegion[] = Array.from({ length: 12 }, (_, i) => {
  const h3 = (1000000000000n + BigInt(i) * 777n).toString(16);
  const ageNs = BigInt(i % 4) * 3600_000_000_000n * 12n;
  const confidence = Math.max(0, 1 - Number(ageNs) / (86_400_000_000_000 * 2)) * 0.95;
  return {
    cellId: "8c0000000000" + h3.padStart(6, "0"),
    confidence: Math.round(confidence * 100) / 100,
    ageNs,
    sourceRobot: `robot${(i % 3) + 1}`,
    conflict: i === 5,
    centroid: [-74.0 + (i % 4) * 0.002, 40.7 + Math.floor(i / 4) * 0.002] as [number, number],
  };
});

const capabilities: CapabilitySet = {
  origin: "simulated",
  rosConnected: false,
  capabilities: ["graph.read", "topics.read", "tf.read", "sessions.read", "terrain.read"],
  adapterStatus: [{ name: "simulated", loaded: true, degraded: ["simulated data only"] }],
  limits: { maxSubscriptions: 8, maxBufferedMessages: 200 },
};

export function createSimulatedSource(): DataSource {
  return {
    id: "simulated",
    label: "Simulated ROS graph",
    origin: "simulated",
    status: "connected",
    statusDetail: "SIMULATED — fixture data, no ROS connection",
    capabilities,
    mapper: {
      graph: async () => graph,
      topicSamples: async (topicId, max) => topicSamples(topicId, max),
      tfTree: async () => tf,
      sessions: async () => sessions,
      sessionEvents: async () => sessionEvents,
      terrainRegions: async () => terrain,
    },
    disconnect: () => undefined,
  };
}

export const simActivity = activityByTopic;
export const SIM_ROBOT_ROOT_TOPIC_PREFIX = SIM_ROBOT_ROOT;
