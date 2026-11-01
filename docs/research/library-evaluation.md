# PyRoboStudio Library Evaluation

**Research date:** 2026-10-31
**Method:** Live verification against npm/PyPI registry metadata, GitHub API (release dates, archived status, license files), vendor docs, and bundle-size estimates where available. Performance claims made by vendors are labeled as claims. Every unverified point is explicitly flagged — nothing is assumed.
**Inputs:** `competitive-analysis.md` (do not fork archived Foxglove Studio; use MCAP; build the PyRobo\*-native differentiators) and the seven per-repo audits in `docs/research/repos/` (Python sidecar pattern, no servers exist in the ecosystem repos).

## Scope

Evaluate the concrete dependency choices for: (1) the React app shell, (2) the ROS graph explorer, (3) the 3D world viewer and terrain views, (4) charting, (5) the Python sidecar transport and message tooling, (6) testing. The master prompt's preferred stack (React/TS strict/Vite/Tailwind/shadcn) is validated rather than re-litigated.

## Verdict summary

| Concern | Primary choice | Backup | Excluded |
|---|---|---|---|
| Dockable panels | `dockview-react` 8.8.3 (MIT) | `flexlayout-react` 0.11.1 (MIT) | `golden-layout` (dormant since 2022, no React binding) |
| ROS graph rendering | `@xyflow/react` 12.12.0 (MIT) | `sigma v4` + `@react-sigma/core` 6 for the multi-thousand-node regime | cytoscape (Canvas, weaker React/DOM badges) |
| Graph data model | `graphology` (both renderers consume it) | — | — |
| Hierarchical layout | `elkjs` (EPL-2.0/GPL-3.0 dual) or `@dagrejs/dagre` 3.1.3 (MIT) | — | `d3-force` as primary (dormant ~5 yrs; OK as force fallback) |
| Robot/TF/sensor 3D | `three` 0.187 + `@react-three/fiber` 9.8 + `@react-three/drei` 10.7 + `urdf-loader` 0.13.1 (Apache-2.0) | raw three.js if R3F friction appears | `@foxglove/three` / `@react-three/cesium` / `react-urdf-loader` (do not exist on npm) |
| Terrain / 3D Tiles / H3 | `deck.gl` 9.4.1 (H3 + Tile3DLayer shipped) and/or `cesium` 1.146 (Apache-2.0) + `resium` 1.27 | — | rendering both on one canvas with R3F (context conflict) |
| Charts (embedded) | `recharts` 3.10.1 (MIT) | `visx` 4.0 (MIT) for custom scales | `uPlot` for hi-rate series is a candidate but **not yet verified** |
| Sidecar transport | `foxglove-sdk` Python server 0.30.3 (MIT, subprotocol `foxglove.sdk.v1`) + ROS-native `foxglove_bridge` 3.6.3 where a full ROS env exists | `rosbridge` 4.2.1 + `roslib` 2.1.0 for services/params | `@foxglove/ws-protocol` npm + `foxglove-websocket` PyPI (**deprecated/archived**) |
| Bag/decode (no ROS install) | `rosbags` 0.11.9 (Apache-2.0 per PyPI; verify LICENSE file) + `mcap` 1.6.0 + `mcap-ros2-support` 0.6.0 (MIT) | PyRoboReplay for `.db3` | — |
| Command palette | `cmdk` 1.1.1 (MIT) via shadcn `Command` | fork-ready (12-mo release cadence) | — |
| State | `zustand` 5.0.16 (MIT) | — | — |
| Testing | `vitest` 5 + `@testing-library/react` 16.3.3 + `@playwright/test` 1.64.1 | — | — |

---

## 1. Core frontend stack

Verified via npm registry API and GitHub, 2026-10-31.

| Package | Latest | License | Status | Notes |
|---|---|---|---|---|
| react | 19.3.1 (2026-10-14) | MIT | Very active | Baseline; all selections below have React 19 peer support |
| typescript | 7.0.2 (2026-07-08) | Apache-2.0 | Active | Go-native compiler, ~10x faster checks (**claim**). Caveat: no full programmatic compiler API until 7.1 — avoid tsc-API-dependent tooling for now |
| vite | 8.3.5 (2026-10-21) | MIT | Very active | Current major is **8** (not 7 as assumed by the master prompt); v6 line still receiving patches |
| tailwindcss | 4.3.3 | MIT | Active | v4 CSS-first config; dark/light via CSS variables |
| shadcn (ui) | CLI 4.23.0 | MIT | Very active | Registry/copy-in model — we own the component code; pairs with Tailwind v4 |
| zustand | 5.0.16 | MIT | Very active | 0.5 KB gzip; `persist` middleware covers workspace layout localStorage |

