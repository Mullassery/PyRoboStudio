# PyRoboVision audit for PyRoboStudio

Research-only inspection of `/Users/georgimullassery/Desktop/Projects/PyRoboVision`.
No repository files were modified, built, installed, or committed.

Snapshot: branch `main`, HEAD `7831b10`, clean working tree, latest git tag `v3.3.0`
(`git describe`: `v3.3.0-19-g7831b10`), package version `3.3.1`.

## 1. What it actually does and implementation status

PyRoboVision is a **Python library**, not an application or service. Its real core is:

- CPU multi-object tracking: 4-state Kalman filter (`x, y, vx, vy`) plus IoU/Hungarian association.
- Track lifecycle: tentative/confirmed, missed-frame survival, deletion after `max_age`.
- ByteTrack-style two-pass association using high/low confidence detections.
- Constant-velocity / constant-acceleration trajectory prediction and uncertainty estimates.
- Supporting utilities: monocular depth (real MiDaS optional; heuristic placeholder default),
  3D bounding-box conversion, LiDAR point-cloud processing, 2D occupancy grids, IMU/GPS fusion,
  rule-based behavior/intent classification, minimal imitation-learning/safety helpers.
- Optional adapters: Supervision detections and Alpamayo trajectory outputs (parser only).

Status is **Beta** (`Development Status :: 4 - Beta`). The tracker/predictor core is real and
covered by tests. There is **no bundled detector, no GPU inference pipeline, no ROS integration,
no web server, no CLI, and no persistence format for tracks/detections**. The default depth
backend is an explicitly-labeled Sobel-edge placeholder, not learned depth. Alpamayo model
execution is external; this package only normalizes upstream arrays.

Documentation is inconsistent: README claims 311 passed / 9 skipped, while CLAUDE.md and the
roadmap claim 278 passed / 7 skipped; the roadmap header still says version 3.1.0. Static
inspection finds 322 `def test_` functions across 27 test files. **No tests were executed in
this audit**, so none of these counts are confirmed here.

## 2. Language, stack, version, license, dependencies

| Item | Verified value | Evidence |
|---|---|---|
| Language | Pure Python | `pyproject.toml`; `src/pyrobovision/` |
| Package | `pyrobovision` | `pyproject.toml:6` |
| Version | `3.3.1` | `pyproject.toml:7`, `src/pyrobovision/__init__.py:35` |
| Build backend | setuptools + wheel | `pyproject.toml:1-3` |
| License | Apache-2.0 | `pyproject.toml:10`, `LICENSE:189` (`Copyright 2026 Georgi Mullassery`) |
| Python | `>=3.10`, classifiers 3.10-3.13, no upper bound | `pyproject.toml:34-42` |
| Hard deps | `numpy>=1.24,<3.0`, `scipy>=1.10,<2.0` | `pyproject.toml:45-48` |
| Extras | `supervision`; `depth` (torch/pillow/timm); `onnx`; `dev` | `pyproject.toml:50-79` |
| Rust | None | no `Cargo.toml` / Rust sources |
| ROS 2 | None | no `rclpy`/`rospy` imports |
| OpenCV | Optional, lazy import only in `AdaptiveFrameController.downsample` | `src/pyrobovision/perception/adaptive.py:167-172` |
| PyTorch | Optional, lazy-imported in MiDaS, ONNX optimization, and learned trajectory model | `perception/depth.py:218-232`, `fusion/optimization.py:34,107,156,197`, `prediction/trajectory.py:110-122` |

The stale top-level `pyrobovision/` directory contains only `__pycache__` artifacts, not source.
The actual package is under `src/pyrobovision/` (`pyproject.toml:90-94`).

## 3. Verified public interfaces

### 3.1 Python package imports

Top-level `pyrobovision` re-exports 50 names (`src/pyrobovision/__init__.py:121-180`), including
`MOTTracker`, `ByteTrackTracker`, `Track`, `KalmanFilter`, `ObjectAssociation`,
`TrajectoryPredictor`, `DepthEstimator`, `BBox3D`, `OccupancyGrid`, `SensorFusionEngine`,
`AlpamayoTrajectoryAdapter`, `SupervisionTrackerAdapter`, `SafetyValidator`, etc.

