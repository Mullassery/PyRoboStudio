# PyRoboStudio Visualization SDK

**Date:** 2026-10-31
**Status:** Proposed (Phase 1). Companion to `system-architecture.md` and `data-source-contracts.md`.

## 1. Goals

- Any panel can be added without touching app code beyond one registration line and its own module.
- Panels declare what they *need* (data-source capabilities, entity kinds) so the shell can render meaningful disabled states.
- Cross-panel interaction happens through typed buses, never direct imports between panels (master prompt §9).
- Error isolation: a throwing panel is disabled and reported, never takes down the shell.
- No privileged access: a plugin cannot reach backend capabilities or publish anything (master prompt §7.2, §11).

## 2. Plugin contract (v1, statically registered)

```ts
// packages/studio-sdk (workspace package; importable only from studio SDK)
export interface PanelPlugin {
  readonly id: string;            // "ros-graph-explorer" — namespaced, stable
  readonly version: string;       // semver of the panel contract it implements
  readonly contractVersion: 1;    // bumps = breaking plugin API change
  displayName: string;
  description: string;
  icon: string;                   // token name, not arbitrary component
  // What the panel needs before it can render meaningfully:
  requires: {
    dataSourceCapabilities: CapabilityRef[];  // e.g. "ros.live.graph", "session.read"
    entityKinds?: EntityKind[];               // selection kinds it consumes
  };
  // Lifecycle:
  mount(ctx: PanelContext): PanelInstance;
  // Optional config surface (displayed by the shell, not parsed by panel):
  configSchema?: JsonSchemaObject;
}

export interface PanelContext {
  workspaceId: string;
  panelId: string;
  dataSource: DataSourceRef;      // confirmed available capability set
  config: ConfigStore;            // read/update, persisted with layout
  selection: SelectionBus;        // typed publish/subscribe
  timeCursor: TimeCursorApi;      // share/observe playhead; null if incompatible
  notifications: Notifications;   // user-visible status reporting
  theme: DesignTokens;
  // Resources:
  registerCleanup(fn: () => void): void;  // MUST be used for all retained resources: subs, timers, RAF, workers
  fetch: PortalFetch;             // sidecar HTTP, origin-enforced; no raw fetch to arbitrary hosts
}

export interface PanelInstance {
  render(host: HTMLElement): void;  // panel owns its DOM subtree (React root ok)
  dispose(): void;                  // shell calls on unmount; ctx cleanups run too
  onConfigChange?(prev: PanelConfig, next: PanelConfig): void;
}
```

Built-in panels implement exactly this contract — there is no second "internal" API. Panels are React components inside `render()` (they create a React root with the app's providers). Registry, discovery (list + filter by capability), lifecycle management (mount/unmount/error reporting), and per-panel error isolation live in the core, not in panels.

## 3. Cross-panel buses

### 3.1 Selection bus
Typed by `EntityKind` (`node | topic | service | action | track | robot | session_event | frame | terrain_region | ...` defined in `data-source-contracts.md`). Correlation is by declared mapping tables provided by the sidecar (e.g., `topic /robot1/tracks ↔ robot_id r1`); if a selected entity has no mapping into a panel's domain, that panel shows "no correlated data" — it never guesses.

### 3.2 Time cursor
- Data sources declare `ClockDomain` (`ros_time`, `session_ns`, `wall_clock`, `sim_time`, `python_perf`). Conversion between domains requires the mapping from the data source; otherwise no cross-sync.
- Panels expose `TimeDomain()` (their support window) and optionally `seek(t)`; the workspace view (not each panel) resolves a shared cursor when all visible panels' domains overlap.

### 3.3 Focus composer (the "mission manifest" path)
A `MissionRef` payload can navigate all compatible panels at once (competitive analysis Gap 1). It is just a bundle of `{selection, time, camera}` made addressable; no special panel coupling.

## 4. Resource rules

- Every `PanelContext` resource API returns typed unsubscribe handles; `registerCleanup` is the only sanctioned teardown path.
- The shell enforces `maxBufferedMessages` per subscription (from data-source contracts) and shows a badge when a panel is consuming above its declared rate class.
- Workers: panels may request a pure-function worker via `ctx.worker` in a later contract version; v1 panels do not spawn their own (keeps accounting possible).

## 5. Registration and future external plugins

- v1: static `registerPanel(plugin)` with a compile-time uniqueness check and unit-tested registry invariants (dedupe ids, contract versions, required capabilities exist).
- Later (deliberately not built yet): workers/iframes with CSP for third-party panels, mirroring the "no silently arbitrary backend access" rule. The contract above is designed so panels don't need re-writing for that change — they already know nothing about direct network access.

## 6. What a plugin author must write (target bar)

1. A directory `plugins/my-panel/` with the plugin object, a component, config schema, tests (registration + render + cleanup), and one line in `panels/index.ts`.
2. No imports from other panels, no `window.fetch`, no direct websockets — enforced by review conventions in v1 and by lint rules where feasible.

## 7. Non-goals for v1

- Dynamic code loading, marketplace, auto-updating of panels.
- Plugin access to arbitrary robot APIs.
- Fine-grained capabilities beyond data-source capability refs (auth model is the sidecar's job).