## 2. Dockable panel system (critical: layout serialization)

| Library | Version | License | Last release | Gzip | Serialization |
|---|---|---|---|---|---|
| **dockview-react** | 8.8.3 (2026-10-30) | MIT | 2026-10-30 | ~90 KB | **Built-in** `api.toJSON()`/`fromJSON()`, `onDidLayoutChange`, edge groups serialized; official localStorage example |
| flexlayout-react | 0.11.1 (2026-09-26) | MIT | 2026-09-26 | ~53 KB | Built-in `Model.fromJson`/`toJson`; ESM-only; 0.x semver; maintained by Caplin |
| react-mosaic-component | 7.2.1 (2026-09-28) | Apache-2.0 | 2026-09-28 | ~43 KB + react-dnd/lodash tree | Manual (DIY serialization); **npm trap:** the package `react-mosaic` is an unrelated abandoned 2017 package |
| golden-layout | 2.6.0 (2022-09-26) | MIT | **~4 years ago** | ~30 KB | Built-in config persistence but no React binding |

**Decision: `dockview-react`.** Rationale: first-party React package, highest release cadence, IDE-like panels (tabs, floating groups, popouts), and — decisive for the "saved workspace layouts" requirement — first-class JSON round-trip. `flexlayout-react` is the fallback if dockview's React 19 integration or API proves problematic (smaller bundle, model-driven API). CSS is a side-effect import; an optional commercial `dockview-enterprise` exists as a superset — core usage must not depend on it.

## 3. Graph visualization (ROS graph explorer + network topology)

Verified 2026-10-31.

| Library | Version | License | Rendering | Grouping/collapse | Edge badges | React story |
|---|---|---|---|---|---|---|
| **@xyflow/react** | 12.12.0 | MIT (v11/v12 both MIT — the "license changed at v12" rumor is **false**; only React Flow *Pro* examples are paid) | SVG/DOM (React components) | Built-in subflows (`parentId`, group nodes) | Best-in-class: built-in `label` + arbitrary custom-drawn edge components in DOM | Native |
| sigma (v4) | 4.0.4 (2026-10-27) | MIT | WebGL2, SDF node **and edge** labels | **None built-in** — manual reducer/cluster work | SDF WebGL labels (less rich than DOM) | `@react-sigma/core` 6.0.0 (tracks sigma majors with breaking changes) |
| cytoscape.js | 3.34.4 | MIT | Canvas; vendor claims ~100K elements (**claim**) | Built-in compound nodes; collapse via extension (**version unverified — flagged**) | Style-based labels, cruder | No official wrapper |
| elkjs | 0.12.1 (0.13.0 tagged 2026-10-28 — tagging anomaly **flagged**) | EPL-2.0 OR GPL-3.0-or-later (dual since 0.12.0) | layout only | — | — | renderer-agnostic; runs in Web Worker |
| @dagrejs/dagre | 3.1.3 (2026-10-24) | MIT | layout only | — | — | renderer-agnostic; revived late 2025; use `@dagrejs/dagre`, not old `dagre` |
| d3-force | 3.0.0 (2021) | ISC | layout only | — | — | dormant ~5 yrs but stable |
| deck.gl-community/graph-layers | 9.4.2 | MIT | WebGL GPU force + layered DAG | — | — | officially "semi-maintained" per own docs |
| @cosmos.gl/graph | 3.0 | MIT | WebGL2 GPU force (claims 100Ks–millions) | force-only | — | ties into commercial Cosmograph suite |

**Decision: `@xyflow/react` 12.x as primary renderer for the ROS graph explorer.**
- The explorer's target regime is tens to hundreds of nodes (typical ROS systems); DOM/SVG rendering is acceptable there, and the DOM edge/caption model is what makes QoS badges, activity indicators, and search-highlighting cheap to build.
- Built-in subflow nodes map directly onto ROS namespace grouping/collapsing.
- Layouts are external anyway in every library here: use `elkjs` (layered, port-based — good semantic fit for pub/sub endpoints; EPL-2.0 embedding is fine for an app, confirm with license review for distribution mode) or `@dagrejs/dagre` (MIT, simpler).

**Scale escape hatch: sigma v4 + graphology** for the network-topology panel if PyNetworkIntel graphs or merged ROS graphs reach thousands of nodes. Cost: manual compound/grouping logic.

