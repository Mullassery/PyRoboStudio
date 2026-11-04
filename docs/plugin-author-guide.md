# Plugin author guide

How to add a panel to PyRoboStudio. Panels are React components registered
against a typed contract; they never talk to ROS, files, or the network
directly — everything flows through the `PanelMountContextBase` they receive
(`src/sdk/contracts.ts`).

## 1. The contract

```ts
export interface PanelPlugin {
  id: string;              // kebab-case, unique — collision throws
  version: string;
  contractVersion: 1;
  displayName: string;     // shown in the command palette
  description: string;
  requiredCapabilities?: string[];  // hint text in the palette (not enforced)
  requiresOrigin?: Origin[];
  component: PanelComponent;
}
```

Your component receives `ctx: PanelMountContextBase` with:

| member | purpose |
|---|---|
| `ctx.source` | the active `DataSource` (live-resolved; swaps when the user changes source) |
| `ctx.source.mapper` | typed data access: `graph()`, `topicSamples()`, `tfTree()`, `sessions()`, `sessionEvents()`, `terrainRegions()` |
| `ctx.selection` | publish/subscribe/current — the selection bus |
| `ctx.time` | shared TimeBus: `declareDomain`, `seek`, `cursor`, `subscribe` |
| `ctx.config` | per-panel config get/set/subscribe (persisted per workspace) |
| `ctx.notify` | user-facing messages |
| `ctx.cleanup` | register disposal callbacks (intervals, listeners) |

## 2. Minimal panel

```tsx
// src/panels/my-panel.tsx
import { useEffect, useState } from "react";
import type { PanelMountContextBase } from "../sdk/contracts";
import { EmptyState, ErrorState } from "../components/status";
import { useCorrelationBanner } from "../sdk/use-selection";

export function MyPanel({ ctx }: { ctx: PanelMountContextBase }) {
  const [data, setData] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { banner } = useCorrelationBanner(ctx);

  useEffect(() => {
    let cancelled = false;
    ctx.source.mapper.graph()
      .then((g) => { if (!cancelled) setData(`${g.nodes.length} nodes`); })
      .catch((e) => { if (!cancelled) setError((e as Error).message); });
    return () => { cancelled = true; };
  }, [ctx]);

  if (error) return <ErrorState message={error} />;
  if (!data) return <EmptyState label="Loading…" />;
  return (
    <div data-testid="my-panel">
      {banner ? <div data-testid="selection-uncorrelated">{banner}</div> : null}
      {data}
    </div>
  );
}
```

## 3. Register it

```ts
// src/panels/index.ts
export const myPanel: PanelPlugin = {
  id: "my-panel",
  version: "1.0.0",
  contractVersion: 1,
  displayName: "My Panel",
  description: "What it shows",
  component: MyPanel,
};
// add to the registry loop
```

It now appears in the ⌘K palette and can be opened into the dockview layout.
Add its id to `SELECTION_MAPPINGS` in `src/sdk/selection-mapping.ts` with the
`EntityKind`s it can correlate — every other selection shows an explicit
"not correlated" banner (never silent).

## 4. Rules the codebase enforces by convention

1. **Origin badges are mandatory.** Any data that is not from the active
   source must show `OriginBadge` (`SIMULATED`/`RECORDED`/`DERIVED`/`LIVE`).
   Derived data (computed in the browser) is badged DERIVED, never presented
   as measured.
2. **Bounded views.** Never render unbounded lists; sample views are capped
   (e.g. 10 messages) and say so in the UI.
3. **Empty/error/disconnected states.** Use `EmptyState`, `ErrorState`,
   `DisconnectedState` from `src/components/status.tsx` — a blank panel is a
   bug.
4. **No comments unless necessary**; no emojis; follow existing panel style
   (`graph-explorer.tsx` is the reference).
5. **Testids** for every interactive element and panel root — Playwright E2E
   depends on them.
6. **Cleanup**: every interval/subscription goes through `ctx.cleanup.add()`
   or a useEffect return.

## 5. Testing your panel

- Unit: vitest for pure logic (see `src/test/track-lifecycle.spec.ts` for a
  derived-data example).
- E2E: add a scenario in `tests/e2e/smoke.spec.ts` — open via palette, assert
  your root testid, interact, assert observable state. The suite runs against
  the real sidecar fixture.
- Run everything: `npx tsc --noEmit && npx vitest run && npx playwright test`.

## 6. Adding a sidecar-backed data path

If your panel needs data the mappers don't provide, extend the sidecar
(`sidecar/src/pyrobostudio_sidecar/server.py`) with a read-only endpoint, then
fetch it via the `/api` proxy (vite dev) — see `src/panels/track-debugger.tsx`
fetching `/api/repos/vision-tracks/frames`. Endpoints must be read-only; any
write path violates the security model and will be rejected in review.
