# PyRoboStudio Competitive Analysis

**Prepared:** 2026-10-30  
**Scope:** Browser-based robotics visualization and operations tooling relevant to PyRoboStudio and the PyRobo* Python/Rust ecosystem.  
**Evidence standard:** Product status, releases, licenses, deployment requirements, and pricing were checked against official project sites, documentation, repositories, package manifests, and license files. No independent performance benchmark was run; performance statements are vendor/project claims and are labeled as such.  
**Important assumption:** The PyRoboStudio repository currently contains documentation directories but no implementation or product specification. This report therefore treats PyRoboStudio as a proposed browser-based studio for the PyRobo* family, not as a shipped product.

## Executive summary

The robotics visualization market is mature and crowded. Foxglove is now a commercial visualization, data-platform, fleet, and agent platform; its open-source Studio repository is archived, while its MIT SDK and MCAP remain open. Rerun has the strongest open-source SDK for custom multimodal logging and a polished desktop/web viewer, with a commercial Hub for shared catalogs. Lichtblick is the maintained open-source browser/desktop fork of Foxglove Studio. RViz2, rqt_graph, and PlotJuggler remain strong, actively maintained desktop tools for ROS-native 3D visualization, graph introspection, and time-series analysis. Webviz is effectively dormant, ROSboard is a useful lightweight robot web server but lacks authentication, and ros3djs is a reusable but aging 3D library.

PyRoboStudio should not compete on generic 3D rendering, MCAP playback, panel counts, or time-series plotting. Those are table stakes and already well served. The defensible near-term opportunity is to make the studio **native to the PyRobo* data model and mission workflow**: join PyRoboVision tracks, PyRoboReplay causal findings, PyTerrainMap confidence/terrain state, PyRoboSimulator provenance, and SyncFleet health in one time-synchronized, local-first browser workspace. The strongest gaps are cross-repository mission correlation, tracker/perception semantics, local-first multi-user collaboration, and terrain/fleet trust visualization. These are execution wedges, not permanent moats: Foxglove and Rerun could add similar connectors.

## Market map

| Category | Products | What they own | Relevance to PyRoboStudio |
|---|---|---|---|
| Commercial robotics data platform | Foxglove | Visualization, hosted/on-prem data platform, fleet, SDK, MCAP, agents | Benchmark for breadth, deployment, and enterprise security; too heavy and vendor-controlled as a default for a small local-first stack |
| Open-source browser/desktop studio | Lichtblick | Foxglove-compatible browser/desktop visualization with extensions | Closest maintained open-source shell; MPL-2.0 implications |
| Open-source multimodal SDK + viewer | Rerun | Python/Rust/C++ logging, desktop/web viewer, `.rrd`, SQL/dataframe, local catalog | Best model for custom multimodal developer experience; Hub is commercial |
| ROS-native desktop visualization | RViz2 | 3D displays, TF, robot models, sensors, C++ plugins | Strong live ROS 3D debugging; not a browser or multi-user platform |
| ROS graph introspection | rqt_graph | Live node/topic graph, QoS diagnostics | Strong narrow tool; not a data viewer |
| Time-series / multimodal desktop analysis | PlotJuggler | High-performance plots, transforms, video/3D, many formats, plugins | Strong analysis tool; not a browser, fleet, or mission workspace |
| Dormant web visualization | Webviz | ROS bag playback, rosbridge live view, React/regl panels | Reference architecture only; maintenance/security risk |
| Lightweight robot web server | ROSboard | Browser visualization directly on robot, ROS 1/2, mobile-friendly | Good low-resource pattern; no auth, limited scope |
| JavaScript 3D library | ros3djs | three.js/rosbridge 3D primitives | Building block, not a product; aging dependencies |

## Product findings

### Foxglove

