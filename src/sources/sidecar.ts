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

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`sidecar ${res.status} ${url}`);
  return normalizeBigints(await res.json()) as T;
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

function offlineSource(): DataSource {
  return {
    id: "sidecar",
    label: "Sidecar",
    origin: "recorded",
    status: "disconnected",
    statusDetail: "sidecar unreachable — start it with uv run sidecar",
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
  constructor(private caption: string) {
    void this.caption;
  }

  graph(): Promise<GraphSnapshot> {
    return fetchJson(`${BASE}/graph`);
  }

  topicSamples(topicId: string, max: number): Promise<TopicSample[]> {
    return fetchJson(`${BASE}/topics/${topicId}/samples?max=${max}`);
  }

  tfTree(): Promise<TfTree> {
    return fetchJson(`${BASE}/tf`);
  }

  sessions(): Promise<SessionSummary[]> {
    return fetchJson(`${BASE}/sessions`);
  }

  sessionEvents(sessionId: string): Promise<SessionEvent[]> {
    return fetchJson(`${BASE}/sessions/${sessionId}/events`);
  }

  terrainRegions(): Promise<TerrainRegion[]> {
    return fetchJson(`${BASE}/terrain/regions`);
  }
}

export class SidecarDataSource implements DataSource {
  id = "sidecar" as const;
  label = "ROS sidecar (local)";
  origin: DataSource["origin"];
  capabilities: CapabilitySet;

  constructor(caps: CapabilitySet) {
    this.capabilities = caps;
    this.origin = caps.origin;
  }

  get status(): DataSource["status"] {
    return this.capabilities.rosConnected ? "connected" : "degraded";
  }

  get statusDetail(): string {
    return this.capabilities.rosConnected
      ? `ROS ${this.capabilities.rosDistro ?? "?"}`
      : "offline mode: recorded data only";
  }

  mapper = new SidecarHttpMapper("sidecar");

  disconnect(): void {
    void this.origin;
  }
}
