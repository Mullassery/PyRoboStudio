# PyRoboReplay: repository research for PyRoboStudio

- **Repository:** `/Users/georgimullassery/Desktop/Projects/pyroboreplay`
- **Revision examined:** `d23b64dc991bf921044a9f4336b6a2bca9176147` (`2026-10-28`), clean working tree, package version `2.13.1`
- **Research date:** `2026-10-30`
- **Mode:** read-only source audit. Nothing in PyRoboReplay was modified, built, installed, or test-executed. Read-only SQLite queries were run against the checked-in sample bag.
- **Purpose:** determine whether PyRoboReplay is useful to a browser-based robot-data visualization app.

## Bottom line

**Conditional yes, as a Python-side ROS 2 bag parser and mission-analysis engine. No, as a browser backend, replay UI, or turnkey data service.**

The strongest reusable parts are:

1. offline ROS 2 SQLite bag parsing with real CDR decoding for five common message types;
2. a mission/event model with failure detection and root-cause heuristics;
3. optional analysis of external detection/thermal/Nav2 artifacts.

The blockers are equally important:

1. **the Python `Event` wrapper exposes only metadata, not sensor payloads**, so the current Python API cannot drive a browser camera, LiDAR, IMU, or trajectory view;
2. there is **no HTTP/WebSocket/gRPC server, frontend, or stable app-facing schema**;
3. the CLI replay view is a terminal UI with incomplete playback/visualization, not a reusable timeline engine;
4. several headline features are stubs or only partially wired (`compare`, `analyze --detect-gaps`, MCAP import into `Mission`, camera HTML export);
5. the parser is single-robot, has no TF/frame transforms, and supports only five ROS message types.

For PyRoboStudio, reuse it behind an app-owned adapter, preferably a Python sidecar, and plan to **extend or fork the PyO3 boundary** to expose payloads and deterministic metadata. Do not vendor the whole repository into a browser build.

## What it actually does and implementation status

PyRoboReplay is a Rust core with a PyO3 Python extension and a Rust CLI:

- The Rust library contains ingestion adapters, event models, anomaly detection, causal/root-cause analysis, Phase 12-20 analysis modules, storage backends, and terminal replay/export code (`src/lib.rs:1-20`).
- The Python extension registers eight classes and eight functions (`src/lib.rs:913-930`).
- The Python package under `src/pyroboreplay/` re-exports those and adds optional Alpamayo, AlpaSim, MCAP, and Rerun adapters (`src/pyroboreplay/__init__.py:14-60`).
- The CLI exposes `replay`, `compare`, `analyze`, `list`, `terrain`, `forensics`, `nav2`, `session`, and `export` (`src/cli/args.rs:15-199`).

Verified status:

