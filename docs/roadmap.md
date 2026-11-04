# PyRoboStudio Roadmap

**Date:** 2026-10-31. Phases follow the master prompt §13. Status markers updated as work completes. Acceptance criteria per phase are the definition of done — not aspirations.

## Completed

- [x] **Phase 0 — Repository reconnaissance**
  - Seven PyRobo\* audits with line-level evidence (`docs/research/repos/*.md`): capability vs adapter-needed vs source-change taxonomy; established that the ecosystem has **no server components** and that PyRoboReplay/PyRoboFrames provide Python-side decode (`.db3`, MCAP, LeRobot/Parquet) suitable for a sidecar.
- [x] **Phase 1 (first half) — Research and specification**
  - Competitive analysis with sources (`competitive-analysis.md`): 5 evidence-backed gaps; rejected overturning-archived-Foxglove, adopting Lichtblick wholesale; five-phase build sequence.
  - Library evaluation with verified versions/licenses (`library-evaluation.md`): stack decisions and nine flagged follow-ups.

## In progress / next

### Phase 1 (second half) — Architecture + ADRs ⟵ **current**
- [x] `docs/architecture/system-architecture.md` (3 run-time modes, sidecar, buses)
- [x] `docs/architecture/visualization-sdk.md` (plugin contract, selection/time buses)
- [x] `docs/architecture/data-source-contracts.md` (envelope, capabilities, domain schemas)
- [x] `docs/architecture/security-model.md` (read-only, localhost, allowlists)
- [x] This roadmap
- [ ] `docs/decisions/` ADR-0001..0006 (sidecar+foxglove-sdk; dockview; xyflow/graphology; R3F+urdf-loader; deck.gl/Cesium split canvases; no-publish v1)
- [x] Resolve the two license-verification items from `library-evaluation.md` (rosbags LICENSE, elkjs distribution mode) — **DONE (2026-11-04)**: rosbags wheel LICENSE verified Apache-2.0; elkjs EPL-2.0 bundling note recorded in `library-evaluation.md` §8.

### Phase 2 — Minimal vertical slice
- [x] ~~Repo scaffolding~~ — done: git init; Vite 8.3.5 + React 19.3.1 + TS 5.9 strict + Vitest 5.0.5 project; dockview-react 8.8.3 installed (0 vulnerabilities). **Validation spikes passed 2026-10-31**: (1) dockview layout `toJSON/fromJSON` round-trip under React 19 + jsdom (`src/spike/dockview-spike.test.tsx`; panel content commits async, only active tab content mounts); (2) foxglove-sdk 0.30.3 server on Python 3.12 negotiates `foxglove.sdk.v1`, advertises `time` capability and channels (`sidecar/spikes/test_foxglove_handshake.py`; channels are context-level `foxglove.log()`; wire ops are `serverInfo`/`advertise`). TS pinned to 5.9 because typescript-eslint supports `<6.1.0` (TS 7 upgrade gate recorded in package.json decision trail).
- [x] Design system: tokens, dark/light, shadcn primitives, empty/loading/error/disconnected states, command palette (cmdk), status bar. **DONE (2026-11-01)** — oklch tokens in `src/styles.css`, cmdk palette (⌘K), OriginBadge/EmptyState/ErrorState/SourceStatus in `src/components/status.tsx`. shadcn primitives deferred to Phase 4; hand-rolled Tailwind components shipped.
- [x] Shell: dockview-react workspace, layout save/restore (toJSON/fromJSON → zustand persist), panel registry + SDK (`visualization-sdk.md`) with registry unit tests. **DONE (2026-11-01)** — `src/shell/shell.tsx` + layout persist; `PanelRegistry` (`src/panels/index.ts`) with unit tests (registry rejects duplicate ids).
- [ ] Sidecar: FastAPI + foxglove-sdk WS server (playback Time capability verified), `/capabilities`, recorded adapter reading `.db3` via PyRoboReplay and generated MCAPs; **simulated ROS graph source with visible SIMULATED badge**. **PARTIAL (2026-11-01)** — FastAPI sidecar serving `/capabilities /graph /topics /tf /sessions /events /terrain/regions` from generated MCAP + metadata fixtures; **foxglove-sdk WS now wired into the server app** (`ws_transport.py`, started in uvicorn lifespan, Time capability + fixture topics advertised as JSON channels, conformance-tested via `websockets` client, 9/9 pytest); `.db3`/PyRoboReplay adapter not yet available (rosbags-based decode deferred to Phase 4). Simulated source with SIMULATED badge shipped.
- [x] Graph explorer v1 on live-ish/simulated + recorded graph snapshots: nodes, topics, pub/sub edges, search, filter, namespace subflow grouping, ELK layout, selection → context panel; QoS/activity as separate fields (never fake health). **DONE (2026-11-01)** — expanded + collapsed-by-namespace modes, Elk JS layout, topic/node/cluster testids, QoS edge rendering; unit-tested model builder.
- [x] Data inspector v1: topic list w/ explicit subscriptions, bounded message samples w/ schema info, freq/timing when measured. **DONE (2026-11-01)** — search, subscription toggle with 8-topic cap badge, bounded samples (max 10).
- [ ] Playwright E2E: connect → graph → select topic → inspect → disconnect shows accurate lost-connection state. **PARTIAL (2026-11-01)** — 7 passing scenarios (boot SIMULATED badge, graph panel render, palette, replay timeline, inspector topic → details, sidecar switch serves recorded sample_session, **sidecar lost mid-session shows accurate disconnected state** via route-abort transport failure + 4s health probe replacing the source; footer flips from "recorded session served" to "disconnected"). The disconnect scenario uses Playwright route interception, not a real process kill; a process-kill variant stays open for Phase 6 hardening.
- Acceptance: typed contracts + envelope in use end-to-end; all tests green; MCP-style "mocks are badged" rule enforced.