**Verified.** Foxglove Studio is no longer an actively developed open-source project. The `foxglove/studio` repository is archived, last pushed 2024-07-18, with its last release at v2.9.0 [S6]. Foxglove's 2024-03-10 "Foxglove 2.0" announcement marked the end of open-source Studio development [S2]. The current product spans visualization, a data platform, fleet management, and agents. The MIT-licensed SDK supports C++, Python, and Rust for live streaming and MCAP logging [S3]. Extensions are TypeScript-based and cover custom panels, message converters, topic aliases, and data loaders [S4].

Pricing is usage- and seat-based. Free is $0/month with 10 GB storage, 3 visualization users, 5 devices, and 1 project. Pro is $20/month plus usage, including 1 TB storage, 3 users (then $42/user/month), and 5 devices (then $20/device/month). Enterprise is custom, with self-hosted data available and unlimited projects. Academic is free with 1 TB storage and up to 10 devices [S1]. The Free plan can open local files without internet; the paid platform is where hosted collaboration, indexing, fleet, and organizational features live [S1].

On-premises deployment is an Enterprise-class exercise, not a small-team install: Kubernetes 1.30+, Helm 3.12+, an S3-compatible object store, ingress/HTTPS, bucket notifications, and a Foxglove site token are required [S5]. Foxglove states HTTPS/TLS 1.2 in transit, AES-256 at rest, SSO/SAML, SOC 2 Type II, and GDPR compliance [S1].

**Assessment.** Foxglove is the broadest product in the market and the benchmark for a polished browser experience, data platform, and enterprise controls. Its weaknesses for this project are structural: the open-source Studio is gone, the platform is commercial, self-hosting is infrastructure-heavy, and the product is organized around generic recordings/devices rather than PyRobo* semantics. Its SDK is excellent but is a logging/streaming layer, not a PyRoboStudio application framework.

**Implication.** Do not try to out-Foxglove Foxglove. Use MCAP and, where useful, the Foxglove SDK for interoperability. Compete on open/local-first deployment and PyRobo*-native workflows.

### Lichtblick

**Verified.** Lichtblick is a maintained fork of Foxglove Studio, available in the browser and as a desktop app on Linux, Windows, and macOS. It supports ROS 1, ROS 2, MCAP, live systems, recorded data, custom layouts, panels, message converters, and TypeScript/React extensions [S7]. Its latest observed release is v1.30.0 (2026-10-22) [S8]. The raw license file is MPL-2.0; GitHub's API returns `NOASSERTION` only because it cannot classify the file automatically [S8].

**Assessment.** Lichtblick is the most credible open-source starting point for a Foxglove-like browser studio. It already solves the expensive generic shell: layouts, panels, playback, extensions, and ROS/MCAP ingestion. Its constraints are a smaller ecosystem than Foxglove, dependence on upstream fork maintenance, and MPL-2.0's file-level copyleft. It does not provide Foxglove's hosted data platform, fleet management, or enterprise collaboration layer.

**Implication.** Evaluate Lichtblick as an upstream or reference architecture before writing a new studio shell. If PyRoboStudio is proprietary, isolate MPL-covered files and obtain legal review; do not copy MPL code into proprietary files. If PyRoboStudio is open source, contributing upstream may be cheaper than maintaining a divergent fork.

### Rerun

**Verified.** The Rerun SDK is free and open source under Apache-2.0/MIT, with Python, Rust, and C++ APIs, an interactive desktop and web viewer, SQL/dataframe queries, a columnar `.rrd` format, layers, a local catalog, and a PyTorch dataloader. Rerun Hub is the commercial offering: a managed, single-tenant catalog over the customer's S3-compatible storage, with auth/SSO, link sharing, byte-range indexing, and optional data-plane deployment into the customer's account for large teams [S9]. The latest observed release is 0.41.0 (2026-10-28) [S10].

