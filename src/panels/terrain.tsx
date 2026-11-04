import { useEffect, useRef, useState } from "react";
import { Deck } from "@deck.gl/core";
import { H3HexagonLayer } from "@deck.gl/geo-layers";
import { cellToBoundary } from "h3-js";
import type { PanelMountContextBase, TerrainRegion } from "../sdk/contracts";
import { EmptyState, NotCorrelatedState, OriginBadge } from "../components/status";
import { useCorrelationBanner } from "../sdk/use-selection";

export interface TerrainCell {
  h3Index: string;
  confidence: number;
  ageNs: number;
  sourceRobot: string;
  conflict: boolean;
}

export interface TerrainCellData extends TerrainCell {
  boundary: Array<[number, number]>;
}

export function regionEnvironmentToCells(regions: TerrainRegion[]): TerrainCell[] {
  return regions.map((r) => ({
    h3Index: r.cellId,
    confidence: r.confidence,
    ageNs: Number(r.ageNs),
    sourceRobot: r.sourceRobot,
    conflict: r.conflict,
  }));
}

export function confidenceColor(confidence: number, conflict: boolean): [number, number, number, number] {
  if (conflict) return [0.85, 0.25, 0.3, 0.85];
  const c = Math.max(0, Math.min(1, confidence));
  return [0.2 + 0.35 * c, 0.25 + 0.5 * c, 0.2 + 0.2 * c, 0.35 + 0.55 * c];
}

export function cellsWithBoundary(cells: TerrainCell[]): TerrainCellData[] {
  const out: TerrainCellData[] = [];
  for (const c of cells) {
    const boundary = cellToBoundary(c.h3Index) as Array<[number, number]> | null;
    if (boundary) {
      out.push({ ...c, boundary });
    }
  }
  return out;
}

export function buildTerrainLayer(cells: TerrainCell[]): H3HexagonLayer<TerrainCellData> {
  return new H3HexagonLayer<TerrainCellData>({
    id: "terrain-confidence",
    data: cellsWithBoundary(cells),
    extruded: false,
    filled: true,
    stroked: true,
    lineWidthMinPixels: 1,
    getHexagon: (d: TerrainCellData) => d.h3Index,
    getFillColor: (d: TerrainCellData) => confidenceColor(d.confidence, d.conflict),
  });
}

export function TerrainPanel({ ctx }: { ctx: PanelMountContextBase }) {
  const [regions, setRegions] = useState<TerrainRegion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deckOk, setDeckOk] = useState<boolean | null>(null);
  const canvasHolder = useRef<HTMLDivElement | null>(null);
  const deckRef = useRef<Deck | null>(null);
  const [robotFilter, setRobotFilter] = useState("all");
  const { ref: selection, banner } = useCorrelationBanner(ctx);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await ctx.source.mapper.terrainRegions();
        if (!cancelled) {
          setRegions(r);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    void load();
    const poll = setInterval(load, 4000);
    ctx.cleanup.add(() => clearInterval(poll));
    return () => {
      cancelled = true;
    };
  }, [ctx]);

  useEffect(() => {
    try {
      if (canvasHolder.current === null) return;
      deckRef.current = new Deck({
        parent: canvasHolder.current,
        initialViewState: DECK_VIEW,
        controller: true,
        layers: [],
      });
      setDeckOk(true);
    } catch {
      setDeckOk(false);
    }
    return () => {
      deckRef.current?.finalize();
      deckRef.current = null;
    };
  }, []);

  useEffect(() => {
    const deck = deckRef.current;
    if (!deck || !regions) return;
    const cells = regionEnvironmentToCells(
      robotFilter === "all" ? regions : regions.filter((r) => r.sourceRobot === robotFilter),
    );
    deck.setProps({
      layers: [buildTerrainLayer(cells)],
      getTooltip: (d: unknown) => {
        const obj = (d as { object?: TerrainCell }).object;
        if (!obj) return null;
        return `${obj.conflict ? "[CONFLICT] " : ""}conf ${obj.confidence.toFixed(2)} · robot ${obj.sourceRobot}`;
      },
    });
  }, [regions, deckOk, robotFilter]);

  useEffect(() => {
    if (!selection || !regions) return;
    if ((selection.kind === "robot" || selection.kind === "node") && regions.some((r) => r.sourceRobot === selection.label)) {
      setRobotFilter(selection.label);
    }
  }, [selection, regions]);

  if (error) return <EmptyState label={`Terrain unavailable: ${error}`} />;
  if (!regions) return <EmptyState label="Loading terrain…" />;

  const robots = [...new Set(regions.map((r) => r.sourceRobot))];
  const conflicts = regions.filter((r) => r.conflict).length;

  return (
    <div className="relative flex h-full flex-col" data-testid="terrain-panel">
      {banner ? <NotCorrelatedState reason={banner} /> : null}
      <div className="flex items-center justify-between px-2 py-1 text-[10px] text-muted">
        <span data-testid="terrain-summary">
          regions: {regions.length} · conflicts: {conflicts} · basemap: none (local tiles only)
        </span>
        <div className="flex items-center gap-2">
          <select
            className="rounded border border-border bg-panel px-1 py-0.5"
            value={robotFilter}
            onChange={(e) => setRobotFilter(e.target.value)}
            data-testid="terrain-robot-filter"
          >
            <option value="all">all robots</option>
            {robots.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <OriginBadge origin={ctx.source.origin} />
        </div>
      </div>
      <div className="relative min-h-0 flex-1" ref={canvasHolder} data-testid="terrain-canvas" />
      {deckOk === false && (
        <div className="p-2 text-[10px] text-warn" data-testid="terrain-degraded">
          deck.gl canvas unavailable in this browser context.
        </div>
      )}
    </div>
  );
}

const DECK_VIEW = { longitude: -74.0, latitude: 40.7, zoom: 13 };
