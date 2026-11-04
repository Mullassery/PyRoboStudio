import { useEffect, useMemo, useState } from "react";
import type { PanelMountContextBase, SessionEvent, SessionSummary } from "../sdk/contracts";
import { EmptyState, NotCorrelatedState, OriginBadge } from "../components/status";
import { useCorrelationBanner } from "../sdk/use-selection";
import { useWorkspace } from "../state/workspace";

export function sessionSpanNs(s: SessionSummary): bigint {
  return s.span.endNs - s.span.startNs;
}

export function labelFor(event: SessionEvent): string {
  return event.severity === "error" ? "!!" : event.severity === "warn" ? "!" : "·";
}

export function eventPosPercent(event: SessionEvent, s: SessionSummary): number {
  const span = sessionSpanNs(s);
  if (span <= 0n) return 0;
  return Number(((event.timestampNs - s.span.startNs) * 10_000n) / span) / 100;
}

export function ReplayPanel({ ctx }: { ctx: PanelMountContextBase }) {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [events, setEvents] = useState<SessionEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const sourceChanged = useWorkspace((s) => s.sourceId);
  const { ref: selected, banner } = useCorrelationBanner(ctx);
  const [cursorNs, setCursorNs] = useState<bigint | null>(ctx.time.cursor());

  useEffect(() => {
    const off = ctx.time.subscribe((t) => setCursorNs(t));
    return off;
  }, [ctx]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const s = await ctx.source.mapper.sessions();
        if (!cancelled) {
          setSessions(s);
          setError(null);
          setSessionId((prev) =>
            prev && s.some((x) => x.id === prev) ? prev : s[0]?.id ?? null,
          );
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    void load();
    const poll = setInterval(load, 3000);
    ctx.cleanup.add(() => clearInterval(poll));
    return () => {
      cancelled = true;
    };
  }, [sourceChanged, ctx]);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const evs = await ctx.source.mapper.sessionEvents(sessionId);
        if (!cancelled) setEvents(evs);
      } catch (e) {
        if (!cancelled) setEvents([]);
        void e;
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [sessionId, ctx]);

  const session = useMemo(() => sessions?.find((s) => s.id === sessionId) ?? null, [sessions, sessionId]);

  useEffect(() => {
    if (!playing || !session) return;
    const step = session.span.endNs / 60n;
    const tick = setInterval(() => {
      const cur = ctx.time.cursor();
      const next = (cur === null || cur >= session.span.endNs ? session.span.startNs : cur) + step;
      ctx.time.seek(next, session.span.clockDomain);
    }, 120);
    ctx.cleanup.add(() => clearInterval(tick));
    return () => {
      clearInterval(tick);
    };
  }, [playing, session, ctx]);

  useEffect(() => {
    if (!session) return;
    ctx.time.declareDomain(session.span);
  }, [session, ctx]);

  useEffect(() => {
    if (!selected || selected.kind !== "session_event" || !events || !session) return;
    const ev = events.find((e) => e.id === selected.id);
    if (ev) ctx.time.seek(ev.timestampNs, session.span.clockDomain);
  }, [selected, events, session, ctx]);

  if (error) return <EmptyState label={`Sessions unavailable: ${error}`} />;
  if (!sessions) return <EmptyState label="Loading sessions…" />;
  if (sessions.length === 0) {
    return <EmptyState label="No sessions available" />;
  }

  return (
    <div className="relative flex h-full flex-col text-xs" data-testid="replay-panel">
      {banner ? <NotCorrelatedState reason={banner} /> : null}
      <div className="flex items-center justify-between px-2 py-1">
        <select
          className="rounded border border-border bg-panel px-1 py-0.5 text-[10px]"
          value={session?.id ?? ""}
          onChange={(e) => {
            setSessionId(e.target.value);
            setPlaying(false);
          }}
          data-testid="replay-session-select"
        >
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id} · {s.format}
            </option>
          ))}
        </select>
        <OriginBadge origin={session?.origin ?? ctx.source.origin} />
      </div>
      {session && (
        <>
          <div className="relative mx-2 mb-1 h-8 rounded border border-border bg-panel" data-testid="replay-timeline">
            <div
              className="absolute bottom-1 h-2 rounded bg-accent"
              style={{ width: cursorWidth(session, cursorNs) }}
              data-testid="replay-cursor-bar"
            />
            {(events ?? []).map((ev) => (
              <button
                key={ev.id}
                className="absolute top-1"
                style={{ left: `${eventPosPercent(ev, session)}%` }}
                title={`${ev.timestampNs} ${ev.label}`}
                onClick={() => {
                  ctx.time.seek(ev.timestampNs, session.span.clockDomain);
                  ctx.selection.publish({
                    kind: "session_event",
                    sourceId: ctx.source.id,
                    id: ev.id,
                    label: ev.label,
                  });
                }}
                data-testid={`replay-event-${ev.id}`}
              >
                <span className={pick_severity(ev.severity)}>{labelFor(ev)}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 px-2">
            <button className="rounded border border-border bg-panel px-2 py-0.5" onClick={() => setPlaying((p) => !p)} data-testid="replay-play">
              {playing ? "Pause" : "Play"}
            </button>
            <span className="font-mono" data-testid="replay-cursor-ns">
              {cursorNs?.toString() ?? "—"}
            </span>
          </div>
          {session.degraded.length > 0 && (
            <ul className="px-2 py-1 text-[10px] text-warn" data-testid="replay-degraded">
              {session.degraded.map((d) => (
                <li key={d}>degraded: {d}</li>
              ))}
            </ul>
          )}
          <div className="min-h-0 flex-1 overflow-auto px-2 text-[10px]">
            {(events ?? []).map((ev) => (
              <div key={ev.id} className="mb-1 flex items-center gap-2" data-testid={`replay-row-${ev.id}`}>
                <span
                  className="rounded px-1"
                  style={{
                    background:
                      ev.severity === "error" ? "var(--studio-err)" : ev.severity === "warn" ? "var(--studio-warn)" : "var(--studio-ok)",
                    color: "var(--studio-bg)",
                  }}
                >
                  {ev.severity}
                </span>
                <span className="font-mono">{ev.timestampNs.toString()}</span>
                <span>{ev.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function cursorWidth(session: SessionSummary, cur: bigint | null): string {
  if (cur === null) return "0%";
  const span = sessionSpanNs(session);
  const off = cur - session.span.startNs;
  const pct = span > 0n ? Number((off * 100n) / span) : 0;
  return `${Math.max(0, Math.min(100, pct))}%`;
}

function pick_severity(sev: SessionEvent["severity"]): string {
  return sev === "error" ? "text-err" : sev === "warn" ? "text-warn" : "text-ok";
}