**Data-model decision: model the graph in `graphology` from day one**, shared by both renderers; this keeps the ROS graph panel and network panel distinct in semantics yet on one rendering infrastructure (master prompt §8.7).

Genuinely excluded: gephi-lite (GPL-3.0 application, not a library); 2026-era entrants (@kortexya/nodus etc.) — near-zero adoption, unclear licenses, unverified.

## 4. 3D world viewer and terrain

Verified 2026-10-31.

| Package | Version | License | Status | Notes |
|---|---|---|---|---|
| three | 0.187.0 (2026-10-30) | MIT | Excellent cadence | pin versions; WebGPURenderer still evolving API |
| @react-three/fiber | 9.8.2 (2026-10-14) | MIT | Very active | fiber v9 requires React 19 |
| @react-three/drei | 10.7.9 | MIT | Very active | large package — tree-shake; not a Cesium bridge |
| urdf-loader | 0.13.1 (2026-07-08) | Apache-2.0 | repo pushed 2026-10-22 | **single-maintainer bus factor** — lock versions. No published `react-urdf-loader` exists; wrap `URDFLoader` in R3F ourselves |
| CesiumJS | 1.146.0 (2026-10-01) | **Apache-2.0 (confirmed via LICENSE.md; the "license moved away" rumor is false)** | monthly cadence; `@cesium/core` package split in 1.146 | ~128 MB npm download; Vite worker plugins needed; heavy; ion hosting is the only commercial part — irrelevant when streaming our own PyTerrainMap tiles |
| resium | 1.27.0 (2026-10-06) | MIT | maintained | React wrapper for Cesium |
| deck.gl | 9.4.1 (2026-10-28) | MIT | Excellent | `H3HexagonLayer`/`H3ClusterLayer` and `Tile3DLayer` (Cesium 3D Tiles via loaders.gl) are **shipped** in core/geo-layers, not playground-only; needs `h3-js` |

**Decisions:**
1. **Robot/TF/sensor 3D panel:** R3F + urdf-loader, labels via `troika-three-text` 0.52.5 (MIT) / drei `<Text>`. Point clouds: drei/`<Points>` + custom shader is realistic to a few million points; beyond LiDAR scale (~10M+), use raw `BufferGeometry` + fp16 quantization or `deck.gl` `PointCloudLayer`. 

   Do **not** rely on the Foxglove 3D ecosystem: `@foxglove/three` and `@foxglove/regl` do not exist on npm; the Studio repo's 3D panel implementation is not published as a reusable package. Borrow patterns from its documented feature set (URDF, markers, camera projection, occupancy grids), not code.
2. **Terrain panel:** `deck.gl` for H3 confidence/staleness/conflict layers over PyTerrainMap data (H3 layers shipped, MIT) and/or Cesium+Resium when true 3D Tiles terrain streaming is needed. **Keep R3F and deck.gl/Cesium on separate canvases** (coexistence on one context is awkward); synchronize via shared zustand camera/pose state — which also satisfies the synchronized image/3D requirement.
3. ros3djs / ros2djs (RobotWebTools) are not on npm and effectively unmaintained (latest release 1.1.0, 2022; pinned three r89) — excluded, per competitive analysis.

## 5. Charting

Verified 2026-10-31 (sources: npm registry, GitHub, comparative bundles from third-party measurement).

| Library | Version | License | Gzip (feature-equivalent test) | Notes |
|---|---|---|---|---|
| **recharts** | 3.10.1 | MIT | ~116 KB (SVG) | Very active (release days ago); declarative; fine for topic-rate/error-count style panels. SVG degrades above ~5k points (**community claim**) |
| visx | 4.0.0 | MIT | ~24.6 KB | Low-level primitives; steeper; version-skew risk across ~30 packages |
| chart.js + react-chartjs-2 | 4.5.1 / 5.3.1 | MIT | ~54.2 KB (Canvas) | Registration model is easy to get wrong |
| echarts (modular) | 6.1.0 | Apache-2.0 | ~193 KB | Overkill for embedded panels; best for data-heavy composites |
| uPlot | — | — | — | Strong candidate for high-rate time-series (Hz-level message timing), but **not yet verified this session — flagged for follow-up before Phase 3** |

**Decision: `recharts` for embedded charts** in data inspector and diagnostics panels (matches stacked choice "professional, not fancy"); revisit `uPlot`/`visx` when the replay/perf modules need scrubbed, high-rate series or linked-brushing.