### Phase 3 — Visualization foundation
- [x] 3D viewer scaffolding: R3F + urdf-loader + TF frame tree panel; marker subset; occupancy grid; camera overlay. **DONE (2026-11-01)** — `src/panels/world3d.tsx`: hasWebgl() guard, frame-tree axes + boxes from `/tf`, OccupancyGrid wireframe mesh, CameraOverlayImage plane. Markers subset = path only (see data-source-contracts marker scope).
- [x] deck.gl terrain panel: H3 confidence/staleness/conflict layers over PyTerrainMap fixture data through the sidecar proxy. **DONE (2026-11-01)** — `src/panels/terrain.tsx` H3HexagonLayer over real H3 region fixtures from `/terrain/regions` (sidecar), confidence decay + conflict coloring, robot filter; npm-audit findings from the deck.gl/loaders.gl transitive graph triaged in `security-model.md §8`.
- [ ] Replay integration: PyRoboReplay sessions timeline, playback controls via sidecar Time capability, degraded-fields surfaced. **PARTIAL (2026-11-01)** — `src/panels/replay.tsx` timeline with event markers, play/pause cursor stepping, per-panel TimeBus domain declaration, degraded list rendered; sessions/events from sidecar verified in E2E against fixture session (`sample_session`). PyRoboReplay itself is ROS-2/`.db3`-shaped and not wired as adapter yet.
- [x] Charts: recharts embedded panels; evaluate uPlot before finalizing high-rate series work. **DONE (2026-11-01)** — `src/panels/charts.tsx`: recharts LineChart over topic samples (numeric field derivation `linear.x`), DERIVED origin badge. uPlot evaluation still open (Phase 6).
- Acceptance: recorded-session playback with synced 3D/plots on real fixtures; no unverified message/model support claims shipped.

### Phase 4 — Repository adapters (progressive, not gatekeeping release)
- [x] `.db3` adapter via rosbags 0.11.9 (Apache-2.0, LICENSE verified in wheel) — closes the Phase 2 PARTIAL item. **DONE (2026-11-04)** — `ros2bag.py` read-only sqlite + CDR decode (`Stores.ROS2_HUMBLE` typestore, `__msgtype__` stripping, large-array truncation), round-trip fixture writer + 5 tests incl. real PyRoboReplay fixture decode (skipped when repo absent).
- [x] PyRoboFrames adapter (LeRobotDataset v3.0 Parquet ingestion). **DONE (2026-11-04)** — `lerobot.py` (`episodes/features/steps/stats/summary/provenance` against `meta/info.json` + `meta/episodes/chunk-*/file-*.parquet` + data shards), 4 tests.
- [x] PyRoboVision adapter (tracks/detections export JSON contract — PyRoboVision has no on-disk persistence, so the contract is an export file; documented in `adapter-schemas.md` §3). **DONE (2026-11-04)** — `vision_tracks.py` validation/summarize + round-trip tests; frontend groundwork (tracker debugger) stays Phase 5.
- [x] PyRoboSimulator adapter (world_spec.json ingestion, SIMULATED badge). **DONE (2026-11-04)** — `worldsim.py` bounds/schema guards + summarize.
- [x] PyNetworkIntel adapter + topology panel (distinct subnet/device/service model over the installed xyflow infra). **DONE (2026-11-04)** — `networkintel.py` read-only sqlite adapter + `src/panels/network-topology.tsx` (ReactFlow/ELK, SIMULATED-free honest badge from adapter).
- [x] SyncFleet adapter (read-only journal summaries, replication lag, open conflicts). **DONE (2026-11-04)** — `syncfleet.py` status/lag/conflicts + guard tests.
- [x] Sidecar exposure: `/repos/*` router mounting all six adapters from `fixtures/` (each mount degrades independently), `adapterStatus` entries in `/capabilities`, 7 API tests. **DONE (2026-11-04)**.
- Acceptance: each adapter has round-trip fixture tests + a conformance note (`docs/research/adapter-schemas.md`); no adapter blocks everything else.