| Capability | Status | Evidence / caveat |
|---|---|---|
| ROS 2 SQLite `.db3` ingest | **Real** | `src/adapters/ros2.rs:31-125` |
| `.bag` ingest | **Only if it is SQLite/rosbag2** | Extension is accepted, then opened as SQLite (`src/adapters/ros2.rs:41-52`); ROS 1 bag format is not parsed |
| CDR decoding | **Real for 5 message types** | LaserScan, Image, Imu, Odometry, PoseWithCovarianceStamped (`src/adapters/ros2.rs:136-340`) |
| Unsupported topics | **Silently skipped** | Decode errors are discarded (`src/adapters/ros2.rs:75-79`); topic routing is by name substring, not message type (`src/adapters/ros2.rs:135-150`) |
| MCAP import into `Mission` | **Not wired** | `Mission.from_ros_bag()` uses `Ros2Adapter`, which rejects `.mcap` (`src/lib.rs:44-54`, `src/adapters/ros2.rs:41-45`) |
| MCAP import in Phase 14 `session` | **Partial/real** | The separate Phase 14 adapter detects `.mcap`, reads topic counts, and extracts raw payload bytes (`src/phase14/modality_adapters.rs:169-181`, `:241-259`) |
| Interactive replay | **Partial** | Terminal TUI only; Space toggles `is_playing` but static inspection found no timer that advances events (`src/cli/replay_ui.rs:189-205`) |
| LiDAR visualization | **Placeholder/buggy** | Renders synthetic sine-wave points (`src/cli/replay_ui.rs:64-73`); checks `event_type() == "LidarScan"` while it actually returns `"lidar_scan"` (`src/cli/replay_ui.rs:237-238,416-418`; `src/core/event.rs:258`) |
| Camera HTML export | **Placeholder** | Emits frame metadata and a “ready to load” message; actual frame loading is not implemented (`src/cli/camera_export.rs:493-499`) |
| Failure detection | **Partially real** | Seven heuristics exist, but perception failure is explicitly a placeholder (`src/core/anomaly_detector.rs:148-195`); navigation-deadlock and costmap-anomaly inputs are not produced by the ROS 2 adapter |
| Root-cause analysis | **Implemented over detected failures** | `Mission.analyze_failure()` builds a causal graph and analyzes the nearest event (`src/lib.rs:183-247`) |
| Reality-gap detection | **Analyzer exists, CLI path is empty** | CLI constructs `MissionAnalysisData` with every signal vector empty (`src/cli/mod.rs:138-159`) |
| Mission comparison | **CLI stub** | Prints “coming in v0.4” (`src/cli/mod.rs:111-117`) |
| Topic listing | **Not actually topics** | Lists sensor types/counts, not bag topic names/types (`src/cli/mod.rs:398-438`) |
| MCAP export | **Metadata-only** | Writes event type/robot/sensor and failures, no sensor payloads (`src/cli/export.rs:22-95`; `src/pyroboreplay/mcap_export.py:50-112`) |
| Rerun export | **Text timeline only** | Logs event/failure text, not sensor arrays (`src/pyroboreplay/rerun_export.py:77-108`) |
| HTTP/WebSocket server | **Not present** | No server framework or listener dependency; only an Ollama HTTP client and optional database/cloud clients (`Cargo.toml:27-60`) |
| MCP server | **Not shipped/useable** | Stale top-level `pyroboreplay/` tree is not in the maturin package (`pyproject.toml:59-70`); it is not registered by `_core` |

## License, version, platform, and runtime

| Item | Finding | Evidence |
|---|---|---|
| License | Apache-2.0 | `Cargo.toml:6`, `pyproject.toml:10`, `LICENSE:189` (`Copyright 2026 Georgi Mullassery`) |
| Version | `2.13.1` | `Cargo.toml:3`, `pyproject.toml:7` |
| Maturity | Beta / Development Status 4 | `pyproject.toml:15`, `README.md:115` |
| Language | Rust 2021 + Python/PyO3 | `Cargo.toml:4`, `Cargo.toml:28` |
| Python | `>=3.10`; tested wheels for 3.10-3.13 in CI | `pyproject.toml:12`, `:25-28`; `.github/workflows/ci.yml:72-73` |
| Build | maturin / PyO3 extension + Rust CLI | `pyproject.toml:1-3`, `:59-72`; `Cargo.toml:16-25` |
| Python dependency | `numpy>=1.24` | `pyproject.toml:13` |
| ROS runtime | **None required** | No `rclpy`/`rclrs`; bags are parsed offline as SQLite/CDR (`src/adapters/ros2.rs:51-125`) |
| SQLite | Bundled via `rusqlite` | `Cargo.toml:37` |
| Native/cloud weight | SQLite, image, MCAP, AWS S3, BigQuery, PostgreSQL, HTTP client, terminal UI | `Cargo.toml:37-60` |
| macOS | CI runs Rust unit tests and builds wheels on `macos-latest` | `.github/workflows/ci.yml:18-19`, `:72-73` |

The audit host's `python3` is **3.9.6**, below the package's `requires-python`. A sidecar would need Python 3.10-3.13 (or a source build).

The local `dist/` contains a complete `2.13.0` macOS arm64 cp312 wheel. A local `target/wheels/2.13.1` wheel is an editable `.pth` shim, not a normal release wheel. PyPI content was not independently verified.

## Architecture and ingestion semantics

### Data path

`Mission.from_ros_bag(path)` → `Ros2Adapter` → SQLite `topics` + `messages` → CDR decode → `MissionRecord { id, name, created_at, events }` (`src/lib.rs:44-54`; `src/adapters/ros2.rs:51-87`; `src/core/event.rs:311-349`).

The sample `warehouse_exploration_v1.db3` is a real rosbag2 SQLite file:

- 96,000 messages over 600 seconds;
- topics: `/lidar/scan`, `/camera/image_raw`, `/imu/data`, `/odom`;
- message-type counts: 6,000 LiDAR, 18,000 camera, 60,000 IMU, 12,000 odometry;
- about 50.3 MB of raw message data.

### Message support

The adapter decodes actual CDR bytes for:

- `sensor_msgs/msg/LaserScan` → `LidarScan` (`src/adapters/ros2.rs:154-194`);
- `sensor_msgs/msg/Image` → `CameraFrame` (`src/adapters/ros2.rs:196-227`);
- `sensor_msgs/msg/Imu` → `IMUData` (`src/adapters/ros2.rs:229-260`);
- `nav_msgs/msg/Odometry` → `OdometryUpdate` (`src/adapters/ros2.rs:262-304`);
- `geometry_msgs/msg/PoseWithCovarianceStamped` → `RobotPose`, with confidence derived from covariance (`src/adapters/ros2.rs:306-341`).

The real fixture `tests/fixtures/ros2_cdr_fixture.db3` contains six messages across those five types and is used to assert decoded values (`tests/test_ros2_cdr_decoding.rs:1-189`).

Not supported by this ingestion path:

- TF/`tf2_msgs`, `PointCloud2`, `NavSatFix`, `CompressedImage`, `CameraInfo`, `OccupancyGrid`, Nav2 status/action messages;
- MCAP, ROS 1 `.bag`, rosbag2 metadata-YAML directory ingestion;
- multiple robots, namespaces, or per-topic robot identity;
- configurable topic-to-sensor mapping.

Topic selection is heuristic substring matching (`scan`/`lidar`, `camera`/`image`, `imu`, `odom`/`odometry`, `pose`) and ignores `topic.msg_type` for routing (`src/adapters/ros2.rs:135-150`). Unsupported or failed messages are dropped without a user-visible report (`src/adapters/ros2.rs:75-79`).

### Timestamps, identity, and provenance

- Timestamps come from the **bag database receive time** (`messages.timestamp`, nanoseconds), not the ROS message header. The header stamp is decoded then discarded (`src/adapters/ros2.rs:133,165`).
- Every event is assigned `robot_id = "robot_1"` (`src/adapters/ros2.rs:177,215,250,286,328`).
- `MissionRecord.id` is a fresh UUID v4 on every load; the mission name embeds `Utc::now()` (`src/core/event.rs:320-326`; `src/adapters/ros2.rs:60`).
- No source file path, content hash, bag metadata, topic list, or decode-warning list is retained in the mission model.
- `Mission.duration_seconds()` truncates to whole seconds (`src/lib.rs:71-74`).
- `get_events_at_timestamp()` requires exact timestamp equality, not a tolerance window (`src/core/timeline.rs:204-214`).

This is a material issue for reproducible links, upload deduplication, multi-robot data, and sensor fusion.

## Python API relevant to visualization

The extension exports:

- classes: `Mission`, `Event`, `Failure`, `Hypothesis`, `RootCauseAnalysis`, `Action`, `FleetStatistics`, `GeoHotspot`;
- functions: `run_cli`, `load_pyterrainmap_grid`, `analyze_detection_gaps`, `fuse_rgb_thermal`, `analyze_nav2_diagnostics`, `build_navigation_session`, `run_op`, `ops`.

`Mission` exposes metadata and analysis methods such as `mission_id()`, `name()`, `event_count()`, `duration_seconds()`, `get_available_sensors()`, `get_sensor_frames()`, `get_all_events()`, `to_json()`, `detect_failures()`, `analyze_failure()`, and export helpers (`src/lib.rs:40-370`).

### Critical limitation: `Event` is metadata-only

The Python `Event` struct contains only:

- `event_type`
- ISO-8601 timestamp
- optional `robot_id`
- optional `sensor_type`

(`src/lib.rs:372-425`)

Methods are only `get_event_type()`, `get_timestamp()`, `get_robot_id()`, and `get_sensor_type()` (`src/lib.rs:397-417`). There is no camera pixel data, LiDAR ranges, IMU sample, odometry pose, costmap, or confidence getter.

Therefore `mission.get_sensor_frames("camera")` returns a list of metadata records, not frames a UI can render.

### The only full-payload escape hatch is `mission.to_json()`