**Important discrepancy:** `Detection` is **not** exported at top level. README line 21 shows
`from pyrobovision import MOTTracker, Detection`, which fails. Verified by import probe:
`hasattr(pyrobovision, "Detection") == False`. Use either:

```python
from pyrobovision.tracking.mot import MOTTracker, Detection, Track
# or
from pyrobovision.tracking import MOTTracker, Detection, Track
```

`Detection` is exported from `pyrobovision.tracking` (`tracking/__init__.py:2,6`) and defined in
`tracking/mot.py:8-13`.

Verified top-level imports / signatures:

| Public API | Signature / notes | Evidence |
|---|---|---|
| `Detection` | `Detection(bbox: np.ndarray, confidence: float, features=None, class_id=0)` | `tracking/mot.py:8-13` |
| `Track` | `track_id, detections, kalman_filter, age, time_since_update, hit_streak, start_frame, is_confirmed, state_history` | `tracking/mot.py:16-26` |
| `Track.get_position()` | Returns Kalman state `[x, y]` | `tracking/mot.py:47-48` |
| `Track.get_velocity()` | Returns Kalman state `[vx, vy]` | `tracking/mot.py:50-51` |
| `Track.get_bbox()` | Last raw detected `xyxy`; 50x50 fallback if no detections | `tracking/mot.py:53-59` |
| `MOTTracker(...)` | `max_age=30, min_hits=3, iou_threshold=0.3`; `min_hits` is stored but not used | `tracking/mot.py:65-72` |
| `MOTTracker.update(detections)` | Predicts all tracks, associates, creates/deletes, returns confirmed tracks | `tracking/mot.py:74-95` |
| `MOTTracker.get_all_tracks()` | All live tracks, including unconfirmed | `tracking/mot.py:113-114` |
| `MOTTracker.get_track_by_id(id)` | Single track or `None` | `tracking/mot.py:121-125` |
| `MOTTracker.get_statistics()` | Dict: totals/confirmed/current frame/next id | `tracking/mot.py:127-133` |
| `ByteTrackTracker(...)` | `high_threshold=0.5, low_threshold=0.1, max_age=30, min_hits=3, iou_threshold=0.3` | `tracking/bytetrack.py:17-27` |
| `KalmanFilter` | 4-state / 2-measurement; `predict(dt=1.0)`, `update(z)`, `initialize(z, vx, vy)`, `mahalanobis_distance(z)` | `tracking/kalman_filter.py:5-54` |
| `ObjectAssociation` | `compute_iou`, `compute_centroid_distance`, `build_cost_matrix`, `associate` | `tracking/association.py:6-69` |
| `TrajectoryPredictor` | `model="cv"`/`"ca"`/`"learned"`, `history_len=10`; `predict_next`, `predict_trajectory`, ADE/FDE helpers | `prediction/trajectory.py:226-262` |
| `ConstantVelocityModel` / `ConstantAccelerationModel` | `predict`, `predict_trajectory` | `prediction/trajectory.py:12-56` |
| `UncertaintyEstimator` | Uncertainty/covariance/confidence-ellipse helpers | `prediction/uncertainty.py:5-78` |
| `DepthEstimator` | `model="heuristic"` or `"midas"`, `min_depth`, `max_depth`, `scale`, `device`; `estimate_depth`, `set_calibration`, `fuse_with_lidar`, `estimate_uncertainty` | `perception/depth.py:166-209` |
| `DepthMap` | `data, scale, shift, min_depth, max_depth`; `get_depth`, `get_depth_batch`, `upsample`, `downsample`, `calibrate_metric_scale`, `to_3d` | `perception/depth.py:30-163` |
| `BBox3D` | `center, dimensions, rotation, confidence, class_id`; `volume`, `to_corners`, `get_projection_2d`, approximate `intersection_over_union` | `perception/bbox_3d.py:6-57` |
| `Box3DConverter` | `from_2d_bbox_and_depth`, `from_point_cloud`, `transform_3d_bbox`, `compute_iou_3d` | `perception/bbox_3d.py:60-166` |
| `OccupancyGrid` | `grid, resolution, origin, height, max_height`; `world_to_grid`, `grid_to_world`, `raycast`, `line_of_sight`, `get_occupied_cells`, `dilate`, `erode` | `perception/occupancy.py:8-191` |
| `OccupancyGridBuilder` | `from_point_cloud`, `from_3d_bboxes`, `from_costmap`, `merge_grids` | `perception/occupancy.py:194-302` |
| `PointCloud` | `points, intensities, reflectance, timestamp`; filtering/voxel/downsample helpers | `perception/lidar.py:6-94` |
| `LiDARProcessor` | `process_raw`, `remove_ground`, `cluster_points`, `compute_normals`, `transform_points` | `perception/lidar.py:97-216` |
| `AdaptiveFrameController` | `observe(latency_ms)`, `should_process()`, `decide()`, `target_size()`, `downsample()` | `perception/adaptive.py:78-198` |
| `BehaviorAnalyzer` | `update(track_id, positions, velocities, accelerations, frame_id)` returns `BehaviorState` | `behavior/analyzer.py:19-116` |
| `IntentPredictor` | `predict_intent`, `predict_multiple_intents`, `predict_collision_intent`, `estimate_evasion_trajectory` | `intent/predictor.py:31-206` |
| `SensorFusionEngine` | `update_imu`, `update_gps`, `get_state_vector`, `get_covariance`, `get_statistics` | `fusion/sensor_fusion.py:34-183` |
| `AlpamayoTrajectoryAdapter` | `parse(pred_xyz, pred_rot=None, extra=None, metadata=None)`, `select_best(output, ground_truth)` | `integrations/alpamayo_adapter.py:234-339` |
| `trajectory_errors(predicted, gt)` | Returns `min_ade`, `min_fde`, `best_sample`, per-sample `ade`/`fde`, per-timestep matrix | `integrations/alpamayo_adapter.py:342-390` |
| `detections_from_supervision(sv_detections)` | Converts `sv.Detections` to `list[Detection]` | `integrations/supervision_adapter.py:47-75` |
| `tracks_to_supervision(tracks)` | Converts tracks to `sv.Detections` with `tracker_id` | `integrations/supervision_adapter.py:78-113` |
| `SupervisionTrackerAdapter` | Combines conversion + `MOTTracker` | `integrations/supervision_adapter.py:116-134` |