**Assessment.** Rerun has the best developer experience for logging custom multimodal robotics/ML data and is a strong fit for PyRoboVision trajectories, PyRoboFrames samples, and simulation runs. Its viewer is polished and its data model is flexible. It is not a ROS graph tool, a fleet console, or a multi-user operations platform; shared collaboration and catalog infrastructure are Hub features. Its custom data model also means PyRobo* semantics still need an adapter layer.

**Implication.** Treat Rerun as both a competitor and a possible interoperability target. Exporting `.rrd` or embedding the Rerun web viewer may be faster than building a 3D/time engine. Do not make Rerun Hub the assumed collaboration layer unless the commercial model fits.

### RViz2

**Verified.** RViz2 is the ROS 2 3D visualizer. The current rolling `rviz2` package is 16.0.4 and is BSD-licensed [S11]. Its display model includes RobotModel, TF, laser scans, point clouds, images, markers, and custom C++ displays/panels. The official user guide documents the display list, per-display properties/status, fixed frame, target frame, and the TF2 transform hierarchy [S12].

**Assessment.** RViz2 is the default live 3D debugger for ROS 2 and has a deep plugin ecosystem. It is a desktop Qt application, not a browser or multi-user platform. It does not provide a data catalog, fleet overview, mission forensics, terrain confidence semantics, or Python/Rust-native application SDK. Its fixed-frame model is powerful but easy to misconfigure; changing the fixed frame clears current data rather than re-transforming it [S12].

**Implication.** RViz2 sets user expectations for TF, URDF, point clouds, and live ROS displays. PyRoboStudio should interoperate with ROS where present, but should not require ROS or clone RViz's C++ plugin ecosystem.

### rqt_graph

**Verified.** rqt_graph is a Qt GUI plugin that visualizes the ROS computation graph: nodes, topics, and their connections. Current package versions observed are 2.0.3 (rolling), 1.5.6 (Jazzy), and 1.3.2 (Humble), all BSD-licensed [S13]. ROS tutorials use it for live introspection and highlighting of node/topic relationships [S14]. The project changelog has added QoS-incompatibility highlighting and endpoint details.

**Assessment.** rqt_graph is excellent at one narrow job: showing the live ROS graph. It is not a data-flow verifier, recorder, 3D viewer, or time-series tool. It primarily shows node/topic relationships, not message contents or historical graph evolution. It is desktop Qt and live-only.

**Implication.** A browser graph panel is useful, especially for remote fleets, but it is not a differentiator by itself. If built, it should clearly separate discovery from actual message flow and avoid implying that a drawn edge proves data is arriving.

### PlotJuggler

**Verified.** PlotJuggler 4.0.0 was released 2026-09-21 and is MPL-2.0 [S15][S16]. It is a desktop, GPU-accelerated, extensible multimodal platform: time-series/XY plots, images and video (H.264/H.265/AV1), 3D point clouds, meshes, URDF models, occupancy/elevation maps, 3D markers, and trajectories. It reads CSV, MCAP, Parquet, PX4 ULog, LeRobot, MP4, PCD, and PLY; it streams ROS 2, MQTT, ZeroMQ, UDP, WebSocket, WebRTC, and Lab Streaming Layer; and it supports ROS 1/2, Protobuf, JSON, CBOR, BSON, Arrow, and MessagePack encodings. Transforms can be written in Lua and Python, and a plugin SDK/Marketplace exists [S15]. The official project describes PJ4 as a rewrite with a new columnar/lazy-loading data engine and Marketplace [S16].

**Assessment.** PlotJuggler is the strongest dedicated time-series and signal-analysis tool in this set. Its 4.0 release also makes it a credible multimodal viewer. It remains a desktop application with no browser, multi-user, fleet, or terrain-confidence layer. Its plugin ecosystem is newer in PJ4, and users should verify distribution packaging rather than assuming every ROS package tracks PJ4 immediately.

**Implication.** Do not build a plotting/transform engine from scratch. Use a focused browser plotting library for embedded views, and interoperate with PlotJuggler via MCAP/CSV/Parquet where deep signal analysis is needed.

