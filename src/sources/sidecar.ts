import type {
  CapabilitySet,
  DataMapper,
  DataSource,
  GraphSnapshot,
  SessionEvent,
  SessionSummary,
  TerrainRegion,
  TfTree,
  TopicSample,
} from "../sdk/contracts";

const BASE = "/api";

const NS_FIELDS = [
  "timestampNs",
  "lastRxNs",
  "latestNs",
  "ageNs",
  "startNs",
  "endNs",
] as const;

export function normalizeBigints(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeBigints);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] =
        (NS_FIELDS as readonly string[]).includes(k) && typeof v === "number"
          ? BigInt(Math.round(v))
          : normalizeBigints(v);
    }
    return out;
  }
  return value;
}

export type SidecarHealth = "connected" | "degraded" | "disconnected";

export interface SidecarHealthState {
  health: SidecarHealth;
  lastError: string | null;
  lastTxAt: number | null;
}

async function fetchJson<T>(url: string, health: SidecarHealthState): Promise<T> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`sidecar ${res.status} ${url}`);
    health.health = "degraded";
    health.lastError = null;
    health.lastTxAt = Date.now();
    return normalizeBigints(await res.json()) as T;
  } catch (e) {
    health.health = "disconnected";
    health.lastError = `sidecar unreachable: ${(e as Error).message}`;
    throw e;
  }
}

async function healthy(): Promise<CapabilitySet | { offline: true }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 800);
  try {
    const res = await fetch(`${BASE}/capabilities`, { signal: controller.signal });
    const json = (await res.json()) as CapabilitySet;
    return json;
  } catch {
    return { offline: true } as const;
  } finally {
    clearTimeout(t);
  }
}

export function createOfflineSidecarSource(): DataSource {
  return {
    id: "sidecar",
    label: "Sidecar",
    origin: "recorded",
    status: "disconnected",
    statusDetail: "disconnected: sidecar unreachable — uv run uvicorn pyrobostudio_sidecar.server:app",
    capabilities: { origin: "recorded", rosConnected: false, capabilities: [], adapterStatus: [], limits: { maxSubscriptions: 0, maxBufferedMessages: 0 } },
    mapper: {
      graph: async () => ({ nodes: [], topics: [], edges: [], activity: [] }),
      topicSamples: async () => [],
      tfTree: async () => ({ frames: [] }),
      sessions: async () => [],
      sessionEvents: async () => [],
      terrainRegions: async () => [],
    },
    disconnect: () => undefined,
  };
}

export function sidecarStatus(): ReturnType<typeof healthy> {
  return healthy();
}

export async function createSidecarSource(): Promise<DataSource | { offline: true }> {
  const caps = await healthy();
  if ("offline" in caps) return { offline: true };
  return new SidecarDataSource(caps);
}

class SidecarHttpMapper implements DataMapper {
  constructor(private health: SidecarHealthState) {
    void this.health;
  }

  graph(): Promise<GraphSnapshot> {
    return fetchJson(`${BASE}/graph`, this.health);
  }

  topicSamples(topicId: string, max: number): Promise<TopicSample[]> {
    return fetchJson(`${BASE}/topics/${topicId}/samples?max=${max}`, this.health);
  }

  tfTree(): Promise<TfTree> {
    return fetchJson(`${BASE}/tf`, this.health);
  }

  sessions(): Promise<SessionSummary[]> {
    return fetchJson(`${BASE}/sessions`, this.health);
  }

  sessionEvents(sessionId: string): Promise<SessionEvent[]> {
    return fetchJson(`${BASE}/sessions/${sessionId}/events`, this.health);
  }

  terrainRegions(): Promise<TerrainRegion[]> {
    return fetchJson(`${BASE}/terrain/regions`, this.health);
  }
}

export class SidecarDataSource implements DataSource {
  id = "sidecar" as const;
  label = "ROS sidecar (local)";
  origin: DataSource["origin"];
  capabilities: CapabilitySet;
  private health: SidecarHealthState = { health: "degraded", lastError: null, lastTxAt: null };

  constructor(caps: CapabilitySet) {
    this.capabilities = caps;
    this.origin = caps.origin;
  }

  get status(): DataSource["status"] {
    if (this.health.health === "disconnected") return "disconnected";
    return this.capabilities.rosConnected ? "connected" : "degraded";
  }

  get statusDetail(): string {
    if (this.health.health === "disconnected") {
      return this.health.lastError ?? "disconnected: sidecar unreachable";
    }
    return this.capabilities.rosConnected
      ? `ROS ${this.capabilities.rosDistro ?? "?"}`
      : "recorded session served · no live ROS on this host";
  }

  mapper = new SidecarHttpMapper(this.health);

  disconnect(): void {
    this.health = { health: "disconnected", lastError: null, lastTxAt: null };
  }
}