### 3.2 CLI, HTTP, WebSocket, gRPC

- **No CLI entry points**: no `[project.scripts]` in `pyproject.toml:1-119`, no `__main__.py`,
  no `cli.py`. The only argparse usage is in `examples/depth_estimation.py:47` (example only).
- **No HTTP/WebSocket/gRPC server**: no FastAPI/Flask/Starlette/uvicorn/aiohttp/server code found.
- No endpoints, topics, message buses, or auth.
- No environment variables are read by library code. The only env var is the optional test
  `ALPAMAYO_ARTIFACT` (`tests/test_alpamayo_live.py:14`), documented in `.env.example`.
- No config files are consumed by the runtime.

### 3.3 File formats and schemas

- **No built-in track/detection serialization format** (no JSON/JSONL/CSV/protobuf/ROS bag I/O).
- Alpamayo test fixtures are JSON with keys `fixture`, `notes`, `model_version`, `model`,
  `clip_id`, `timestamp`, `contract` (`horizon`, `dt`, `coordinate_frame`), `pred_xyz`, `cot`
  (`tests/fixtures/alpamayo/alpamayo_1_5_synthetic.json:1-20`).
- `TrainingConfig` has JSON `save`/`load` (`learning/training.py:26-47`), unrelated to perception.
- Optional ONNX export writes `.onnx` files (`fusion/optimization.py:76-87`).
- Images/frames are accepted as NumPy arrays only; there is no image/video decoder.

## 4. Data model relevant to visualization

### Images and detections