### Webviz

**Verified.** Webviz is an Apache-2.0, browser-based ROS bag playback and visualization application, with live rosbridge support and reusable React/regl-worldview libraries [S17]. The repository has not been pushed since 2022-12-17 and has no GitHub latest release; the project is effectively dormant.

**Assessment.** Webviz proved the browser ROS-bag workflow and its panel architecture is still instructive. It is not a safe foundation in 2026 without a dependency/security refresh, and it lacks current ROS 2/MCAP momentum.

**Implication.** Use as an architecture reference, not a dependency.

### ROSboard

**Verified.** ROSboard is a BSD-3-Clause ROS node that runs a web server on the robot, typically at port 8888, and is ROS 1/ROS 2 compatible, mobile-friendly, and lightweight [S18]. Its README explicitly lists basic username/password authentication as future work [S18].

**Assessment.** ROSboard is a good pattern for low-resource, robot-hosted, phone-friendly status viewing. It is not a secure remote-access product, a multi-robot platform, or a deep analysis tool.

**Implication.** Copy the deployment simplicity, not the unauthenticated security model. Any robot-hosted viewer needs TLS, authentication, origin controls, and read-only defaults.

### ros3djs

**Verified.** ros3djs is a BSD-3-Clause JavaScript 3D visualization library built on three.js, roslibjs, and rosbridge [S19]. Its README still documents three.js r89 and roslibjs 0.20, and its latest GitHub release is 1.1.0 from 2022, despite later repository activity [S19].

**Assessment.** ros3djs is a useful source of ROS-shaped 3D primitives but is not a modern application foundation. Its pinned dependencies and release cadence are risks for a new browser product.

**Implication.** Prefer current three.js/Cesium or a maintained studio shell; borrow concepts, not the dependency chain.

## Capability comparison

| Capability | Foxglove | Lichtblick | Rerun | RViz2 | rqt_graph | PlotJuggler |
|---|---|---|---|---|---|---|
| Browser client | Yes | Yes | Web viewer | No | No | No |
| Live ROS data | Yes | Yes | Via SDK/adapters | Yes | Yes | ROS 2 |
| Recorded playback | MCAP/ROS | ROS/MCAP | `.rrd` | Via bag play | No | Many formats |
| 3D visualization | Strong | Strong | Strong | Strong | No | Strong |
| Time-series plots | Strong | Strong | Strong | Limited | No | Best-in-class |
| ROS computation graph | No | No | No | TF only | Yes | No |
| Extension model | TypeScript | TypeScript | Code/SDK | C++ | Python/Qt | C++/Lua/Python |
| Multi-user/collaboration | Cloud/on-prem | No | Hub | No | No | No |
| Local-first operation | Local files | Yes | Yes | Yes | Yes | Yes |
| License/cost | Freemium/commercial | MPL-2.0 | Apache/MIT SDK; paid Hub | BSD | BSD | MPL-2.0 |

## Genuine gaps and candidate differentiators

The following are gaps in the **current market plus PyRobo* integration**, not claims that no competitor could add the feature. Each includes a testable MVP.

### Gap 1: One mission timeline across recordings, live data, simulation, terrain, and fleet state

**User problem.** A failure investigation spans a ROS bag, tracker output, a terrain map, a simulator run, and a fleet sync journal. Engineers manually align timestamps and files, then rebuild context in separate tools. PyRoboReplay explicitly targets this "why did it fail?" problem but is offline and CLI-first; it exports MCAP/Rerun for visual review [S21]. Foxglove and Rerun can display individual recordings well, but they do not know PyRobo* mission/run identities or join all these artifacts by default.

**Existing solutions.** Foxglove comparison mode and layouts; Rerun multimodal timelines; PyRoboReplay causal analysis; PyTerrainMap/Cesium for terrain; PyRoboSimulator event logs. Each covers a slice.