`Mission.to_json()` serializes the entire `MissionRecord`, including all event payloads (`src/lib.rs:156-160`; `src/core/event.rs:311-317`). This can technically supply sensor data to an adapter, but:

- it is an all-or-nothing whole-mission dump;
- camera `image_data` is `Vec<u8>` (`src/core/event.rs:36-44`) and there is no `serde_bytes`/base64 custom serializer, so JSON represents each byte as a number;
- there is no paging, time window, compression, or binary transport;
- large real camera/LiDAR streams will be expensive to serialize and transfer.

Use it only for a small proof of concept, not as the production transport.

### Other API limitations

- No API returns raw bag topics, message types, or unsupported-topic warnings.
- No typed Python wrapper for the Phase 16-20 Rust modules; only six JSON operations via `ops()`/`run_op()` (`src/ops.rs:49-128`).
- No Python API for actual gap analysis, even though Rust analyzers exist.
- No compare API; the CLI compare path is a stub.
- No deterministic identity: the same bag loaded twice gets two different mission IDs.
- No lazy/streaming access: `from_ros_bag()` materializes every event in memory.

## Analysis capabilities and accuracy caveats

The explicit failure engine runs eight checks (`src/core/anomaly_detector.rs:82-94`):

| Check | Can fire from a ROS 2 bag parsed here? | Caveat |
|---|---|---|
| Near collision | Yes, from LiDAR | Hard 0.5 m threshold (`:96-146`) |
| Perception failure | No | `low_confidence_count` is hardcoded to zero; explicitly a placeholder (`:148-195`) |
| Sensor dropout | Yes | Detects only a sensor whose last sample is >1 s behind the latest sample (`:197-245`) |
| Communication loss | Yes | Based on inter-message gap > 3x average (`:247-302`) |
| Navigation deadlock | No | Requires `NavigationDecision` events, which the adapter never creates (`:304-335`) |
| Localization loss | Yes, from pose confidence | Covariance-derived confidence is real (`:337-368`) |
| Oscillation | Yes, from odometry | Direction-change heuristic (`:370-431`) |
| Costmap anomaly | No | Requires `CostmapUpdate`, which the adapter never creates (`:433-482`) |

Root-cause analysis operates on detected failures and event proximity; it is heuristic, not a validated physics/model diagnosis (`src/lib.rs:183-247`).

The reality-gap framework has substantial Rust analyzer code, but the CLI path supplies an empty mission (`src/cli/mod.rs:138-159`), so `analyze --detect-gaps` currently produces no data-driven findings. No Python binding exposes this path.

## Reuse options

### Option A: Python sidecar with app-owned HTTP/WS adapter (recommended first move)

Run the package in a small PyRoboStudio-owned Python service, keep the browser thin, and expose only what the UI needs.

Use the current API for:

- load/validate a bag;
- mission summary, duration, sensors, event counts;
- failure and root-cause results;
- `session`/`forensics`/`nav2` artifact analysis.

Do **not** rely on the current API for sensor rendering. For a proof of concept, `Mission.to_json()` can feed a limited timeline. For production, add a narrow payload API first.

Pros: reuses real CDR decoding, SQLite parsing, failure heuristics, and Apache-licensed source; no reimplementation of the parser; browser remains presentation-only.

Cons: requires Python 3.10+ with a native wheel/source build; adds a sidecar; current payload API is insufficient; app must implement transport, paging, caching, limits, and path sandboxing.

Suggested app-owned contract after a small fork/patch:

- `GET /missions/{id}/summary` — stable hash, start/end ns, duration, topic count, sensor counts, decode warnings;
- `GET /missions/{id}/events?types=&start=&end=&limit=` — metadata pages only;
- `GET /missions/{id}/lidar/{index}` — ranges/intensities/angle metadata as arrays;
- `GET /missions/{id}/camera/{index}` — JPEG/WebP/PNG or raw frame metadata + binary payload;
- `GET /missions/{id}/odometry` and `/pose` — downsampled tracks;
- `POST /missions/{id}/analyze` — failures/root cause;
- `GET /missions/{id}/gaps` — only after wiring `MissionAnalysisData`.

A minimal fork should add PyO3 methods for payload access, deterministic content-hash IDs, raw topic inventory, and decode diagnostics. Apache-2.0 permits this; retain the license and copyright notice, and document modifications.

### Option B: Library-assisted offline normalization