- `Detection.bbox` is an `xyxy` pixel box in the coordinate system supplied by the caller; no
  image size, camera intrinsics, or frame ID is attached (`tracking/mot.py:8-13`).
- `Detection.confidence` is a float. `class_id` defaults to `0`; `features` exists but is not
  used by association (`tracking/association.py:36-48`). Only ByteTrack reads confidence.
- `MOTTracker.update()` consumes a list of detections per call; it does not accept images.

### Tracks and IDs

- IDs are monotonically increasing integers starting at `1`, assigned on track creation
  (`tracking/mot.py:72,97-108`).
- A track is confirmed only after `hit_streak >= 3`; confirmation never resets on missed frames
  (`tracking/mot.py:33-34`; `CLAUDE.md` notes this).
- `min_hits` is accepted but **not used** — confirmation is hardcoded to 3
  (`tracking/mot.py:66-68,33`; example note `examples/real_detector_tracking.py:120-122`).
- A track dies after `time_since_update >= max_age` (`tracking/mot.py:61-62,93`).
- Track confidence and class are not first-class fields; derive them from
  `track.detections[-1][1]` (latest detection).

### Time and clock semantics

- Tracking is **frame-based**, not wall-clock-based. `frame_id` starts at `0` and increments to
  `1` on the first update (`tracking/mot.py:71,74-75`). `Track.start_frame`,
  `time_since_update`, `age`, and `hit_streak` are frame counters.
- `KalmanFilter.predict(dt=1.0)` defaults to one frame; velocity units are input-units per
  frame, not per second (`tracking/kalman_filter.py:17-27`; `Track.predict`,
  `tracking/mot.py:41-45`).
- There is no timestamp on `Detection` or `Track`, no clock synchronization, and no message
  header/topic concept.
- `TrajectoryPredictor` takes an arbitrary `history` array and `dt`; the CV implementation's
  `predict_trajectory` ignores `dt` and multiplies velocity by `(t + 1)`, while CA uses `dt`
  (`prediction/trajectory.py:21-31,44-56`). Treat this as a unit/clock hazard.
- Sensor fusion is the only subsystem with explicit float timestamps: `IMUData.timestamp`,
  `GPSData.timestamp`, and `dt = current - last` (`fusion/sensor_fusion.py:7-23,87-98`).

### Coordinate frames

- Tracker: caller-defined 2D image coordinates; `xyxy`; no camera model.
- `Box3DConverter.from_2d_bbox_and_depth`: pinhole projection using `fx, fy, cx, cy`; outputs
  camera-frame center `[X, Y, Z]` with `Z = depth` (optical frame, z-forward)
  (`perception/bbox_3d.py:64-102`).
- Alpamayo: ego-frame waypoints in metres, default `64` waypoints at `10 Hz`
  (`dt=0.1`), optional `(3,3)` rotations (`integrations/alpamayo_adapter.py:33-34,196-231`).
- Occupancy: 2D BEV world metres; `grid[row=y, col=x]`, `origin` is the world `(x,y)` of cell
  `(0,0)` (`perception/occupancy.py:8-24`; `docs/OCCUPANCY.md`).
- Sensor fusion: local tangent-plane approximation from a configured lat/lon origin; position
  metres, velocity m/s, orientation roll/pitch/yaw radians (`fusion/sensor_fusion.py:26-31,62-72`).
- No TF tree, no ROS frame IDs, no quaternion convention beyond Euler angles in fusion.

### Predictions, uncertainty, annotations

- `TrajectoryPredictor.predict_trajectory(history, horizon, dt)` returns `(horizon, D)` arrays.
  `UncertaintyEstimator` returns per-step scalar uncertainty or covariance; confidence ellipses
  are `(major, minor, angle)` (`prediction/uncertainty.py:33-61`).
- `AlpamayoOutput.trajectories` is a tuple of `AlpamayoTrajectory(xyz, rotation, reasoning,
  sample_index)`; `positions_2d()` drops z; metadata includes `source`, `horizon`, `dt`,
  `num_samples` (`integrations/alpamayo_adapter.py:196-231,313-326`).
