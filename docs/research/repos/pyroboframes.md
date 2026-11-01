# PyRoboFrames: integration research for PyRoboStudio

**Revision:** `812a61b` (`main`, 2026-10-28), workspace `2.7.2`. Read-only audit; nothing was built, installed, modified, or test-executed.

## Bottom line

**Conditional yes as a Python-side ingestion/decoding library; no as a browser backend or visualization service.** PyRoboFrames opens LeRobot v3.0 datasets in Rust and returns NumPy batches of tabular state/action features plus decoded RGB camera frames. It also converts MCAP/ROS 2 logs into time-indexed Parquet tables. It has no HTTP/WebSocket server, CLI, browser client, media URLs, thumbnails, or UI.

Best fit: a Python sidecar that imports `pyroboframes`, exposes an app-owned API, and encodes frames for the browser. Alternative: use it only for offline ETL, with the app reading produced Parquet/media itself. Do **not** build on MCP or `load_dataset()` for LeRobot.

## Verified findings

- Apache-2.0, Python `>=3.10`, NumPy/PyArrow runtime deps; maturin/PyO3 package `pyroboframes`, with Rust core and `_core` extension (`pyproject.toml:1-10,54-61,112-125`; `Cargo.toml:8-12`).
- Workspace version is `2.7.2`; `README.md:146` says `2.7.1`; `ROADMAP_HONEST.md` is still `v2.5.1`. `Cargo.toml:11` says Rust 1.78 while `rust-toolchain.toml:2` pins 1.97. Docs drift is real.
- Public core exports: `RoboFrameDataset`, `Loader`, `PrefetchLoader`, `ValidationReport`, `PointCloudPy`, `CameraIntrinsicsPy`, `CameraCalibrationPy`, `convert_mcap`, `convert_ros2_bag` (`crates/pyroboframes-py/src/lib.rs:1246-1266`).
- LeRobot v3.0 reader expects `meta/info.json`, episode Parquet under `meta/episodes/`, data shards under `data/`, and MP4s under `videos/` (`crates/pyroboframes-core/src/dataset.rs`, `episodes.rs:1-131`, `data.rs:1-80`).
- Episode metadata includes `dataset_from_index`/`dataset_to_index`, data shard indices, and per-camera video shard plus `from_timestamp`/`to_timestamp` (`episodes.rs:194-240`).
- `dataset.loader(...)` supports batching, shuffling, episode filtering, temporal windows, camera selection, output backends, prefetch, and sampling strategies (`lib.rs:294-337`). Camera frames are `uint8 [B,H,W,3]`; `output="numpy_zerocopy"` is available.
- Python loader batches expose feature arrays and `episode_index` but drop `global_index`, `frame_in_episode`, and resolved timestamps (`lib.rs:820-822,866-867`; Rust `Sample` has them at `loader.rs:18-35`). `episodes()` exposes only `episode_index,length,from_index,to_index`, not per-camera offsets.
- `Loader.seek()`/`position()` are cursor-based, not direct frame-at-index access (`lib.rs:779-790`).
- MCAP conversion decodes JSON, protobuf-with-descriptor, and CDR/ros2msg; writes one Parquet per topic plus `metadata.json` and `stats.json` (`mcap.rs:5-102,284-291`). ROS 2 `.db3` conversion decodes CDR topics using embedded `ros2msg` definitions and reports skipped topics (`rosbag.rs:1-90`).
- `RoboticsDataFrame.from_converted()` provides topic tables, `slice()`, `align()`, `resample()`, and `save()` over nanosecond `log_time` (`dataframe.py:147-230,270-345`).
- Calibration supports intrinsics/extrinsics/projection; depth and point-cloud helpers exist. There is no TF tree/frame graph, and calibration is not auto-loaded from dataset metadata (`calibration.rs`; `depth_io.py`; `video_sync.py`).
- macOS arm64 has native VideoToolbox decode; the local `_core.abi3.so` is arm64 and links VideoToolbox/CoreMedia/CoreVideo/IOSurface/Metal. PyPI wheels are documented as macOS arm64 only; Linux/Windows are CI artifacts (`README.md:116,135-142`).
- MCP is not usable: `pyroboframes.toml:1-25` advertises port 8771, but `mcp.rs` returns empty/zero placeholders, is not bound in `_core`, and both MCP test files use mocks. Technical debt calls it dead code; the Python MCP module was removed in v2.6.0 (`TECHNICAL_DEBT.md` TD-0005; `CHANGELOG.md:102-113`).
- Confirmed bug: `_format_registry.py` `LeRobotLoader` imports `load_episode/load_frame/get_episode_count` from `lerobot.py`, which is writer-only. Registry auto-detection also misses normal LRobot v3 directories. Use `RoboFrameDataset.from_path()`.
- `dataset_loaders.py` Waymo/nuScenes/KITTI classes are not exported and use optional OpenCV. No HTTP/CLI/browser/WASM entry point was found. Repository search found no server framework; `streaming.py` is a client-side MQTT/Kafka/WebSocket ingester.
- Tests are broad (about 375 Python test functions, 330 Rust test attributes) but MCP tests are mock-only, GR00T live tests are opt-in, and no tests run here.