**Gap.** No browser workspace that ingests a **mission manifest** and presents live/replayed sensor data, causal findings, terrain state, simulation provenance, and fleet sync health on one synchronized timeline with cross-pane selection.

**Proposed MVP.** Define a versioned `mission.json` manifest with mission/run IDs, robot IDs, time bases, artifact URIs and hashes, provenance, and schema versions. Build a time-sync service and a "focus object" bus: selecting a failure event filters the 3D view, plots, tracker overlay, terrain layer, and sim pane. Persist the view as a URL-addressable session.

**Test.** Use a golden mission with a known failure and artifacts from PyRoboReplay, PyRoboVision, PyTerrainMap, and PyRoboSimulator. Verify one-click navigation from failure to correlated sensor/track/terrain/sim views. Measure time-to-hypothesis against manual tool switching; snapshot the layout for regression.

**Risk.** This is integration-heavy and depends on stable schemas. Foxglove/Rerun could add generic "session" abstractions, but they are unlikely to adopt PyRobo* semantics quickly.

### Gap 2: Repo-native Python/Rust data contracts and adapters

**User problem.** PyRobo* produce custom objects: `Track`/`Detection` lifecycles, causal hypotheses, H3 terrain observations with confidence decay, simulation provenance, and sync journals. Today each viewer integration would require bespoke conversion code.

**Existing solutions.** Foxglove SDK (C++/Python/Rust) and Rerun SDK (Python/Rust/C++) both solve generic logging. Foxglove's SDK is MIT but oriented toward Foxglove/MCAP; Rerun's SDK is excellent but uses Rerun's data model and Hub for shared scale [S3][S9].

**Gap.** No open, typed, versioned adapter layer that turns PyRobo* objects into a studio session without forcing users into a commercial platform or a second custom data model.

**Proposed MVP.** Ship `pyrobostudio` Python package plus Rust bindings with `StudioSession`, typed record schemas, and adapters for PyRoboVision, PyRoboReplay, PyTerrainMap, PyRoboSimulator, PyRoboFrames, and SyncFleet. Use MCAP for archive/live transport, Arrow/Parquet for tabular data, and 3D Tiles for terrain. Publish schema compatibility tests.

**Test.** Round-trip fixtures from every repo; verify schema version negotiation and forward/backward compatibility. Ingest 1 million records and measure browser load/interaction. Add a conformance suite that fails when a repo changes a public record shape.

**Risk.** Adapter sprawl. Keep the core schema small and put repo-specific semantics in plugins.

### Gap 3: Identity-aware perception and tracker debugging

**User problem.** Generic 3D viewers render boxes, but tracking bugs are about identity over time: ID switches, occlusion gaps, birth/confirm/death transitions, missed detections, association errors, and uncertain trajectory predictions. RViz requires custom C++ displays; Foxglove requires TypeScript extensions; Rerun can be scripted but is not turnkey for PyRoboVision's lifecycle.

**Existing solutions.** RViz2 displays; Foxglove 3D/plots/extensions; Rerun custom logging; PyRoboVision's tracker and predictor APIs. None presents PyRoboVision semantics as a first-class debugger.

**Gap.** A perception debugger that treats track identity and uncertainty as the primary visual object, not an overlay afterthought.

**Proposed MVP.** Overlay tracks with stable ID colors and lifecycle state; show predicted vs measured position, covariance ellipses, trajectory fans, occlusion gaps, detection confidences, association matrix, and ID-switch markers. Link each track to its raw detections and trajectory prediction. Export a shareable "track report."

**Test.** Synthetic MOT fixture with a known ID switch and occlusion; verify every lifecycle event is visible and correct against ground truth. Add screenshot/DOM regression tests and a metric panel for ID switches, false tracks, and track fragmentation.

**Risk.** Domain-specific UI can become niche. Start with PyRoboVision's exact data model, then generalize.

