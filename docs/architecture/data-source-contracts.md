# PyRoboStudio Data-Source Contracts

**Date:** 2026-10-31
**Status:** Proposed (Phase 1). Versioning: `contract v1` (semver, additive-first). No artificial universal domain schema — a small typed envelope + per-domain payloads.

## 1. ObjectMapper envelope

Every record crossing the sidecar boundary (HTTP or WS) carries:

```ts
interface Envelope<T, K extends string> {
  schema_version: string;      // contract version of this envelope's payload
  source_id: string;           // data-source instance id
  origin: 'live' | 'recorded' | 'simulated' | 'derived';   // NEVER implied
  clock_domain: 'ros_time' | 'session_ns' | 'wall_clock' | 'sim_time';
  timestamp_ns: bigint;        // primary timestamp in the given clock domain
  recv_timestamp_ns?: bigint;  // arrival time, when different (replay latency)
  kind: K;                     // entity kind
  payload: T;                  // domain-specific, versioned independently
  stream_status?: 'ok' | 'sampled' | 'throttled' | 'lagging' | 'truncated';
}
```

Rules (master prompt §3.4, §10):
- Envelope always names its origin and data source; panels cannot substitute one for another.
- **That we have already dropped data** is a `stream_status` the UI must surface (badges); the shell strips nothing silently.
- Raw source bytes and authoritative storage stay outside the lossy display pipeline — the sidecar serves display-friendly views without overwriting the sources.

## 2. Capability reporting

```ts
interface CapabilitiesResponse {
  schema_version: '1';
  origin: 'live' | 'recorded' | 'simulated' | 'derived';
  ros_connected: boolean;      // downstream: rclpy/foxglove_bridge present?
  ros_distro?: string;         // e.g. "lyrical"; absent in pure offline mode
  capabilities: Capability[];  // stable strings, e.g.
  //  'ros.live.graph' | 'ros.live.subscribe' | 'ros.live.tf'
  //  'session.read' | 'session.playback_control' | 'mission.manifest'
  //  'terrain.read' | 'fleet.read' | 'frames.read' | 'vision.tracks'
  adapters: AdapterStatus[];   // name, version, loaded, degraded?, errors[]
  limits: { maxSubscriptions: number; maxBufferedMessages: number; ... };
}
```

Panels declare required capability refs (SDK); the shell disables/labels panels whose needs are unmet. Adapter degradation (e.g., live adapter crashed but recorded adapter is fine) is visible, never swallowed.

## 3. Domain interfaces (all versioned, only these exist in v1)

### 3.1 Graph (nodes/topics) — `kind: 'graph'`
```ts
interface GraphSnapshot {
  nodes: NodeInfo[];        // id, ns, lifecycle_state?, pub/sub topic ids
  topics: TopicInfo[];      // id, name, msg_type, qos: QosSummary, pub_count, sub_count
  edges: GraphEdge[];       // { node_id, topic_id, direction: 'pub'|'sub', qos_compat?: 'ok'|'incompatible'|'unknown' }
  services?: ServiceEndpoint[];
  actions?: ActionEndpoint[];
  activity?: { topic_id: string; hz?: number; last_rx_ns?: bigint; reliability: 'observed' | 'none' | 'unmeasured' };
}
```
An edge exists when DDS *discovery* showed it; **"no msg parsed" ≠ "edge healthy"** — activity is a separate observed/measured field (master prompt §8.1).

### 3.2 Messages — `kind: 'topic_sample'`
Bounded, explicit-limit views of decoded message payloads (from live WS or recorded decode). Large-buffer rules per §10.

### 3.3 TF/frames — `kind: 'frame' | 'tf_tree'`
Frame tree snapshot + buffered history ranges; every transform carries stamp + authority frame; the UI never interpolates across gaps without labeling opacity.

### 3.4 Sessions/events — `kind: 'session', 'session_event'`
```ts
interface Session {
  id: string; format: 'db3' | 'mcap' | 'parquet_derived';
  span: { start_ns: bigint; end_ns: bigint; clock_domain: ClockDomain };
  topics: TopicRef[]; events: EventRef[];  // diagnostics/forensic events from PyRoboReplay
  degraded?: string[];                     // e.g. "unsupported message types skipped at ingest"
}
```
Inherited PyRoboReplay limitations are surfaced (5 message types, silent skip behavior) — named `degraded`, never hidden.

### 3.5 Mission manifest (differentiator, Gap 1)
```ts
interface Mission {
  schema_version: '1';
  mission_id: string; runs: RunRef[]; robots: RobotRef[];
  artifacts: ArtifactRef[];  // uri, kind (session|frames|terrain|sim_run|journal), hash, time_base, schema_version
  provenance: { creator: string; created_ns: bigint; tool: string };
}
```
Cross-artifact joins are computed via declared mapping tables; when no mapping exists, the UI shows an explicit "not correlated" state.

### 3.6 Terrain — `kind: 'terrain_region'`
Proxy schema over PyTerrainMap queries (H3 cell ids, confidence, observation age, source robot, conflict flag). Coordinate transforms are PyTerrainMap's; the sidecar does not invent CRSs.

### 3.7 Fleet/network — `kind: 'robot', 'network_topology'`
SyncFleet journal summaries (peer, dataset, lag, last sync) and PyNetworkIntel topology graphs. Network topology and ROS computation graphs share the rendering infra (graphology) but have distinct data models with separate `kind`s.

## 4. Subscription/connection lifecycle

- Client requests subscriptions with explicit `{topic_id | session stream id, rate_class.max_hz, buffer}`; the sidecar enforces limits and reports `stream_status: 'throttled'`.
- Reconnection: exponential backoff + `CapabilitiesResponse` re-negotiation; the UI shows RECONNECTING and all cached data switches to stale rendering (§3.4 requirement).
- Errors are structured (`{code, message, retryable, origin}`), never bare strings.

## 5. Storage/persistence

- Browser: zustand `persist` for layout + settings + recent source list only. No message caching that could be mistaken for live.
- Sidecar: no database beyond what the PyRobo\* repos already own. Reader-only posture; when a writable store exists (sessions/annotations), it is SyncFleet-scoped SQLite per competitive analysis Gap 4 — deferred.
