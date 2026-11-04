# Repository adapter schemas (Phase 4)

**Status:** Evidence-based, extracted from the six repositories on 2026-11-01 (file:line citations are from those repos at HEAD). Every adapter below reads only — no writes back to the PyRobo\* stores.

## 1. pyroboreplay — ROS 2 bag `.db3` (SQLite)

Standard ROS 2 bag schema, verified against `pyroboreplay/tests/fixtures/ros2_cdr_fixture.db3` and its own reader (`src/adapters/ros2.rs:90,111`):

```sql
CREATE TABLE metadata ( key TEXT PRIMARY KEY, value TEXT )
CREATE TABLE topics ( id INTEGER PRIMARY KEY, name TEXT UNIQUE, type TEXT )
CREATE TABLE messages ( timestamp INTEGER, topic_id INTEGER, data BLOB )
```

- Message decode: CDR little-endian (byte `data[0]..data[3]` = encapsulation header; data starts at offset 4). `pyroboreplay` decodes `sensor_msgs/msg/LaserScan`, `sensor_msgs/msg/Image`, `sensor_msgs/msg/Imu`, `nav_msgs/msg/Odometry`, `geometry_msgs/msg/PoseWithCovarianceStamped` with hand-written name-pattern dispatch (`scan|lidar`, `camera|image`, `imu`, `odom|odometry`, `pose`).
- PyRoboStudio uses `rosbags` 0.11.9 instead: LICENSE file shipped in the wheel (`rosbags-0.11.9.dist-info/licenses/LICENSE.txt`) is **Apache-2.0** — resolves the library-evaluation follow-up; no MPL lineage in the artifact we vendor and we do not redistribute rosbags source.
- Confidence fields to surface: fixture `RobotPose.confidence`, `ObstacleDetected.confidence`.

## 2. PyRoboFrames — LeRobotDataset v3.0 Parquet dirs

Layout and field names from `PyRoboFrames/python/pyroboframes/lerobot.py:18-241`:

- `DATA_PATH = "data/chunk-{chunk_index:03d}/file-{file_index:03d}.parquet"`
- `meta/info.json`: `codebase_version: "v3.0"`, `robot_type`, `fps`, `total_episodes`, `total_frames`, `chunks_size: 1000`, `data_path`, `video_path`, `video_codec`, `video_crf`, `features: {name: {dtype, shape}}`
- `meta/episodes/chunk-*/file-*.parquet` columns: `episode_index, length, dataset_from_index, dataset_to_index, data/chunk_index, data/file_index` (int64)
- `data/chunk-*/file-*.parquet`: one column per feature, each a FixedSizeListArray of float32 `[N, D]`
- `meta/stats.json`: `{feature: {mean, std, min, max, count}}`
- Provenance: `.versions.json` (`{versions:[{tag,created,description,episodes}], current, created}`) and `manifest.json` (dataset-level).
- Motion/quality fields: `imu.<stream>.motion_confidence`, `depth.<stream>.motion_confidence` (sensor_fusion.py:301-319).
- A dataset without `meta/info.json` is **not a LeRobotDataset v3.0** and must be reported degraded rather than guessed at (mirror of `crates/pyroboframes-core/src/dataset.rs:29-33`).

## 3. PyRoboVision — tracks/detections (in-memory only)

No track/detection persistence exists upstream (`src/pyrobovision` writes only TensorRT engines). So the adapter contract is an **export JSON** that PyRoboStudio defines and PyRoboVision can trivially produce from its `TrackingResult` dataclasses (`tracking/mot.py:8-26`):

```json
{
  "schema_version": "1",
  "clip_id": "...",
  "frames": [
    { "frame": 0, "timestampNs": 0, "tracks": [
      { "track_id": 1, "bbox": [x1,y1,x2,y2], "class_id": 0,
        "confidence": 0.93, "time_since_update": 0,
        "hit_streak": 3, "is_confirmed": true }
    ]}
  ],
  "max_age": 30
}
```