### Gap 4: Local-first, multi-user collaboration without Kubernetes or per-seat cloud pricing

**User problem.** Field teams need shared layouts, annotations, bookmarks, and replay links on a LAN or offline. Foxglove's collaboration platform is cloud/on-prem with seat/device pricing, and its on-prem path requires Kubernetes, Helm, S3-compatible storage, and enterprise setup [S1][S5]. Lichtblick is local but does not provide a shared multi-user session layer. Rerun Hub is commercial and cloud-operated [S9].

**Existing solutions.** Foxglove hosted/on-prem; Rerun Hub; SyncFleet for peer-to-peer SQLite replication over mutual TLS 1.3 with explicit peer enrollment and per-dataset ACLs [S22].

**Gap.** No open browser studio that uses a local-first sync layer for annotations, layouts, and session metadata, with no central broker and no mandatory cloud.

**Proposed MVP.** Store sessions/annotations/layouts in SQLite; replicate selected datasets through SyncFleet; scope to trusted LAN/VPN (SyncFleet is explicitly not hardened for the public internet); add optional read-only share tokens and an audit journal. Resolve conflicts with the existing `manual`/`remote_wins`/`local_wins`/`last_write_wins`/`merge_fields` policies.

**Test.** Three-node LAN with disconnect/reconnect; concurrent annotations on the same session; verify convergence and no data loss. Confirm no traffic leaves the LAN. Run a threat review covering certificate pinning, enrollment, revocation, and authorization.

**Risk.** SyncFleet is alpha and public-internet hardening is out of scope. Do not market this as secure remote access until independently reviewed.

### Gap 5: Terrain and fleet trust as first-class visual layers

**User problem.** Multi-robot terrain maps carry age-decayed confidence, stale cells, coverage gaps, conflicting observations, and provenance. Existing viewers show geometry but not trust/freshness. PyTerrainMap stores append-only H3 observations with confidence decay, exposes spatial/temporal queries, and exports Cesium 3D Tiles [S22]. Its audit also flags optional/write-only API auth, unauthenticated reads, no rate limiting, and self-signed TLS by default [S23].

**Existing solutions.** PyTerrainMap + Cesium for geometry/tiles; Foxglove fleet management for device connectivity (not map trust); RViz occupancy grids; PlotJuggler series plots.

**Gap.** No browser operational view that makes map confidence, observation age, source robot, conflict status, and fleet sync health first-class layers over terrain.

**Proposed MVP.** Render H3/3D Tiles with confidence heatmap, age/staleness, source-robot filter, and conflict badges. Scrub time to watch decay and coverage. Overlay SyncFleet journal/sync status and optional PyNetworkIntel topology. Query PyTerrainMap through an authenticated backend proxy, never directly from the browser.

**Test.** Seed synthetic observations from three robots; advance time and verify decay, stale regions, and conflicts render correctly. Load 1 million H3 cells and measure frame rate. Verify the proxy enforces auth, rate limits, TLS, and read-only access.

**Risk.** Depends on PyTerrainMap data quality and API hardening. Treat the proxy as mandatory, not optional.

## Other opportunities not selected for the top five

- **Headless CI evidence:** deterministic layout snapshots and assertions over MCAP/telemetry, posted to a PR. Valuable, but closer to PyRoboReplay/PyRoboFrames and less clearly a studio wedge.
- **Notebook embedding:** Foxglove already offers Jupyter integration; Rerun and PlotJuggler are strong in analysis workflows.
- **ROS graph web view:** useful, but rqt_graph owns the narrow use case and a web clone is not defensible alone.
- **AI agent/MCP interface:** Foxglove already ships agents, an MCP server, and Slack integration; "AI-native" is not a unique claim without workflow-specific evidence.

## Capabilities PyRoboStudio should not reinvent

