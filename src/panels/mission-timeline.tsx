import { useEffect, useState } from "react";
import type { PanelMountContextBase } from "../sdk/contracts";
import { EmptyState, ErrorState, NotCorrelatedState, OriginBadge } from "../components/status";
import { useCorrelationBanner } from "../sdk/use-selection";

interface MissionArtifact {
  kind: string;
  id: string;
  uri: string;
  sha256Short: string;
  origin: "live" | "recorded" | "simulated" | "derived";
}

interface MissionEvent {
  id: string;
  timestamp_ns: number;
  kind: string;
  label: string;
  severity: "info" | "warn" | "error";
  artifact?: string;
}

interface MissionDetail {
  schema_version: string;
  mission_id: string;
  run_id: string;
  robots: string[];
  time_base: { domain: string; start_ns: number; end_ns: number };
  artifacts: MissionArtifact[];
  events: MissionEvent[];
}

async function fetchMission(missionId: string): Promise<MissionDetail> {
  const res = await fetch(`/api/missions/${missionId}`);
  if (!res.ok) throw new Error(`mission unavailable (${res.status})`);
  return (await res.json()) as MissionDetail;
}

const severityColor: Record<MissionEvent["severity"], string> = {
  info: "var(--studio-muted)",
  warn: "var(--studio-warn)",
  error: "var(--studio-err)",
};

function eventPosPercent(ev: MissionEvent, tb: MissionDetail["time_base"]): number {
  const span = tb.end_ns - tb.start_ns;
  if (span <= 0) return 0;
  return ((ev.timestamp_ns - tb.start_ns) / span) * 100;
}

export function MissionTimelinePanel({ ctx }: { ctx: PanelMountContextBase }) {
  const [mission, setMission] = useState<MissionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { banner } = useCorrelationBanner(ctx);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const listRes = await fetch("/api/missions");
        if (!listRes.ok) throw new Error(`missions unavailable (${listRes.status})`);
        const list = (await listRes.json()) as Array<{ missionId: string | null; error?: string }>;
        const first = list.find((m) => m.missionId);
        if (!first?.missionId) {
          throw new Error(list[0]?.error ?? "no missions available");
        }
        const detail = await fetchMission(first.missionId);
        if (!cancelled) {
          setMission(detail);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!mission) return <EmptyState label="Loading mission…" />;

  return (
    <div className="relative flex h-full flex-col gap-2 p-2 text-xs" data-testid="mission-panel">
      {banner ? <NotCorrelatedState reason={banner} /> : null}
      <div className="flex items-center justify-between">
        <span className="font-mono" data-testid="mission-title">
          {mission.mission_id} · {mission.run_id}
        </span>
        <span className="text-[10px] text-muted">
          manifest v{mission.schema_version} · robots: {mission.robots.join(", ")}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto" data-testid="mission-artifacts">
        {mission.artifacts.map((a) => (
          <div
            key={a.id}
            className="mb-1 flex items-center justify-between rounded border border-border bg-panel px-2 py-1"
            data-testid={`mission-artifact-${a.kind}`}
          >
            <span className="font-mono text-[11px]">{a.id}</span>
            <span className="flex items-center gap-2 text-[9px] text-muted">
              <span className="font-mono">{a.kind}</span>
              <span className="font-mono">sha256:{a.sha256Short}</span>
              <OriginBadge origin={a.origin} />
            </span>
          </div>
        ))}
      </div>

      <div className="relative h-16 rounded border border-border bg-panel" data-testid="mission-timeline">
        {mission.events.map((ev) => (
          <button
            key={ev.id}
            className="absolute top-2"
            style={{ left: `${eventPosPercent(ev, mission.time_base)}%` }}
            title={`${ev.timestamp_ns} ${ev.label}`}
            onClick={() => {
              ctx.time.seek(BigInt(ev.timestamp_ns), "session_ns");
              ctx.selection.publish({
                kind: "session_event",
                sourceId: ctx.source.id,
                id: ev.id,
                label: ev.label,
              });
            }}
            data-testid={`mission-event-${ev.id}`}
          >
            <span
              className="rounded px-1 text-[9px]"
              style={{ background: severityColor[ev.severity], color: "var(--studio-bg)" }}
            >
              {ev.kind}
            </span>
          </button>
        ))}
      </div>
      <div className="text-[9px] text-muted" data-testid="mission-timebase">
        time base: {mission.time_base.domain} · {mission.time_base.start_ns}..{mission.time_base.end_ns} ns ·
        events seek the shared TimeBus; cross-panel correlation follows each panel's mapping table
      </div>
    </div>
  );
}