Staleness/quality surfaced first-class: `confidence`, `time_since_update`, `is_confirmed`, `hit_streak`.

## 4. pyrobosimulator — `world_spec.json` (JSON Schema shipped upstream)

Per upward evidence: worlds persist to `<output_dir>/<world_id>/world_spec.json` (`python/pyrobosimulator/api.py:122-130`); the full Pydantic → JSON-Schema contract is checked in at the repo root (`world_spec_schema.json`). Adapter reads `metadata`, `scene_bounds_{min,max}`, `objects[]` (`id,name,type,position,rotation,scale,material,physics_enabled`), `lighting`, `weather`, `time_of_day`, `rendering`, `sensors`, `camera`. Sensor recordings (`recording_*.{h5,zarr,raw}` per `backend/src/services/sensor_recording.py`) are out of scope for v1 (HDF5/zarr parse adds deps without opening a visualization path yet).

## 5. PyNetworkIntel — SQLAlchemy SQLite (`pynetworkintel.db`)

From `pynetworkintel/db.py` (models at :27,:47,:69,:104,:134,:150,:165):

- `scan_sessions`: `id, scan_time, duration_seconds, target, device_count, finding_count, status(completed|failed|in_progress), error_message`
- `devices`: `id, scan_id, ip, hostname, os, device_type, is_online, last_seen, first_seen`
- `services`: `id, device_id, port, name, version, protocol, state, first_seen, last_seen`
- `findings`: `id, scan_id, device_ip, device_hostname, finding_type(configuration|cve|exposure|performance), severity(critical|high|medium|low|info), title, description, evidence, recommendation, business_impact, cve_id, cvss_score, exploit_available, found_at, resolved_at`
- `device_changes`, `vulnerability_changes`, `alerts` exist but v1 surfaces sessions/devices/findings only.
- Topology: `ScanResult.to_dict()` derives a graph via `TopologyMapper` — PyRoboStudio derives its own graph from `devices`+`services` (distinct data model: `subnet/device/service` nodes) rather than consuming upstream's.

## 6. SyncFleet — sqlx SQLite journal

Data dir `$HOME/.local/share/syncfleet/syncfleet.db`; replicas can be opened read-only (`sqlite3.connect(file:...?mode=ro, uri=True)`); migrations `001_initial.sql` define:

- `datasets`: `dataset_id, schema_version, conflict_policy, table_allowlist, created_at`
- `operation_journal` (append-only): `id, dataset_id, entity_id, origin_node_id, origin_seq, op_type, schema_version, payload, causal_metadata, created_at, checksum`
- `replication_checkpoints`: `peer_id, dataset_id, last_acked_seq, last_applied_seq, updated_at` → replication lag = journal max seq − last_acked_seq
- `conflicts`: `id, operation_id, conflict_type, local_operation_id, remote_operation_id, detected_at, resolved_at, resolution` (`resolved_at IS NULL` ⇒ open conflict)
- `node_local_state`, `node_identity`, `applied_operations`, `peer_authorizations`, `enrollment_tokens`, `peer_certificates` exist; v1 summarizes datasets/journal/checkpoints/conflicts.

## Conformance test matrix (each adapter: round-trip fixture)

| adapter | fixture built by | verified |
|---|---|---|
| ros2bag | `make_fixture.py` writes a real `.db3` (topics/messages/metadata + CDR blobs via rosbags) | decode round-trips to the original dict |
| lerobot | fixture writer emits `meta/info.json` + episodes parquet + data parquet + stats.json | re-read yields identical feature shapes/values |
| vision-tracks | exporter writes the JSON above, reader re-opens | field-for-field equality |
| worlds | reads a checked-in `world_spec.json` fixture | schema keys present, objects listed |
| networkintel | fixture sqlite created with the documented DDL | sessions/devices/findings re-read |
| syncfleet | fixture sqlite with journal/checkpoints/conflicts rows | stats lag/conflicts computed |