Use PyRoboReplay during ingest to parse bags and produce app-owned artifacts:

- normalized event metadata;
- decoded sensor arrays in an app-chosen binary/Parquet/JSON format;
- failure/root-cause reports;
- a manifest with source hash, topics, message types, time range, and warnings.

The browser then reads only PyRoboStudio artifacts. This avoids a permanent Python runtime but duplicates the transport/format work and still requires extending the payload boundary.

### Option C: CLI subprocess

The CLI is not sufficient for a browser replay backend:

- `list` lists sensor types, not topics;
- `compare` is a stub;
- `analyze --detect-gaps` has no populated inputs;
- `replay` is a terminal UI with no playback clock and synthetic LiDAR;
- `export` writes metadata-only MCAP;
- there is no command that emits full event/sensor payloads.

Use the CLI only for quick validation or offline reports, not as the app API.

### Option D: Selective Rust extraction / WebAssembly

The source is Apache-2.0 and the parsing/model code is reusable, but the crate is monolithic. A browser/WASM build would need to exclude or replace:

- PyO3 bindings;
- bundled SQLite (`rusqlite`);
- AWS/GCP/Postgres clients;
- terminal UI (`crossterm`, `ratatui`);
- `ureq`, image, and other native-heavy modules.

A new small crate containing only the CDR reader, ROS 2 SQLite mapping, event model, and a serializable payload schema is plausible. Alternatively, port the five CDR layouts and topic mapping to TypeScript and use `sql.js`/`wa-sqlite` in the browser. Both are engineering work, not a drop-in reuse.

### Option E: Vendor the entire repository

**Not recommended for the initial integration.** The repository contains unrelated large systems (cloud storage, terminal UI, Phase 12-20 code), several unwired features, and a PyO3 boundary that discards the payloads the UI needs. Vendor a pinned, minimal fork only after deciding exactly which modules to keep.

## Relationship to other PyRoboStudio research

In this research set, PyRoboFrames is the stronger general-purpose ROS 2/MCAP-to-tabular ingestion option and already exposes MCAP conversion, topic dataframes, slicing, and alignment. PyRoboReplay is stronger for mission-level failure heuristics and causal/root-cause framing, but its Python payload boundary is weaker.

Avoid running two independent bag parsers in production unless there is a clear reason. Options:

- use PyRoboFrames for generic topic extraction and PyRoboReplay only for its mission analysis on the same normalized events;
- or make PyRoboReplay the canonical mission parser and add payload endpoints itself;
- or use one parser as a validation cross-check during ingest, not as a runtime dependency.

The two event models are not directly interchangeable, so combining them requires a normalization layer.

## Risks and gotchas

1. **No payload API.** The single biggest integration blocker. `Event` metadata cannot feed a visualization.
2. **Whole-mission `to_json()` is not a transport.** Raw `Vec<u8>` becomes numeric JSON arrays; no paging or binary frames.
3. **No server or browser transport.** PyRoboStudio must own HTTP/WS, binary media, caching, and auth.
4. **Single-robot assumption.** `robot_1` is hardcoded; no TF tree, namespaces, or multi-robot identity.
5. **No TF/calibration.** Sensor frames are stored as strings but not transformable; no camera intrinsics or point-cloud projection.
6. **Header timestamps ignored.** Bag receive time is used; clock-skew/header-stamp workflows will differ from ROS tools.
7. **Unsupported topics disappear silently.** A bag can load “successfully” while most data is omitted.
8. **Non-deterministic mission identity.** Re-uploading the same file yields a new UUID/name.
9. **Feature claims drift from code.** README calls comparison and gap analysis stable, and says `list` shows topics; source shows otherwise.
10. **No tests were run here.** CI only runs `cargo test --lib` on Ubuntu/macOS; Rust integration tests and Python tests are not in that job (`​.github/workflows/ci.yml:46-47`). README claims 869 unit tests plus Python and fixture tests (`README.md:115`), but this audit did not verify them.
11. **No large-real-image performance evidence.** The sample's “camera” messages are only 248 bytes each; real 640x480+ images are three orders of magnitude larger.
12. **Native dependency weight.** A full Python build pulls SQLite, image, MCAP, AWS/GCP/Postgres, terminal UI, and HTTP libraries.

## Recommendation

