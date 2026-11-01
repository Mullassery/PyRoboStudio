# PyRoboStudio System Architecture

**Date:** 2026-10-31
**Status:** Proposed (Phase 1). Grounded in `competitive-analysis.md`, `library-evaluation.md`, and the seven repo audits in `docs/research/repos/`.

## 1. Shape of the system

Three run-times, connected by two boundaries:

```
+-----------------------------------------------------------+
| Browser (macOS dev first, anywhere later)                 |
|                                                           |
|  React 19 + TS strict + Vite 8 + Tailwind 4 + shadcn      |
|  dockview-react workspace shell                           |
|                                                           |
|  Panels (statically registered, SDK-defined)              |
|   - ROS Graph Explorer   - Data Inspector                 |
|   - 3D World Viewer      - Terrain / H3 layers            |
|   - Replay timeline      - Perception / Frame views       |
|   - Mission timeline (the differentiator)                 |
|                                                           |
|  Core: panel registry | data-source registry | selection  |
|        & time-cursor bus | settings | workspace store     |
+-----------------------+-----------------------------------+
                        | WebSocket (binary, foxglove.sdk.v1
                        | envelope + custom JSON endpoints over HTTP)
+-----------------------v-----------------------------------+
| Python sidecar (uv-managed, runs beside ROS or offline)   |
|                                                           |
|  FastAPI + foxglove-sdk server (Time capability)          |
|   /graph /topics /tf  /sessions /mission /capabilities    |
|                                                           |
|  Adapters (app-owned, behind isolated APIs):              |
|   - live adapter (rclpy graph API + foxglove_bridge       |
|     fallback)                        [Ubuntu only]        |
|   - recorded adapter (PyRoboReplay .db3, mcap +           |
|     mcap-ros2-support, rosbags CDR, PyRoboFrames Parquet) |
|   - mission manifest reader (_gap-1 differentiator)       |
|   - terrain adapter (PyTerrainMap HTTP, proxied+auth)     |
|   - fleet adapter (SyncFleet journals, read-only)         |
+-----------------------------------------------------------+
                        |
        (optional, Ubuntu): ROS 2 (rclpy, foxglove_bridge),
        PyRobo* venvs. macOS: recorded/offline mode only.
```

## 2. Run-time modes (evidence-driven, not aspirational)

The repo audits established that **no PyRobo\* repository ships a server** and **macOS ROS 2 is Tier 3** (source builds only). Therefore:

| Mode | What works | Where |
|---|---|---|
| **Offline / recorded** (default, macOS dev) | Sessions from `.db3` (PyRoboReplay), `.mcap` (mcap), Parquet (PyRoboFrames); terrain from PyTerrainMap API; mission manifests; full studio UI with replay + inspection | macOS or Ubuntu; sidecar with no rclpy |
| **Live** (Ubuntu target) | rclpy graph discovery, live subscriptions, TF buffer, foxglove_bridge QoS negotiation | Ubuntu sidecar with ROS 2 env |
| **Simulated / fixture** | Synthetic ROS graph + known messages for tests and demos; always badged `SIMULATED` | any |

The UI must show which mode is active at all times (master prompt §3.4, §11). A disconnected studio shows a disconnected state, never stale data presented as live.

## 3. Boundaries and ownership

- **The browser owns**: workspace, panels, rendering, selection state, layout persistence. No direct DDS access ever.
- **The sidecar owns**: all connections to ROS/file/network terrain. Single process, single origin. All PyRobo\* imports live here — never in browser code, never cross-repo (each repo stays independently usable; we import them, we do not wrap their CLIs into our own).
- **The ROS environment owns**: discovery semantics, QoS authority. The sidecar reports incompatibilities (e.g., QoS mismatches from foxglove_bridge) instead of masking them.
- **PyTerrainMap is never browser-accessible directly** — its own audit flags optional/write-only auth and no rate limiting; access goes through the sidecar proxy.

No Rust service in v1. The smallest architecture that meets requirements is Python-only; PyRoboReplay/PyRoboFrames are already Rust+PyO3, so performance-critical decode is inherited through their APIs rather than rebuilt.

## 4. Core framework pieces (browser)

1. **Panel registry + plugin SDK** (`visualization-sdk.md`): static registration in v1; panels declare required data-source capabilities so the UI can show "needs a live ROS connection" instead of rendering a broken panel.
2. **Data-source registry** (`data-source-contracts.md`): typed connections (live/recorded/simulated), each with capability reporting, status, subscriptions with explicit limits.
3. **Selection & time-cursor bus**: typed zustand store. `select(entityRef)` where `entityRef` = {kind: node|topic|track|robot|session_event|..., source_id, id} + mapping rules. Panels subscribe by entity kind, not by panel name. Cross-view correlation works only where mapping tables exist; unknown mappings are shown as "not correlated" (master prompt §9).
4. **Time cursor**: one authoritative playhead per workspace view; panels register `TimeDomain` (live rolling window or session span) and declare what clock domain they use. Recorded data always wins the authoritative cursor; live panels keep their own rolling buffer unless a panel explicitly declares compatibility.
5. **Workspace persistence**: dockview `toJSON/fromJSON` into zustand `persist` (localStorage) + exportable JSON layout files in v1; SyncFleet replication deferred (Gap 4 of competitive analysis).

## 5. Sidecar API sketch (v1)

Binary data plane: foxglove-sdk WebSocket server (subprotocol `foxglove.sdk.v1`) with schema announcements + `Time` capability for replay control. Control/metadata plane: FastAPI HTTP/JSON:

- `GET /capabilities` — what this sidecar instance can do (live? ROS version? codecs? adapters loaded?)
- `GET /graph`, `/graph/changes` (poll or WS) — nodes, pubs/subs, services, actions from rclpy graph API or foxglove_bridge introspection
- `GET /topics, /topics/{id}/samples` — bounded sample subscriptions
- `GET /tf` — frame tree + buffered history
- `GET /sessions, /sessions/{id}, /sessions/{id}/events?from=&to=` — recorded sessions via PyRoboReplay/MCAP; cursor-based pagination
- `GET /mission/{id}` — mission manifest (see roadmap)
- `GET /terrain/regions...` — proxied PyTerrainMap queries (authenticated)
- `GET /fleet...` — SyncFleet journal/status summaries

Schemas for responses are versioned (`schema_version` field, semver, additive-first).

## 6. Non-goals for v1

- No publishing/commanding from the UI (read-only first; ClientPublish capability exists in the SDK protocol but we do not enable it).
- No dynamic/third-party plugin loading; no arbitrary shell/file access from plugins or the sidecar API.
- No cloud service, no hosted collaboration, no telemetry out of the LAN.
- No acceptance of Kilted (ROS 2 EOL 2026-11-30); targets Jazzy + Lyrical.

## 7. Testing strategy at the architecture level

- Frontend: Vitest + RTL for core/SDK; Playwright for workspace, connection-loss, and the golden mission E2E flow.
- Sidecar: pytest against recorded fixtures (`.db3` from PyRoboReplay sample bag, generated MCAPs); no ROS required for the recorded adapter tests.
- Integration: the reproducible ROS 2 environment from the master prompt §12 runs in CI only where Linux + ROS runners exist; everything else uses recorded fixtures. Mock data is always badged.