### Phase 5 — Cross-view workflows
- [x] Selection bus roll-out across all panels with mapping tables + explicit "not correlated" states. **DONE (2026-11-04)** — `src/sdk/selection-mapping.ts` per-panel kind table (accepts dockview `panel-<id>` keys), `NotCorrelatedState` banner wired into all 7 panels; replay consumes `session_event` (seeks), terrain consumes robot/node (filters), world3d consumes `frame`; unit tests + E2E asserting the banner appears on network-topology and disappears on correlated panels. Also fixed a latent bug: ReactFlow never re-fit after async ELK layout (nodes off-viewport, unclickable).
- [x] Mission manifest v1 (competitive-analysis Gap 1) and mission timeline panel. **DONE (2026-11-04)** — versioned `mission.json` (`mission.py`: schema/origin/hash validation, sha256 staleness rejection, event time-base bounds), fixture with real hashes over 6 artifacts, `/missions` + `/missions/{id}` endpoints (6 sidecar tests), `src/panels/mission-timeline.tsx` (artifacts with kind/sha256/origin badges, event timeline that seeks the shared TimeBus + publishes `session_event`), E2E: mission event drives replay cursor to 6000000000.
- [x] Tracker debugger v0 (Gap 3): SE(lifecycle) events overlayed on 3D + image panels. **DONE v0 (2026-11-04)** — `src/panels/track-debugger.tsx`: identity-colored bbox overlay on an image plane (stable per-track hue), DERIVED-badged lifecycle events (born/confirmed/occluded/dropped) computed from the PyRoboVision export (`deriveLifecycleEvents`, unit-tested), occlusion badges on bboxes, frame stepping. Honest v0 scope: no covariance ellipses, association matrix, or 3D overlay yet; the export contract has no camera image, so the plane is a synthetic canvas.
- [x] Workspace export/import; SyncFleet-backed annotation sync spike (Gap 4) — evaluation only, behind flag. **DONE (2026-11-04)** — `exportWorkspace`/`importWorkspace` on the workspace store (versioned JSON, schema-version rejection, sourceRev bump), palette commands "Workspace: export/import" (download + file picker), round-trip unit tests + E2E (export → theme change → import restores). SyncFleet spike: `src/sdk/annotation-sync.ts` pure merge/conflict logic (last-write-wins by `originSeq`, equal-seq cross-origin conflicts surfaced, never dropped), gated behind `annotationSync.enabled` config flag — no server wiring, no persistence, honestly evaluation-only. Also fixed: command palette kept its stale query across open/close (reopened with previous text still in the input).
- Acceptance: golden-mission demo drives 3D + graph + perception + terrain from one failure event. **PARTIAL (2026-11-04)** — mission event drives replay seek + selection bus; panels without mappings show explicit not-correlated states rather than fake correlation. Full cross-pane filtering (3D/graph/terrain focus) still open.

### Phase 6 — Benchmark and harden
- [ ] Performance budget campaign (master prompt §10): large graph threshold measurement (xyflow vs sigma switch point), message-rate ceilings, memory soak, dockview multi-panel limits; document real numbers vs claims.
- [ ] Security review vs `security-model.md`; negative tests; dependency/license audit.
- [ ] Docs: plugin author guide, sidecar deployment guide (macOS/Ubuntu), troubleshooting; honest competitive-claim revisions.
- [ ] Decide: do the flags/disabled paths from Phases 2-5 become GA, or stay documented as degraded?

## Risks & assumptions register

| Risk | Mitigation |
|---|---|
| foxglove-sdk protocol churn (post-ws-deprecation) | pin 0.30.x; conformance tests; protocol version negotiation |
| dockview/React 19 edge cases | Phase 2 validation spike first |
| PyRoboReplay wrapper only exposes event metadata, not payloads | source change upstream or PyO3 fork boundary — scoped in Phase 4 ticket |
| elkjs licensing distribution questions | confirmed before bundling; dagre fallback ready |
| macOS arm64-only wheels (PyRoboFrames) | recorded adapter degrades; Linux runs validated in CI |
| Single-maintainer bug risk (urdf-loader, cmdk) | lock versions; fork-ready posture |
| Inventing mission.json too eagerly | only after Phase 4 adapter schemas stabilize; keep additive |
