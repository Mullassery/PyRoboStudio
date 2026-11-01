import type { ReactElement } from "react";

export type Origin = "live" | "recorded" | "simulated" | "derived";

export type ClockDomain = "ros_time" | "session_ns" | "wall_clock" | "sim_time";

export type StreamStatus = "ok" | "sampled" | "throttled" | "lagging" | "truncated";

export type EntityKind =
  | "node"
  | "topic"
  | "service"
  | "action"
  | "robot"
  | "session"
  | "session_event"
  | "frame"
  | "terrain_region"
  | "track";

export interface Envelope<T, K extends EntityKind = EntityKind> {
  schemaVersion: string;
  sourceId: string;
  origin: Origin;
  clockDomain: ClockDomain;
  timestampNs: bigint;
  kind: K;
  payload: T;
  streamStatus?: StreamStatus;
}

export interface CapabilitySet {
  origin: Origin;
  rosConnected: boolean;
  rosDistro?: string;
  capabilities: string[];
  adapterStatus: Array<{ name: string; loaded: boolean; degraded?: string[]; errors?: string[] }>;
  limits: { maxSubscriptions: number; maxBufferedMessages: number };
}

export interface TopicQosSummary {
  BestEffort?: unknown;
  volatile?: unknown;
  depth?: number;
  summary: string;
}

export interface GraphNode {
  id: string;
  ns: string;
  name: string;
  kind: "node" | "service_server";
}

export interface GraphTopic {
  id: string;
  name: string;
  msgType: string;
  qos?: TopicQosSummary;
  pubCount: number;
  subCount: number;
}

export type GraphEdgeDirection = "pub" | "sub" | "service";

export interface GraphEdge {
  id: string;
  nodeId: string;
  topicId: string;
  direction: GraphEdgeDirection;
  qosCompat: "ok" | "incompatible" | "unknown";
}

export interface GraphActivity {
  topicId: string;
  hz?: number;
  lastRxNs?: bigint;
  reliability: "observed" | "none" | "unmeasured";
}

export interface GraphSnapshot {
  nodes: GraphNode[];
  topics: GraphTopic[];
  edges: GraphEdge[];
  activity: GraphActivity[];
}

export interface TopicSample {
  topicId: string;
  seq: number;
  timestampNs: bigint;
  payload: unknown;
}

export interface TfFrame {
  frameId: string;
  parentId?: string;
  latestNs?: bigint;
  authority?: string;
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
}

export interface TfTree {
  frames: TfFrame[];
}

export interface SessionSummary {
  id: string;
  format: string;
  origin: Origin;
  span: { startNs: bigint; endNs: bigint; clockDomain: ClockDomain };
  topicCount: number;
  eventCount: number;
  degraded: string[];
}

export interface SessionEvent {
  id: string;
  sessionId: string;
  timestampNs: bigint;
  kind: string;
  label: string;
  severity: "info" | "warn" | "error";
}

export interface TerrainRegion {
  cellId: string;
  confidence: number;
  ageNs: bigint;
  sourceRobot: string;
  conflict: boolean;
  centroid: [number, number];
}

export interface DataMapper {
  graph(): Promise<GraphSnapshot>;
  topicSamples(topicId: string, max: number): Promise<TopicSample[]>;
  tfTree(): Promise<TfTree>;
  sessions(): Promise<SessionSummary[]>;
  sessionEvents(sessionId: string): Promise<SessionEvent[]>;
  terrainRegions(): Promise<TerrainRegion[]>;
}

export interface DataSource {
  id: string;
  label: string;
  origin: Origin;
  status: "connected" | "connecting" | "disconnected" | "error" | "degraded";
  statusDetail?: string;
  capabilities: CapabilitySet;
  mapper: DataMapper;
  disconnect(): void;
}

export interface PanelConfigValues {
  [key: string]: unknown;
}

export interface SelectionRef {
  kind: EntityKind;
  sourceId: string;
  id: string;
  label: string;
}

export interface TimeDomain {
  startNs: bigint;
  endNs: bigint;
  clockDomain: ClockDomain;
}

export interface Notifications {
  panel(level: "info" | "warn" | "error", msg: string): void;
}

export interface CleanupRegistry {
  add(fn: () => void): void;
  dispose(): void;
}

export interface PanelMountContextBase {
  workspaceId: string;
  panelId: string;
  source: DataSource;
  config: {
    get<T>(key: string, fallback: T): T;
    set(key: string, value: unknown): void;
    subscribe(listener: () => void): () => void;
  };
  selection: {
    publish(ref: SelectionRef | null): void;
    subscribe(listener: (ref: SelectionRef | null) => void): () => void;
    current(): SelectionRef | null;
  };
  time: {
    declareDomain(domain: TimeDomain | null): void;
    domain(): TimeDomain | null;
    cursor(): bigint | null;
    subscribe(listener: (t: bigint | null, d: TimeDomain | null) => void): () => void;
    seek(t: bigint, clockDomain: ClockDomain): void;
  };
  notify: (level: "warn" | "error" | "info", msg: string) => void;
  cleanup: CleanupRegistry;
  configValues: PanelConfigValues;
}

export interface PanelPlugin {
  id: string;
  version: string;
  contractVersion: 1;
  displayName: string;
  description: string;
  requiredCapabilities?: string[];
  requiresOrigin?: Origin[];
  component: PanelComponent;
}

export type PanelComponent = (props: { ctx: PanelMountContextBase }) => ReactElement;

export class PanelRegistry {
  private panels = new Map<string, PanelPlugin>();

  register(plugin: PanelPlugin): void {
    if (this.panels.has(plugin.id)) {
      throw new Error(`panel id collision: ${plugin.id}`);
    }
    this.panels.set(plugin.id, plugin);
  }

  get(id: string): PanelPlugin | undefined {
    return this.panels.get(id);
  }

  list(): PanelPlugin[] {
    return [...this.panels.values()];
  }
}

export const makeTimeWindow = (startNs: bigint, endNs: bigint, clockDomain: ClockDomain): TimeDomain => ({
  startNs,
  endNs,
  clockDomain,
});
