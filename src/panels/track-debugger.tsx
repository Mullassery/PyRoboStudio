import { useEffect, useMemo, useState } from "react";
import type { PanelMountContextBase, SelectionRef } from "../sdk/contracts";
import { EmptyState, ErrorState, NotCorrelatedState, OriginBadge } from "../components/status";
import { useCorrelationBanner } from "../sdk/use-selection";

interface TrackInstance {
  track_id: number;
  bbox: [number, number, number, number];
  class_id: number;
  confidence: number;
  time_since_update: number;
  hit_streak: number;
  is_confirmed: boolean;
}

interface TrackFrame {
  frame: number;
  timestampNs: number;
  tracks: TrackInstance[];
}

export interface LifecycleEvent {
  trackId: number;
  frame: number;
  timestampNs: number;
  kind: "born" | "confirmed" | "occluded" | "dropped";
  detail: string;
}

export function deriveLifecycleEvents(frames: TrackFrame[]): LifecycleEvent[] {
  const events: LifecycleEvent[] = [];
  const seen = new Map<number, { confirmed: boolean; lastFrame: number }>();
  const allIds = new Set<number>();
  for (const f of frames) for (const t of f.tracks) allIds.add(t.track_id);

  for (const f of frames) {
    const present = new Set(f.tracks.map((t) => t.track_id));
    for (const t of f.tracks) {
      const prev = seen.get(t.track_id);
      if (!prev) {
        events.push({ trackId: t.track_id, frame: f.frame, timestampNs: f.timestampNs, kind: "born", detail: `conf ${t.confidence.toFixed(2)}` });
      } else if (!prev.confirmed && t.is_confirmed) {
        events.push({ trackId: t.track_id, frame: f.frame, timestampNs: f.timestampNs, kind: "confirmed", detail: `hit streak ${t.hit_streak}` });
      }
      if (t.time_since_update > 0) {
        events.push({ trackId: t.track_id, frame: f.frame, timestampNs: f.timestampNs, kind: "occluded", detail: `no match for ${t.time_since_update} frame(s)` });
      }
      seen.set(t.track_id, { confirmed: t.is_confirmed, lastFrame: f.frame });
    }
    for (const id of allIds) {
      const prev = seen.get(id);
      if (prev && prev.lastFrame === f.frame - 1 && !present.has(id)) {
        events.push({ trackId: id, frame: f.frame, timestampNs: f.timestampNs, kind: "dropped", detail: "left tracker output" });
        seen.delete(id);
      }
    }
  }
  return events.sort((a, b) => a.timestampNs - b.timestampNs || a.trackId - b.trackId);
}

export function trackColor(trackId: number): string {
  const hue = (trackId * 137) % 360;
  return `oklch(0.7 0.15 ${hue})`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} unavailable (${res.status})`);
  return (await res.json()) as T;
}

function TrackDebuggerInner({ ctx }: { ctx: PanelMountContextBase }) {
  const [frames, setFrames] = useState<TrackFrame[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [frameIdx, setFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const { banner } = useCorrelationBanner(ctx);

  useEffect(() => {
    let cancelled = false;
    fetchJson<TrackFrame[]>("/api/repos/vision-tracks/frames")
      .then((f) => {
        if (!cancelled) setFrames(f);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!playing || !frames || frames.length === 0) return;
    const tick = setInterval(() => {
      setFrameIdx((i) => (i + 1) % frames.length);
    }, 500);
    return () => clearInterval(tick);
  }, [playing, frames]);

  const events = useMemo(() => (frames ? deriveLifecycleEvents(frames) : []), [frames]);
  const frame = frames && frames.length > 0 ? frames[Math.min(frameIdx, frames.length - 1)] : null;

  const publishTrack = (t: TrackInstance) => {
    const ref: SelectionRef = {
      kind: "track",
      sourceId: ctx.source.id,
      id: `track-${t.track_id}`,
      label: `track ${t.track_id}`,
    };
    ctx.selection.publish(ref);
  };

  if (error) return <ErrorState message={error} />;
  if (!frames || !frame) return <EmptyState label="Loading tracks…" />;

  return (
    <div className="relative flex h-full flex-col gap-2 p-2 text-xs" data-testid="track-debugger">
      {banner ? <NotCorrelatedState reason={banner} /> : null}
      <div className="flex items-center justify-between">
        <span data-testid="track-frame-label">
          frame {frame.frame} · t={frame.timestampNs} ns
        </span>
        <span className="flex items-center gap-2">
          <button
            className="rounded border border-border bg-panel px-2 py-0.5"
            onClick={() => setPlaying((p) => !p)}
            data-testid="track-play"
          >
            {playing ? "Pause" : "Play"}
          </button>
          <OriginBadge origin="derived" />
        </span>
      </div>

      <div
        className="relative min-h-0 flex-1 overflow-hidden rounded border border-border"
        style={{ background: "color-mix(in oklch, var(--studio-muted) 8%, var(--studio-panel))" }}
        data-testid="track-image-plane"
      >
        {frame.tracks.map((t) => {
          const [x, y, w, h] = t.bbox;
          return (
            <button
              key={t.track_id}
              className="absolute"
              style={{
                left: `${x}px`,
                top: `${y}px`,
                width: `${w}px`,
                height: `${h}px`,
                border: `2px solid ${trackColor(t.track_id)}`,
                opacity: t.is_confirmed ? 1 : 0.55,
              }}
              onClick={() => publishTrack(t)}
              data-testid={`track-bbox-${t.track_id}`}
            >
              <span
                className="absolute -top-4 left-0 whitespace-nowrap rounded px-1 text-[8px]"
                style={{ background: trackColor(t.track_id), color: "var(--studio-bg)" }}
              >
                id {t.track_id} · c {t.confidence.toFixed(2)}
                {t.time_since_update > 0 ? ` · occ ${t.time_since_update}` : ""}
              </span>
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded border border-border bg-panel p-1" data-testid="track-lifecycle">
        <div className="mb-1 text-[9px] uppercase text-muted">SE(lifecycle) events — derived from track export</div>
        {events.map((ev, i) => (
          <div key={i} className="flex items-center gap-2 px-1 py-0.5 font-mono text-[10px]" data-testid={`track-event-${ev.kind}`}>
            <span style={{ color: trackColor(ev.trackId) }}>track {ev.trackId}</span>
            <span className="text-muted">t={ev.timestampNs}</span>
            <span
              className="rounded px-1 text-[8px] uppercase"
              style={{
                background: ev.kind === "dropped" || ev.kind === "occluded" ? "var(--studio-warn)" : "var(--studio-accent)",
                color: "var(--studio-bg)",
              }}
            >
              {ev.kind}
            </span>
            <span className="text-muted">{ev.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TrackDebuggerPanel({ ctx }: { ctx: PanelMountContextBase }) {
  return <TrackDebuggerInner ctx={ctx} />;
}