## 6. Sidecar transport, ROS 2 tooling, and message decode

Verified 2026-10-31 (PyPI/npm registry JSON, GitHub, ROS index, docs.ros.org).

| Item | Version | License | Status | Key facts |
|---|---|---|---|---|
| **foxglove-sdk (PyPI)** | 0.30.3 (2026-10-26) | MIT | Active (Rust/maturin) | Maintained successor to the deprecated ws-protocol libs; subprotocol `foxglove.sdk.v1`; server capabilities include **Time (playback control)** and ClientPublish; documented playback loop (broadcast_time / broadcast_playback_state) — directly fits Module D |
| foxglove_bridge (ROS 2 pkg) | 3.6.3 (2026-10-21) | MIT | Released into humble/jazzy/kilted/lyrical/rolling | C++ bridge; .msg + .idl schemas; parameters; **graph introspection** over WS; auto-QoS negotiation. Requires a full ROS 2 env → Ubuntu sidecar |
| @foxglove/ws-protocol (npm) | 0.8.0 | MIT | **Deprecated** — repo README says migrate to Foxglove SDK | Never build on this |
| foxglove-websocket (PyPI) | 0.1.4 | — | **Archived on PyPI** | Never build on this |
| rosbridge_suite | 4.2.1 (2026-08-12) | BSD | Active across humble→rolling | JSON serialization (no CDR/binary-friendly); graph via rosapi services; QoS/depth handling has long-standing limitations (**not re-verified against issue tracker — flagged**) |
| roslib (npm) | 2.1.0 (~2026-03) | BSD-2 | Active | Attested; ws 8.x; typed; vitest-tested. Viable fallback transport |
| mcap (PyPI) | 1.6.0 (2026-10-19) | MIT | Active | Stdout: standalone decode, no ROS env needed |
| mcap-ros2-support (PyPI) | 0.6.0 (2026-10-19) | MIT | Active | CDR → ROS 2 messages from MCAP standalone |
| @mcap/core (npm) | 2.4.0 | MIT | Active | Browser-side MCAP read/write |
| rosbags (PyPI) | 0.11.9 | Apache-2.0 per PyPI metadata (**earlier history possibly MPL-2.0 — verify repo LICENSE before redistribution — flagged**) | 0.11.x current | Standalone CDR typestore decode; reads `.db3` and `.mcap` without ROS installed — this is what keeps macOS-only development possible |

**ROS 2 distro reality (Oct 2026):**
- **Lyrical Luth is the current LTS** (released 2026-05-22, EOL 2031; Tier 1: Ubuntu 26.04). Kilted Kaiju EOLs 2026-11-30 — do not target. Jazzy LTS until 2029.
- **macOS is Tier 3 for all distros** (Homebrew source builds, community-supported). Therefore the sidecar **must degrade gracefully when `rclpy` is absent**, remaining functional over the pure-Python decode path (rosbags/mcap) and PyRoboReplay `.db3` parsing for recorded data; live-mode requires the Ubuntu sidecar. This matches the ecosystem-audit finding that no PyRobo\* repo ships a server.

**TF history:** no off-the-shelf server exists; rosbridge only sees `/tf` as ordinary topics. The sidecar must own a TF buffer (`tf2_ros` via rclpy) and expose frame history explicitly — an implementation item, not a library choice.

### Transport decision