- **MCAP/ROS bag parsing and writing.** Use the MIT MCAP ecosystem, PyRoboFrames, PyRoboReplay, and `rosbags` where needed [S20][S21].
- **3D rendering, URDF, point clouds, TF.** Use three.js/Cesium or a maintained shell; do not build a renderer.
- **Time-series plotting and transforms.** Use a focused browser plotting library; interoperate with PlotJuggler for deep analysis.
- **Video decode.** Use browser WebCodecs or a proven server-side decoder; do not build codecs.
- **Terrain tiling/LOD.** PyTerrainMap already exports Cesium 3D Tiles [S22].
- **Generic plugin sandbox.** Use iframe/worker isolation with CSP; do not invent a new extension runtime unless necessary.
- **Auth/SSO.** Use OIDC/OAuth and a reverse proxy; do not build an identity provider.
- **Hosted catalog/search.** This is Foxglove/Rerun Hub territory; only build if local-first search is a proven user need.
- **ROS discovery and message serialization.** Reuse rosbridge/roslibjs or native ROS libraries; do not reimplement DDS.

## Build, buy, and partner recommendation

1. **Do not fork archived Foxglove Studio.** It is no longer maintained [S2][S6].
2. **Evaluate Lichtblick as an upstream/reference shell.** It is the closest maintained open-source browser studio, but MPL-2.0 requires deliberate file-level compliance [S7][S8].
3. **Use MCAP as the archive/interchange format and Rerun `.rrd` as an optional analysis export.** PyRoboReplay already supports both MCAP export and optional Rerun export [S21].
4. **Build the differentiators:** mission manifest, PyRobo* adapters, focus/selection bus, tracker debugger, local session server, SyncFleet collaboration, and terrain/fleet trust overlays.
5. **Keep the first release read-only.** Replay and live tap are enough to prove the workflow; teleop/control adds a large security and liability surface.

Suggested sequence:

- **Phase 1:** MCAP/ROS 2 replay + PyRoboReplay findings + basic 3D/plots.
- **Phase 2:** PyRoboVision tracker overlay and mission manifest.
- **Phase 3:** live WebSocket tap and remote robot agent.
- **Phase 4:** local-first annotations/layouts via SyncFleet.
- **Phase 5:** PyTerrainMap confidence/terrain and fleet health.

## Licensing, deployment, and security implications

| Component | License | Implication |
|---|---|---|
| Foxglove SDK / MCAP | MIT | Safe to integrate; platform features remain commercial |
| Lichtblick | MPL-2.0 | File-level copyleft; modifications to covered files must be MPL; isolate from proprietary code |
| Rerun SDK | Apache-2.0 / MIT | Permissive; Hub is commercial and separately contracted |
| RViz2 | BSD | Permissive; C++ plugin ecosystem |
| rqt_graph | BSD | Permissive; Qt desktop |
| PlotJuggler | MPL-2.0 | File-level copyleft; plugin SDK terms should be checked separately |
| Webviz | Apache-2.0 | Permissive but dormant; dependency risk |
| ROSboard | BSD-3-Clause | Permissive; no authentication |
| ros3djs | BSD-3-Clause | Permissive; aging dependencies |

**Deployment.** PyRoboStudio should support three modes: local single-user (files on disk), LAN team server (local auth + SyncFleet), and optional cloud/on-prem enterprise. Foxglove's on-prem requirements show why a lightweight LAN mode is a real differentiator: Kubernetes, Helm, object storage, ingress, and enterprise administration are too much for a small robotics team [S5].

**Security.** Do not repeat ROSboard's unauthenticated model [S18] or expose PyTerrainMap directly: its audit found optional/write-only auth, unauthenticated reads, no rate limiting, and self-signed TLS by default [S23]. Use TLS, OIDC or local accounts, origin allowlists, read-only defaults, per-session share tokens, and a backend proxy for terrain/robot APIs. SyncFleet's mTLS and peer enrollment help, but it is not hardened for the public internet [S22].