**Adopt PyRoboReplay only as a Python-side parsing/analysis component, behind a PyRoboStudio-owned service boundary. Do not adopt its CLI/TUI or vendor the whole repository.**

Do this in order:

1. **Product decision:** does the first UI need full sensor frames, or only mission metadata, failure markers, and analysis? If frames are required, the current Python API is insufficient and a fork/patch is mandatory.
2. **Spike the ingestion:** on Python 3.10-3.13 macOS arm64, load the checked-in real fixture and sample bag; record load time, peak memory, event counts, decode omissions, and `to_json()` size.
3. **Spike the payload bridge:** add one narrow method (e.g. `Mission.get_camera_frame(index)` returning bytes + metadata) and one LiDAR method; measure browser transfer with realistic 640x480/1280x720 images and 360-1440 beam scans.
4. **Spike a sidecar:** expose summary, paged events, one sensor track, failures, and one image through the app's existing HTTP/WS stack; test path sandboxing and file-size limits.
5. **Decide parser ownership:** if PyRoboFrames is also selected, avoid duplicate parsing. Choose one canonical event model and one normalization contract before building UI features.
6. **Patch only the minimum:** deterministic content-hash IDs, raw topic inventory, visible decode warnings, payload access, and time-window/paging support. Keep the rest of the repository out of the vendored surface.

**Do not build on:** the CLI replay UI, camera HTML export, `compare`, `analyze --detect-gaps` as currently wired, metadata-only MCAP export, or the unshipped/stale MCP tree.

## Unverified / not present

Not verified or not present in this audit:

- No build, install, test execution, benchmark, or browser run.
- No PyPI availability/content check; no assertion about current upstream releases.
- No verification of all 869 claimed unit tests or Python tests.
- No real large-image or long-mission latency/memory measurement.
- No HTTP/WebSocket/gRPC server, web frontend, or browser API in the repository.
- No functional MCP server or packaged MCP integration.
- No ROS 1 bag, MCAP-to-`Mission`, TF, PointCloud2, compressed image, camera-info, Nav2 action/status, or costmap ingestion.
- No multi-robot, namespace, per-topic robot identity, or transform tree.
- No deterministic mission identity or content-hash provenance.
- No typed Python API for full event payloads.
- No documented app-facing schema, pagination, auth, or media transport.
- No proof that the failure/root-cause/gap heuristics are accurate against labeled real incidents.
- No complete third-party dependency license audit; only the top-level Apache-2.0 license was verified.
- No macOS runtime validation on this host; system Python is 3.9.6, below the package minimum.

## Evidence index

Key files reviewed:

- `README.md:35-115`, `:244-260`
- `Cargo.toml:1-60`; `pyproject.toml:1-78`
- `LICENSE:189`
- `src/lib.rs:1-54`, `:71-160`, `:183-370`, `:372-425`, `:900-940`
- `src/core/event.rs:23-44`, `:74-309`, `:311-349`
- `src/core/anomaly_detector.rs:82-482`
- `src/core/timeline.rs:160-239`
- `src/adapters/ros2.rs:31-358`
- `src/cli/args.rs:15-199`
- `src/cli/mod.rs:48-117`, `:119-205`, `:312-440`
- `src/cli/replay_ui.rs:51-73`, `:93-205`, `:237-238`, `:411-418`
- `src/cli/camera_export.rs:55-112`, `:424-500`
- `src/cli/json_output.rs:7-143`
- `src/cli/export.rs:22-95`
- `src/pyroboreplay/__init__.py:1-115`
- `src/pyroboreplay/mcap_export.py:50-112`
- `src/pyroboreplay/rerun_export.py:48-108`
- `src/phase14/session_report.rs:1-214`
- `src/phase14/modality_adapters.rs:132-440`
- `src/ops.rs:1-128`
- `src/pyroboreplay/cli.py:1-21`
- `tests/fixtures/ros2_cdr_fixture.db3`
- `tests/test_ros2_cdr_decoding.rs:1-189`
- `tests/integration_tests.rs:1-177`
- `tests/test_exposure_api.py:1-90`
- `.github/workflows/ci.yml:12-115`
- `warehouse_exploration_v1.db3` (read-only SQLite queries)
- `dist/pyroboreplay-2.13.0-cp312-cp312-macosx_11_0_arm64.whl` (archive listing only)
