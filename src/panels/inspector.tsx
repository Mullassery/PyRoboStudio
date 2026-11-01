import { useEffect, useMemo, useState } from "react";
import type { PanelMountContextBase, SelectionRef, TopicQosSummary } from "../sdk/contracts";
import { EmptyState, OriginBadge } from "../components/status";
import { useWorkspace } from "../state/workspace";
import type { GraphSnapshot, TopicSample } from "../sdk/contracts";

export function DataInspectorPanel({ ctx }: { ctx: PanelMountContextBase }) {
  const [graph, setGraph] = useState<GraphSnapshot | null>(null);
  const [samples, setSamples] = useState<TopicSample[] | null>(null);
  const [subs, setSubs] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<SelectionRef | null>(ctx.selection.current());
  const sourceId = useWorkspace((s) => s.sourceId);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const g = await ctx.source.mapper.graph();
        if (!cancelled) {
          setGraph(g);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    void load();
    const poll = setInterval(load, 2000);
    ctx.cleanup.add(() => clearInterval(poll));
    return () => {
      cancelled = true;
    };
  }, [sourceId, ctx]);

  useEffect(() => {
    const off = ctx.selection.subscribe((s) => {
      setSelected(s);
      setSamples(null);
    });
    return off;
  }, [ctx]);

  const topics = useMemo(
    () =>
      (graph?.topics ?? []).filter(
        (t) =>
          t.pubCount + t.subCount > 0 &&
          (query === "" || t.name.toLowerCase().includes(query.toLowerCase())),
      ),
    [graph, query],
  );

  const activeTopic = useMemo(() => {
    if (selected?.kind === "topic") return selected.id;
    return subs.size > 0 ? [...subs][0] ?? null : topics[0]?.id ?? null;
  }, [selected, subs, topics]);

  useEffect(() => {
    if (!activeTopic) {
      setSamples([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const s = await ctx.source.mapper.topicSamples(activeTopic, 10);
        if (!cancelled) setSamples(s);
      } catch (e) {
        if (!cancelled) setSamples([]);
        void e;
      }
    };
    void load();
    const poll = setInterval(load, 1500);
    ctx.cleanup.add(() => clearInterval(poll));
    return () => {
      cancelled = true;
    };
  }, [activeTopic, ctx]);

  const topic = graph?.topics.find((t) => t.id === activeTopic);
  const activity = graph?.activity.find((a) => a.topicId === activeTopic);
  const detail = topic && ctx.source;

  return (
    <div className="flex h-full flex-col gap-2 p-2" data-testid="inspector">
      <div className="flex items-center gap-2">
        <input
          className="w-full rounded border border-border bg-panel px-2 py-1 text-xs outline-none"
          placeholder="Search topics…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-testid="inspector-search"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto" data-testid="inspector-topic-list">
        {error ? (
          <div className="text-xs text-err" data-testid="inspector-error">{error}</div>
        ) : (
          topics.map((t) => (
            <button
              key={t.id}
              className={`mb-1 flex w-full items-center justify-between rounded border px-2 py-1 text-left font-mono text-[11px] ${t.id === activeTopic ? "border-accent" : "border-border"}`}
              onClick={() => {
                const ref: SelectionRef = {
                  kind: "topic",
                  sourceId: ctx.source.id,
                  id: t.id,
                  label: t.name,
                };
                ctx.selection.publish(ref);
                setSelected(ref);
              }}
              data-testid={`inspector-topic-${t.name.replace(/[^a-z0-9]+/gi, "-")}`}
            >
              <span>{t.name}</span>
              <span className="text-[9px] text-muted">
                {t.pubCount}→{t.subCount} · {activityBadgeOf(graph, t.id)}
              </span>
            </button>
          ))
        )}
      </div>
      {detail && topic && (
        <div className="rounded border border-border bg-panel p-2 text-[11px]" data-testid="inspector-details">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-mono">{topic.name}</span>
            <OriginBadge origin={ctx.source.origin} />
          </div>
          <div className="text-muted">
            type: <span className="font-mono">{topic.msgType}</span>
          </div>
          <div className="text-muted">
            qos: <span className="font-mono">{qosText(topic.qos)}</span>
          </div>
          <div className="text-muted">
            activity: <span className="font-mono">{activityLine(activity)}</span>
          </div>
          <button
            className="mt-1 rounded border border-border px-2 py-0.5 text-[10px]"
            data-testid={`inspector-sub-${topic.name.replace(/[^a-z0-9]+/gi, "-")}`}
            onClick={() => toggleSub(subs, setSubs, topic.id, ctx)}
          >
            {subs.has(topic.id) ? "Unsubscribe" : "Subscribe (bounded view: 10 latest)"}
          </button>
          <div className="mt-2 overflow-auto">
            <table className="w-full table-fixed text-left">
              <thead>
                <tr className="text-[9px] uppercase text-muted">
                  <th className="w-16">seq</th>
                  <th className="w-24">t-ns</th>
                  <th>payload</th>
                </tr>
              </thead>
              <tbody>
                {(samples ?? []).map((s) => (
                  <tr key={s.seq}>
                    <td className="font-mono text-[10px]">{s.seq}</td>
                    <td className="font-mono text-[10px]">{s.timestampNs.toString()}</td>
                    <td className="truncate font-mono text-[10px]" title={JSON.stringify(s.payload)}>
                      {JSON.stringify(s.payload)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-1 text-[9px] text-muted" data-testid="inspector-limits">
              bounded sample view: {subs.has(topic.id) ? `${samples?.length ?? 0}/10 latest` : "subscribe to view"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function toggleSub(
  subs: Set<string>,
  setSubs: (s: Set<string>) => void,
  topicId: string,
  ctx: unknown,
): void {
  void ctx;
  const next = new Set(subs);
  if (next.has(topicId)) {
    next.delete(topicId);
  } else {
    if (next.size >= 8) return;
    next.add(topicId);
  }
  setSubs(next);
}

function qosText(qos: TopicQosSummary | undefined): string {
  return qos?.summary ?? "unspecified";
}

function activityBadgeOf(graph: GraphSnapshot | null, topicId: string): string {
  const a = graph?.activity.find((x) => x.topicId === topicId);
  if (!a) return "no flow";
  if (a.reliability === "unmeasured") return "unmeasured";
  if (a.reliability === "none") return "no flow";
  return a.hz !== undefined && a.hz > 0 ? `${a.hz.toFixed(0)}Hz` : "no flow";
}

function activityLine(a: { hz?: number; reliability: string } | undefined): string {
  if (!a) return "no flow";
  if (a.reliability === "unmeasured") return "unmeasured";
  if (a.reliability === "none") return "no flow";
  return a.hz !== undefined && a.hz > 0 ? `${a.hz.toFixed(0)} Hz observed` : "no flow";
}