- Detection metadata beyond box/confidence/class/features does not exist.
- No annotation/track-history export or schema is provided, although `Track.state_history` and
  `Track.detections` hold in-memory history (`tracking/mot.py:19,26,39,44`).

## 5. How PyRoboStudio could consume it

**Best fit: direct Python library import in a backend service.** PyRoboStudio is browser-based,
so Python/NumPy cannot run in the browser directly. A small Python service (FastAPI/WebSocket,
built by PyRoboStudio, not provided here) would:

1. Receive frames/detections from the browser or an upstream detector.
2. Construct `pyrobovision.tracking.mot.Detection` objects per frame.
3. Call `MOTTracker.update()` (or `ByteTrackTracker.update()`) and serialize confirmed/all tracks.
4. Optionally call `TrajectoryPredictor` and `UncertaintyEstimator` per track.

An adapter layer is required. It does **not** exist in the repo. It would need to:

- Map app timestamps to frame IDs or add an external `frame_id -> timestamp` table.
- Emit a stable JSON shape containing `track_id`, `bbox`, `center`, `velocity`, `is_confirmed`,
  `time_since_update`, `class_id`, and latest `confidence` (confidence/class are not on `Track`).
- Decide whether to render `get_bbox()` (last raw detection; freezes through occlusion) or a
  bbox derived from `get_position()`; the library does not provide a predicted bbox.
- Convert pixel boxes to the app's coordinate system and handle image-origin conventions.
- If showing trajectories, pass real position histories and choose CV vs CA while accounting
  for the CV `dt` behavior.

Other integration paths:

- **CLI:** not available. Would require a new wrapper script; nothing to invoke today.
- **HTTP/WebSocket/gRPC:** not available. PyRoboStudio must build the server and protocol.
- **File artifact:** no supported artifact. The only parseable fixture format is Alpamayo JSON
  (test fixtures), and there is no writer. PyRoboStudio could define its own JSONL replay format
  and feed it into the library, but that adapter is entirely new.
- **Browser/WASM:** not supported; no WASM build or JS bindings.
- **ROS 2 topic replay:** not supported; no ROS dependency or message conversion.

**Does not exist:** detector, video/frame ingestion, image encoding/streaming, track
serialization, session persistence, REST/WS API, authentication, UI components, coordinate-frame
transform service, timestamp synchronization.

## 6. Existing web/UI/server component and dependency posture

- No web/UI/server component.
- `Dockerfile` builds/installs the library and runs `python -c "import pyrobovision"` as a
  health check; it is not a service (`Dockerfile:1-37`).
- No ROS 2.
- NumPy + SciPy are the only hard runtime dependencies.
- OpenCV is optional and lazily imported only for frame downsampling; a NumPy fallback exists
  (`perception/adaptive.py:156-175`).
- PyTorch is optional, needed only for real MiDaS depth, learned trajectory mode, and ONNX
  optimization. MiDaS also downloads weights on first use and requires network access
  (`perception/depth.py:213-232`).
- Supervision is optional (`pyproject.toml:50-51`). Ultralytics is deliberately unsupported
  (AGPL), per README and adapter docstring.

## 7. Tests/examples usable as integration fixtures

Static count: 322 `def test_` functions in 27 test files. No tests were run here.

High-value fixtures/examples:

- `examples/basic_tracking.py` — deterministic 8-frame synthetic scenario with a 3-frame
  occlusion gap and re-association to `track_id == 1`; ideal for a first end-to-end adapter test
  (`examples/basic_tracking.py:20-51`).
- `tests/test_occlusion.py` — synthetic boxes, occlusion survival, predicted motion through gaps,
  reacquisition; no external data (`tests/test_occlusion.py:23-100`).
- `tests/test_mot_tracker.py` — deterministic unit expectations for `Track`/`MOTTracker`
  (`tests/test_mot_tracker.py:1-120`).