**Data governance.** Local-first is a feature, not an accident. Make data residency, retention, and "what leaves the robot/LAN" explicit in the UI and documentation. Foxglove's enterprise security posture is a benchmark, but its cloud-first model is not the only valid answer.

## Open questions that change the recommendation

1. Is PyRoboStudio a product, an internal tool, or a reference implementation?
2. Is it open source, source-available, or proprietary? This determines whether Lichtblick/PlotJuggler reuse is practical.
3. Browser-only, desktop wrapper, or both?
4. Must it work without ROS 2 installed? The PyRobo* ecosystem suggests yes, but ROS interoperability is still valuable.
5. Is the primary user a perception engineer, a mission/ops engineer, an ML engineer, or a fleet operator?
6. Read-only visualization, or teleop/control? Control changes the security and product scope substantially.
7. Is multi-user collaboration a day-one requirement or a later differentiator?
8. What are the performance targets: number of robots, topics, points, hours of recording, and concurrent users?

## Sources

Accessed 2026-10-30 unless otherwise noted.

- [S1] Foxglove pricing. https://foxglove.dev/pricing
- [S2] Foxglove, "Foxglove 2.0," 2024-03-10. https://foxglove.dev/blog/foxglove-2-0-unifying-robotics-observability
- [S3] Foxglove SDK documentation. https://docs.foxglove.dev/docs/sdk
- [S4] Foxglove Extension API. https://docs.foxglove.dev/docs/extensions/extension-api
- [S5] Foxglove on-premises Primary Site installation. https://docs.foxglove.dev/docs/data/primary-sites/installation
- [S6] Foxglove Studio repository. https://github.com/foxglove/studio
- [S7] Lichtblick documentation. https://lichtblick-suite.github.io/docs/
- [S8] Lichtblick repository, releases, and LICENSE. https://github.com/lichtblick-suite/lichtblick
- [S9] Rerun pricing. https://rerun.io/pricing
- [S10] Rerun repository and releases. https://github.com/rerun-io/rerun
- [S11] RViz2 repository and rolling `package.xml`. https://github.com/ros2/rviz/blob/rolling/rviz2/package.xml
- [S12] ROS 2 RViz User Guide. https://docs.ros.org/en/lyrical/Tutorials/Intermediate/RViz/RViz-User-Guide/RViz-User-Guide.html
- [S13] rqt_graph repository and package manifests. https://github.com/ros-visualization/rqt_graph
- [S14] ROS 2 "Understanding topics" tutorial (rqt_graph). https://docs.ros.org/en/lyrical/Tutorials/Beginner-CLI-Tools/Understanding-ROS2-Topics/Understanding-ROS2-Topics.html
- [S15] PlotJuggler repository and README. https://github.com/PlotJuggler/PlotJuggler
- [S16] PlotJuggler 4 announcement. https://plotjuggler.io/blog/announcing-plotjuggler-4
- [S17] Webviz repository and README/LICENSE. https://github.com/cruise-automation/webviz
- [S18] ROSboard repository and README. https://github.com/dheera/rosboard
- [S19] ros3djs repository, README, and LICENSE. https://github.com/RobotWebTools/ros3djs
- [S20] MCAP. https://mcap.dev/
- [S21] Local PyRoboReplay README and alternatives analysis. `/Users/georgimullassery/Desktop/Projects/PyRoboReplay/README.md`, `/Users/georgimullassery/Desktop/Projects/PyRoboReplay/docs/ALTERNATIVES.md`
- [S22] Local PyTerrainMap and SyncFleet READMEs. `/Users/georgimullassery/Desktop/Projects/PyTerrainMap/README.md`, `/Users/georgimullassery/Desktop/Projects/SyncFleet/README.md`
- [S23] Local PyTerrainMap audit findings. `/Users/georgimullassery/Desktop/Projects/PyTerrainMap/docs/AUDIT_FINDINGS.md`