## Integration options

1. **Python sidecar (recommended if Python is acceptable).** App-owned API wraps `RoboFrameDataset`/`Loader` and `convert_*`; service encodes decoded frames to JPEG/WebP and caches them. Keeps tested native path, but adds Python/native deployment and all media-serving work.
2. **Offline ETL.** Use PyRoboFrames to normalize datasets/logs into Parquet/LeRobot; browser reads artifacts through its own stack. No runtime Python, but no browser media is produced.
3. **Rust crate in a native backend.** Apache-2.0 and possible, but larger than the Python path.
4. **Direct browser/WASM or MCP.** No usable path exists today.

## Risks / gaps

- Timeline scrubbing needs frame provenance that the Python loader does not expose; derive from tabular index/timestamp, use sequential `position`/`seek`, or add a binding.
- Raw arrays only: no image transport, HLS/DASH, thumbnail cache, auth, or session model.
- Video support is H.264/HEVC `hev1`-first on macOS; `hvc1` HEVC and full B-frame reordering are unsupported. AV1 falls back to FFmpeg/dav1d.
- Deployment outside macOS arm64 requires source builds with Rust and FFmpeg, or the offline option.
- Real-dataset performance, seek latency, codec compatibility, and Linux/Windows behavior are unverified.

## Recommendation and spike

Adopt behind a Python service boundary. Validate: (1) open a representative LeRobot dataset and decode one camera; (2) prove deterministic frame/timestamp lookup and measure scrub latency; (3) encode frames and measure browser-facing latency/memory; (4) convert one real MCAP and one ROS 2 bag and verify topics/skips/alignment; (5) test the wheel on the actual deployment OS. Avoid MCP, LeRobot `load_dataset()`, CLI, and direct WASM.

## Evidence

| Claim | Source |
|---|---|
| License, Python, deps, maturin features | `pyproject.toml:1-10,54-61,112-125` |
| Version mismatch | `Cargo.toml:9`; `README.md:146`; `ROADMAP_HONEST.md`; `rust-toolchain.toml:2` |
| Core API registration | `crates/pyroboframes-py/src/lib.rs:1246-1266` |
| LeRobot layout/index | `dataset.rs`; `episodes.rs:1-240`; `data.rs:1-80` |
| Loader and camera output | `crates/pyroboframes-py/src/lib.rs:294-337` |
| Missing provenance in batch | `crates/pyroboframes-py/src/lib.rs:820-822,866-867`; `loader.rs:18-35` |
| MCAP/ROS 2 conversion | `mcap.rs:5-102,284-291`; `rosbag.rs:1-90` |
| DataFrame API | `dataframe.py:147-345` |
| MCP dead/stale | `pyroboframes.toml:1-25`; `mcp.rs`; `TECHNICAL_DEBT.md` TD-0005; `CHANGELOG.md:102-113` |
| LeRobot registry bug | `_format_registry.py`; `lerobot.py` |
| Platform limits | `README.md:116,135-142`; local `otool -L` output |
| No server/CLI/browser | repository search; `streaming.py:1-23`; `pyproject.toml` |

## Unverified / not present

- No execution: no dataset opened, frame decoded, test run, wheel installed, or benchmark performed.
- Not present: HTTP/WebSocket server, browser client, REST/GraphQL API, CLI, thumbnail/streaming pipeline, auth/session model, TF graph, WASM/JS API.
- Not verified: real LeRobot/MCAP/ROS 2 datasets, scrub latency, large multi-camera performance, browser codec compatibility, Linux/Windows behavior, non-numeric/image payload handling, and whether the published wheel matches this revision.
- Optional dependency licenses/SBOM were not audited.