- `tests/test_bytetrack.py` — synthetic high/low-confidence cases.
- `tests/fixtures/alpamayo/alpamayo_1_5_synthetic.json` and
  `alpamayo_2_synthetic.json` — 64-waypoint, 10 Hz, two samples, CoC reasoning; explicitly
  synthetic, not real model output (`docs/ALPAMAYO_WORKFLOW.md`; fixture header).
- `tests/test_occupancy_raycast.py::grid_with_wall` — a 100x100 grid with a wall, suitable for
  a BEV panel fixture (`tests/test_occupancy_raycast.py:13-27`).
- `examples/depth_estimation.py` — heuristic depth + 3D box + occupancy, CPU-only.
- `examples/real_detector_tracking.py` — real torchvision Faster R-CNN; requires torch,
  torchvision, network downloads, and is **not** suitable for a hardware-free CI run.

macOS feasibility: the core tracker/predictor/perception/occupancy tests use only NumPy, SciPy,
and pytest, so they are expected to run on macOS without special hardware. Optional tests skip
via `pytest.importorskip`/`skipif` for torch, Supervision, and the live Alpamayo artifact
(`tests/test_depth_estimation.py:148`, `tests/test_trajectory_prediction.py:189,201`,
`tests/test_supervision_adapter.py:68`, `tests/test_alpamayo_live.py:24`). CI runs Ubuntu and
Windows only, not macOS (`.github/workflows/tests.yml:1-30`). This is an inspection-based
expectation, not a verified macOS test result.

## 8. Risks and unknowns

1. **Broken quickstart import:** `from pyrobovision import MOTTracker, Detection` fails because
   `Detection` is not in top-level `__all__`. This will break naive adapter code.
2. **Frame-based time only:** no timestamps on detections/tracks. PyRoboStudio must impose its
   own clock/mapping; sensor fusion uses seconds separately.
3. **No predicted track bbox:** `Track.get_bbox()` returns the last raw detection. During
   occlusion, a bbox-based overlay will freeze even though `get_position()` advances.
4. **`min_hits` is ignored:** confirmation is hardcoded at 3 hits, so tuning `min_hits` will not
   change behavior.
5. **CV trajectory `dt` is ignored:** `ConstantVelocityModel.predict_trajectory` uses
   `velocity * (t + 1)`, unlike the CA model. If PyRoboStudio interprets seconds, predictions
   will be wrong for non-1.0 frame intervals.
6. **Pixel/frame units are implicit:** Kalman tuning (`Q`, `R` identity) and velocity are in
   caller units per frame; no calibration or unit checking exists.
7. **No first-class track confidence/label:** must be derived from the latest detection and will
   be stale through occlusion.
8. **No appearance re-identification:** `features` is unused; association is IoU/centroid only.
9. **3D/depth limitations:** default depth is a Sobel heuristic, not learned depth; MiDaS is
   relative unless calibrated; 3D box depth uses only the center pixel and `length = depth*0.5`;
   3D IoU is an approximation. Do not present these as metric ground truth.
10. **Alpamayo is parse-only:** no model loading/inference, and weights are non-commercial /
    externally licensed. Adapter validates shapes, not semantic correctness.
11. **Docs drift:** version/test counts conflict; `docs/PRODUCTION_READINESS.md` incorrectly
    claims LICENSE, CI, Docker, and manifests are missing. Trust source/pyproject over docs.
12. **Stale top-level package directory:** `pyrobovision/` contains only `.pyc` files and could
    confuse local imports/tools; real source is `src/pyrobovision/`.
13. **No performance data:** `docs/BENCHMARKS.md` explicitly states no benchmark numbers exist.
14. **License:** project is Apache-2.0 (`LICENSE:189`). Optional Supervision is MIT; PyTorch has
    its own license; Alpamayo weights are not bundled. Verify third-party terms before shipping.

## Evidence

- Package/version/license/deps: `pyproject.toml:1-119`; `src/pyrobovision/__init__.py:35`;
  `LICENSE:189`.
- Public exports and missing `Detection`: `src/pyrobovision/__init__.py:113-180`;
  `src/pyrobovision/tracking/__init__.py:2,6`; `src/pyrobovision/tracking/mot.py:8-13`.
  Import probe (read-only): `.venv/bin/python` with `PYTHONPATH=src` printed version `3.3.1`,
  `hasattr(pyrobovision, "Detection") == False`.