**Primary: Python FastAPI sidecar serving the Foxglove WebSocket protocol via `foxglove-sdk`'s server package (MIT, actively maintained), plus app-owned custom endpoints for graph queries, TF history, and PyRobo\* adapters.**
Rationale:
- Binary-friendly with schema announcements (rosbridge's JSON-only shape is wrong for image/lidar payloads).
- The Time capability + playback state loop gives recorded-session control semantics free of charge and already maintained upstream (releases 17 days ago).
- `foxglove_bridge` remains the shortcut for live graph introspection + QoS negotiation when rclpy is present on Ubuntu, without the sidecar re-deriving DDS discovery.
- Custom envelope endpoints carry the PyRobo\*-native semantics (mission manifests, tracker lifecycles) that no generic protocol knows about — per the competitive analysis, this is the differentiator layer.

**Fallback/channel:** rosbridge + roslib for services/parameters/lows-rate JSON.
**Rejected:** deprecated `@foxglove/ws-protocol`/`foxglove-websocket`; custom binary protocol from scratch (reinventing maintained MIT protocol semantics).

## 7. Testing

| Package | Version | License | Notes |
|---|---|---|---|
| vitest | 5.0.5 (2026-10-15) | MIT | Native Vite 8 config sharing |
| @testing-library/react | 16.3.3 | MIT | Requires explicit `@testing-library/dom@^10` install |
| @playwright/test | 1.64.1 (2026-10-14) | Apache-2.0 | Monthly cadence |

## 8. Risks and open items (carried forward)

1. **elkjs licensing**: EPL-2.0/GPL dual license — acceptable for app embedding, but confirm distribution-mode implications with license review before bundling (or fall back to MIT `@dagrejs/dagre`).
2. **rosbags license history**: PyPI metadata says Apache-2.0; a past MPL-2.0 lineage is suspected. Verify the LICENSE file in `github.com/tidycode/rosbags` before vendoring/redistribution.
3. **`urdf-loader` bus factor**: single hobby maintainer. Pin versions; vendor a fork path in the SDK docs.
4. **dockview CSS + React 19 integration** and bundle actuals: verify at commit time with `rollup-plugin-visualizer`; agent-reported 90 KB gzip is a bundlephobia estimate.
5. **uPlot** for high-rate time-series: unverified candidate — evaluate before Phase 3 replay work.
6. **cytoscape-expand-collapse**, `@cosmos.gl/graph` maturity, rosbridge QoS-issue specifics: unverified, flagged. Only relevant if the graph renderer decision is revisited.
7. **cmdk release cadence** (last release 2025-03): low but real risk; shadcn's copy-in `Command` component abstracts a swap.

### Follow-up verifications required before code depending on them

- Vite 8 + React 19 + dockview sample app must `tsc --noEmit` and pass Vitest smoke tests during Phase 2 scaffolding — this validates agent data against the actual toolchain. **✅ Verified 2026-10-31** (`src/spike/dockview-spike.test.tsx`): layout round-trip passes; learned caveats recorded in ADR-0003.
- `foxglove-sdk` Python server: run the documented playback-loop snippet against a test and confirm the protocol version/subprotocol handling before building the data-source contract on it. **✅ Verified 2026-10-31** (`sidecar/spikes/test_foxglove_handshake.py`): subprotocol `foxglove.sdk.v1`, `serverInfo` with `time` capability, `advertise.channels[]`; channels created via context-level `foxglove.log()`.

## Sources

Accessed 2026-10-31.

- npm registry API: react, typescript, vite, tailwindcss, shadcn, zustand, dockview-react, flexlayout-react, react-mosaic-component, golden-layout, cmdk, @tanstack/react-virtual, @testing-library/react, @playwright/test, vitest, @xyflow/react, sigma, @react-sigma/core, cytoscape, elkjs, @dagrejs/dagre, d3-force, deck.gl, @cosmos.gl/graph, three, @react-three/fiber, @react-three/drei, urdf-loader, troika-three-text, cesium, resium, recharts, roslib, @mcap/core, @foxglove/ws-protocol, @foxglove/rosmsg
- PyPI registry JSON: foxglove-sdk, foxglove-websocket, mcap, mcap-ros2-support, rosbags
- https://dockview.dev/docs/core/state/save · /docs/core/state/load
- https://github.com/caplin/FlexLayout (README: Model.fromJson/toJson, ESM-only)
- https://reactflow.dev (license discussions #4812, #3369; subflow docs)
- https://github.com/jacomyal/sigma.js/releases; https://cytoscape.org/roadmap.html
- https://threejs.org; https://r3f.docs.pmnd.rs; https://github.com/gkjohnson/urdf-loaders
- https://github.com/CesiumGS/cesium (LICENSE.md; Releases); https://cesium.com/platform/cesiumjs
- https://deck.gl/docs/api-reference/geo-layers/h3-hexagon-layer; deck.gl geo-layers catalog
- https://registry.npmjs.org/recharts; https://github.com/recharts/recharts (LICENSE)
- https://we.inc/guides/react-chart-libraries (bundle comparison, 2026-10-14); https://www.pistack.xyz/posts/2026-08-20-react-charting-libraries-recharts-visx-react-chartjs-2-comparison
- https://github.com/foxglove/ws-protocol (deprecation notice); https://pypi.org/project/foxglove-sdk; https://index.ros.org/p/foxglove_bridge
- https://index.ros.org/p/rosbridge_suite; https://registry.npmjs.org/roslib/latest
- https://docs.ros.org/en/lyrical/ (REP-2000 distro tiers; macOS Tier 3; Kilted EOL banner)
- https://github.com/tidycode/rosbags
