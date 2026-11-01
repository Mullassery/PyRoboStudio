import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { PanelMountContextBase, TopicSample, SelectionRef } from "../sdk/contracts";
import { EmptyState, OriginBadge } from "../components/status";
import { useWorkspace } from "../state/workspace";

export interface SeriesPoint {
  t: number;
  v: number;
}

export function numericFieldExtractor(payload: unknown): ((d: TopicSample) => number | null) | null {
  const p = payload as Record<string, unknown> | null;
  if (!p || typeof p !== "object") return null;
  const linear = p["linear"] as Record<string, unknown> | undefined;
  if (linear && typeof linear["x"] === "number") {
    return (d) => {
      const l = (d.payload as Record<string, Record<string, number>>)["linear"];
      return l && typeof l["x"] === "number" ? l["x"] : null;
    };
  }
  return null;
}

export function samplesToSeries(samples: TopicSample[], extractor: ((d: TopicSample) => number | null) | null): SeriesPoint[] {
  if (!extractor) return [];
  const out: SeriesPoint[] = [];
  for (const d of samples) {
    const v = extractor(d);
    if (v !== null) out.push({ t: Number(d.timestampNs / 1_000_000n), v });
  }
  return out;
}

export function ChartsPanel({ ctx }: { ctx: PanelMountContextBase }) {
  const [selected, setSelected] = useState<SelectionRef | null>(ctx.selection.current());
  const [samples, setSamples] = useState<TopicSample[] | null>(null);
  const sourceChanged = useWorkspace((s) => s.sourceId);
  const [fallbackTopic, setFallbackTopic] = useState<string | null>(null);

  useEffect(() => {
    const off = ctx.selection.subscribe((s) => {
      setSelected(s);
      if (s?.kind === "topic") setFallbackTopic(null);
    });
    return off;
  }, [ctx]);

  useEffect(() => {
    let cancelled = false;
    const pickTopic = async () => {
      if (selected?.kind === "topic") return selected.id;
      const g = await ctx.source.mapper.graph();
      const first = g.topics.find((t) => t.name.includes("cmd_vel")) ?? g.topics[0];
      return first?.id ?? null;
    };
    void pickTopic().then((id) => {
      if (!cancelled) setFallbackTopic(id);
    });
    return () => {
      cancelled = true;
    };
  }, [selected, sourceChanged, ctx]);

  useEffect(() => {
    if (!fallbackTopic) {
      setSamples(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const s = await ctx.source.mapper.topicSamples(fallbackTopic, 10);
        if (!cancelled) setSamples(s);
      } catch {
        if (!cancelled) setSamples([]);
      }
    };
    void load();
    const poll = setInterval(load, 1000);
    ctx.cleanup.add(() => clearInterval(poll));
    return () => {
      cancelled = true;
    };
  }, [fallbackTopic, ctx]);

  const series = useMemo(() => {
    if (!samples || samples.length === 0) return [];
    const extractor = numericFieldExtractor(samples[0]!.payload);
    return samplesToSeries(samples, extractor);
  }, [samples]);

  if (samples && samples.length > 0 && series.length === 0) {
    return <EmptyState label="No numeric field found in payloads — see inspector." />;
  }
  if (!samples) return <EmptyState label="Loading samples…" />;

  return (
    <div className="flex h-full flex-col" data-testid="charts-panel">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="font-mono text-[10px] text-muted">{fallbackTopic} · linear.x (derived)</span>
        <OriginBadge origin="derived" />
      </div>
      <div className="min-h-0 flex-1 p-1" data-testid="charts-canvas">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="var(--studio-border)" strokeDasharray="3 3" />
            <XAxis dataKey="t" tick={{ fontSize: 9 }} stroke="var(--studio-muted)" />
            <YAxis tick={{ fontSize: 9 }} stroke="var(--studio-muted)" />
            <Line dataKey="v" stroke="var(--studio-accent)" dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