- Tracker data model/lifecycle: `src/pyrobovision/tracking/mot.py:8-133`;
  `src/pyrobovision/tracking/kalman_filter.py:5-54`.
- Association: `src/pyrobovision/tracking/association.py:6-69`.
- ByteTrack: `src/pyrobovision/tracking/bytetrack.py:14-63`.
- Prediction/uncertainty: `src/pyrobovision/prediction/trajectory.py:12-262`;
  `src/pyrobovision/prediction/uncertainty.py:5-78`.
- Depth/3D/occupancy/LiDAR: `src/pyrobovision/perception/depth.py:30-412`;
  `src/pyrobovision/perception/bbox_3d.py:6-166`;
  `src/pyrobovision/perception/occupancy.py:8-302`;
  `src/pyrobovision/perception/lidar.py:6-216`;
  `src/pyrobovision/perception/adaptive.py:24-198`.
- Behavior/intent/fusion/safety: `src/pyrobovision/behavior/analyzer.py:19-158`;
  `src/pyrobovision/behavior/patterns.py:1-85`;
  `src/pyrobovision/intent/predictor.py:7-206`;
  `src/pyrobovision/fusion/sensor_fusion.py:7-183`;
  `src/pyrobovision/learning/safety.py:19-140`.
- Alpamayo: `src/pyrobovision/integrations/alpamayo_adapter.py:33-401`;
  `tests/fixtures/alpamayo/alpamayo_1_5_synthetic.json:1-20`;
  `docs/ALPAMAYO_WORKFLOW.md`.
- Supervision: `src/pyrobovision/integrations/supervision_adapter.py:26-142`.
- No CLI/server: `pyproject.toml:1-119` (no `[project.scripts]`); no `__main__.py`;
  `examples/depth_estimation.py:13,47` (example-only argparse); grep found no FastAPI/Flask/
  WebSocket/gRPC/server code.
- Docker: `Dockerfile:1-37`.
- Tests/examples: `examples/basic_tracking.py:20-51`; `tests/test_occlusion.py:23-100`;
  `tests/test_mot_tracker.py:1-120`; `tests/test_occupancy_raycast.py:13-27`;
  `tests/test_alpamayo_live.py:14,24`; `tests/test_supervision_adapter.py:68`;
  `.github/workflows/tests.yml:1-30`.
- Status/docs drift: `README.md:21,227`; `CLAUDE.md:11-12,66`;
  `docs/internal/ROADMAP_HONEST.md:3,17-19`; `docs/PRODUCTION_READINESS.md:1-40`;
  `docs/BENCHMARKS.md:1-20`.
- Git snapshot: `git log` HEAD `7831b10`; `git describe` `v3.3.0-19-g7831b10`;
  `git status --porcelain` empty.

## Unverified / Not present

Not present in source, verified by search/reading:

- CLI commands/flags, `python -m pyrobovision`, or console entry points.
- HTTP, WebSocket, gRPC, MQTT, or ROS topic endpoints.
- Web UI, JavaScript/TypeScript client, WASM build, or browser bindings.
- Detector, image/video decoding, camera capture, or streaming.
- Track/detection serialization (JSON/CSV/JSONL/protobuf/ROS bag) or a stable visualization schema.
- Timestamps on detections/tracks, message headers, topics, TF frames, or clock sync.
- Annotation export, dataset ingestion, or ROS bag/MCAP readers.
- A predicted bounding box for occluded tracks.
- Built-in performance benchmarks or published latency/FPS numbers.
- A formal JSON Schema for the Alpamayo fixture format.
- CI on macOS; no macOS run performed in this audit.
- Actual test pass/skip counts and coverage. Documentation claims 311/9 and 278/7; static
  inspection finds 322 test functions, but the suite was not executed here.
- Real Alpamayo model output, weights, or inference; fixtures are explicitly synthetic.
- Any guarantee that the default depth backend produces metric or learned depth.
