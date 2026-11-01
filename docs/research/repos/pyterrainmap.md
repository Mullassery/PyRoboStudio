# PyTerrainMap Repository Audit

- **Repository:** `/Users/georgimullassery/Desktop/Projects/PyTerrainMap`
- **Commit reviewed:** `dd585ea` (`2026-10-28`, `build: add simready/usd extras`)
- **Package version:** `1.11.0` (`Cargo.toml:1-7`, `pyproject.toml:5-11`)
- **License:** Apache-2.0
- **Audit type:** static source review only. No build, install, test run, or source-repo modification.
- **Target context:** possible backend/data integration with a browser-based PyRoboStudio.

## Executive Verdict

**Integration fit: conditional.** PyTerrainMap is a real Rust/PyO3 observation store with a small working HTTP/HTTPS server and useful spatial-query foundations. It is **not** a ready-made browser mapping backend.

The strongest reusable pieces are the observation model, H3-backed server query path, local NDJSON storage, grid-map JSON export, and point-cloud/3D Tiles export through `run_op`.

The main integration blockers are:

- No browser-facing UI, WebSocket/SSE, or live-update channel.
- No CORS handling in the real server, despite an unused `ApiConfig.enable_cors` field.
- Read endpoints have no authentication; only observation writes can be token-protected.
- `start_server()` always creates a fresh in-memory store and cannot attach Postgres.
- No HTTP temporal-query route and no HTTP export route.
- Python-level exports are limited to the grid-map helper; GIS exporters are Rust-only and partly unimplemented.
- Several high-level intelligence functions are stubs, and `analyze_terrain()` requires an internet call.
- Documentation and implementation drift: status doc is older, current CI is Ubuntu-only, and known failing tests are acknowledged.

Recommended approach: run PyTerrainMap as a **Python sidecar** behind a PyRoboStudio adapter/gateway, or consume only its file formats. Do not treat it as a browser-native or complete application server.

## What Is Implemented

### 1. Core observation model

`Observation` carries:

- UUID ID, robot ID, microsecond timestamp
- WGS84 latitude/longitude
- optional elevation above sea level
- sensor type and typed sensor value
- confidence
- temporal metadata and string metadata

Evidence: `src/types.rs:296-320`.

The default H3 resolution is 9, approximately a 174 m hexagon, with optional 1 m elevation buckets: `src/spatial/mod.rs:14-15,20-32,48-90`.

Important distinction:

- `ObservationStore` itself is an append-only `Vec<Observation>` (`src/storage/mod.rs:17-45`).
- The HTTP server adds an H3 `SpatialIndex` plus `TemporalIndex` around that store (`src/server.rs:60-75,81-99`).
- The public Python `TerrainMap` is a separate in-memory `Vec<PyObservation>` with a simple lat/lon bounding-box query, not the H3 path (`src/py_api.rs:290-317,425-465`).

There is no normal `clear()`/delete/reset operation; the model is append-only.

### 2. Python surface

The top-level package re-exports the compiled extension and defines friendly aliases:

- `TerrainMap`, `Observation`, `GeoPoint`, `Region`, `QueryResult`
- terrain analysis, risk, mobility, environmental, and explanation classes
- `analyze_terrain`, `assess_mobility`, `detect_changes`, `fuse_observations`, `query_by_sensor`, `explain_field`, `is_accessible`
- `start_server`, `ServerHandle`
- `run_op`, `ops`
- `build_grid_map`, `write_grid_map`

Evidence: `python/pyterrain_map/__init__.py:53-113,117-143`; stubs at `python/pyterrain_map/py.pyi:9-242`.

The compiled module also exposes many `Py`-prefixed Gaussian-splatting, fleet, frontier, and path-cost classes through the wildcard import. Those classes are not all documented in `py.pyi`.

Useful Python construction and query methods:

- `TerrainMap()`, `TerrainMap.with_postgres(...)`, `push_observation`, `push_batch`, `query`, `region_stats`, `observations`
- `start_server(host, port, tls, cert_path, key_path)`
- `PyServerHandle.stop()`, `is_running()`, context-manager support

Evidence: `src/py_api.rs:290-343,358-425,474-531`; `python/pyterrain_map/py.pyi:215-239`.

### 3. HTTP/HTTPS server

Actual routes, not documentation claims, are:

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/health` | status, version, uptime, stored count | none |
| GET | `/version` | package version | none |
| POST | `/observations` | submit one observation | optional write token |
| POST | `/query/spatial` | radius query | none |
| GET | `/stats` | total observations and counts by sensor | none |

Evidence: `src/server.rs:244-278`.

There is no static-file serving, UI route, WebSocket, SSE, or OPTIONS handling.

#### Submit request

```json
{
  "robot_id": "bot-1",
  "timestamp": 1700000000000000,
  "latitude": 40.7128,
  "longitude": -74.0060,
  "elevation": 10.0,
  "sensor_type": "thermal",
  "sensor_value": {"celsius": 22.5},
  "confidence": 0.9,
  "metadata": {}
}
```

The response is `201 Created` with `{ "id": ..., "status": "stored", "timestamp": ... }`.

Evidence: `src/api/mod.rs:60-165`; tested end-to-end in `tests/test_server.py:69-121` and `tests/server_integration.rs:41-124`.

Accepted sensor types in the HTTP path are only `thermal`, `lidar`, `ultrasonic`, `camera`, and `movement` (`src/api/mod.rs:84-92`). Camera detections are currently not parsed and become an empty list (`src/api/mod.rs:112-115`).

#### Spatial query request

```json
{
  "latitude": 40.7128,
  "longitude": -74.0060,
  "radius_m": 1000.0,
  "elevation_min": null,
  "elevation_max": null
}
```

The response is a bare JSON array of observations with ID, robot, timestamp, lat/lon, optional elevation, sensor type, confidence, and decayed confidence.

Critical limitation: `elevation_min`/`elevation_max` are accepted in the struct but the handler calls only `query.radius(...)` and does not apply elevation filtering (`src/server.rs:338-384`). The core has `radius_with_elevation` (`src/query/mod.rs:61-75`), but that is not wired to HTTP.

There is no HTTP temporal query even though `TemporalQueryRequest` and `SpatialTemporalQueryRequest` types exist (`src/api/mod.rs:184-198`; unused route types).

#### Authentication and TLS

- Optional write token from `PYTERRAINMAP_API_TOKEN` (`src/server.rs:51-54,214-239`).
- Token accepted as `x-api-token` or `Authorization: Bearer ...`.
- Token protects only `POST /observations`; queries, stats, and health are unauthenticated.
- TLS is available via `start_server(tls=True)`; without certificate files it generates a self-signed dev certificate (`src/py_server.rs:93-166`; `py.pyi:228-239`).
- Request bodies are capped at 8 MiB (`src/server.rs:47`).

#### Server persistence

`start_server()` always constructs `ServerState::new()` (`src/py_server.rs:130`), which has no persistent backend (`src/server.rs:89-99`). The Rust server supports `ServerState::with_backend(...)` (`src/server.rs:105-115`), but the Python server entry point does not expose it.

Consequently, data submitted through the HTTP server is lost on process restart unless a new integration layer constructs the Rust core directly.

### 4. Storage backends

The local Python storage backend writes append-only NDJSON partitioned as:

```text
~/.pyterrain/observations/YYYY/MM/DD/{robot_id}/grid_{lat}_{lon}.ndjson
```

Evidence: `python/pyterrain_map/storage/local.py:1-27,42-97`.

The record shape is a flat JSON object:

```json
{
  "id": "...",
  "robot_id": "...",
  "timestamp": 1700000000000000,
  "location_lat": 40.7128,
  "location_lon": -74.0060,
  "sensor_type": "lidar",
  "value_json": "{...}",
  "confidence": 0.9
}
```

Timestamp is documented and used as microseconds. Evidence: `python/pyterrain_map/storage/base.py:15-30`.

This local storage backend is not automatically used by `start_server()` or by `TerrainMap()`; it is a separate Python-side facility used by the CLI and ROS bridge.

Postgres persistence exists for `TerrainMap.with_postgres(...)` with `restore_from_backend()` (`src/py_api.rs:318-402`). SQLite, BigQuery, and multi-warehouse support are documented as configuration/schema only or incomplete (`docs/STATUS.md:35-38`).

### 5. Python intelligence helpers

`analyze_terrain()` is not a static demo anymore:

- queries Open-Meteo elevation API at the center and four cardinal points
- computes a measured slope
- returns an error rather than fabricated data if the network call fails
- confidence is fixed at `0.85` after a successful sample

Evidence: `src/py_query_functions.rs:20-108`; `src/elevation/mod.rs:1-12,45-117,126-203`.

Consequences:

- requires outbound internet access to `api.open-meteo.com`
- not suitable for offline/air-gapped deployments without a mirror or replacement provider
- slope is sampled only at four cardinal offsets, not a full DEM surface

`assess_mobility()` scales results by the measured slope and robot type (`src/py_query_functions.rs:115-220`).

However:

- `detect_changes()` returns hardcoded zero-change results (`src/py_query_functions.rs:232-269`).
- `query_by_sensor()` is explicitly a stateless stub returning an empty result (`src/py_query_functions.rs:335-364`).
- `fuse_observations()` computes simple weighted confidence statistics, not general sensor fusion (`src/py_query_functions.rs:273-321`).

Do not advertise these three as functional terrain-analysis features without further implementation.

### 6. Traversability and Gaussian-splatting core

The Rust core contains a spatial knowledge graph with `TerrainCell`, `IndoorRoom`, `Landmark`, `Zone`, and `VerticalTransition` node types (`src/traversability/nodes.rs:10-44`). `TerrainCell` stores surface type, elevation, slope, and roughness.

Python exposes a substantial Gaussian-splatting API: stores, terrain Gaussians, dynamic objects, object observations, change events, path cost, unified path cost, frontiers, frontier scoring, cache management, bot observations, fleet coordination, and status (`src/py_gaussian_splatting.rs:38-1307`). This is broader than the HTTP API exposes.

These are not reachable through the current browser-facing HTTP routes.

### 7. Advanced operation bridge

`run_op(op, payload_json)` is an allowlisted JSON bridge. Exactly four operations are registered (`src/ops.rs:73-79`):

- `photogrammetry.reconstruct`
- `slam.track`
- `cesium.export_tileset`
- `elevation.srtm_lookup`

The Cesium operation writes a real `tileset.json` plus quantized `root.pnts` point-cloud tile (`docs/ADVANCED_OPS.md`; `src/ops.rs:691-765`; tested in `tests/test_advanced_ops.py:139-169`).

Important limits:

- coordinates are local Cartesian meters and are not georeferenced
- no LOD subdivision
- photogrammetry requires caller-supplied keypoints and retains monocular scale ambiguity
- SLAM is keyframe/pose-graph tracking, not a full camera-to-map pipeline
- SRTM lookup reads local `.hgt` tiles only

`run_op` is not exposed by the HTTP server. Exposing it to a browser would require a new, carefully restricted adapter; arbitrary `input_path`/`output_path` values are filesystem capabilities.

### 8. Export formats

Rust enumerates GeoJSON, KML, GeoTIFF, Shapefile, 3D Tiles, OBJ, and WKT (`src/export/mod.rs:12-34`). Actual status:

- GeoJSON: implemented (`src/export/mod.rs:45-140`)
- KML: implemented (`src/export/mod.rs:144-225`)
- WKT: implemented (`src/export/mod.rs:292-310`)
- OBJ: implemented as a point list, but writes latitude/longitude directly as X/Y rather than projected meters (`src/export/mod.rs:271-283`)
- Shapefile: returns an error requiring an external crate (`src/export/mod.rs:229-237`)
- GeoTIFF: returns an error requiring GDAL (`src/export/mod.rs:315-332`)
- 3D Tiles: `src/export/mod.rs` implementation is a skeleton; the real point-cloud tile writer is the separate `run_op` Cesium path (`src/export/mod.rs:240-269`)
- `export_security` exists in Rust with roles/privacy policies, but no Python or HTTP exposure was found

No Python function or HTTP endpoint exposes `SpatialExporter`. `ExportRequest`/`ExportResponse` types exist (`src/api/mod.rs:215-234`) but no route uses them.

### 9. Grid-map JSON interchange

`build_grid_map()` and `write_grid_map()` emit a custom document:

```json
{
  "format": "pyterrainmap-gridmap",
  "version": 1,
  "cell_size_m": 10.0,
  "cells": [
    {
      "x": 40.7,
      "y": -74.0,
      "elevation_m": 10.0,
      "confidence": 0.9,
      "observations": 3
    }
  ]
}
```

`x`/`y` are degrees, not meters. The module explicitly states it is not the ROS `grid_map` format (`python/pyterrain_map/gridmap.py:1-8,26-85`).

This is the most browser-friendly built-in artifact for a 2D map layer, but a frontend must treat it as a custom overlay and handle the degree-based coordinates.

### 10. ROS bridge

The bridge is duck-typed and deliberately does not import `rclpy` or `rospy` (`python/pyterrain_map/ros/bridge.py:7-21`). A ROS node must supply subscription callbacks through `attach_to_node(...)`.

This means integration with a ROS runtime must live in the Python sidecar, not in the browser and not through an existing standalone ROS executable. There is no `pytm ros-bridge` command in the CLI (`python/pyterrain_map/cli.py:226-321`), despite setup-wizard text suggesting one (`python/pyterrain_map/setup_wizard.py:109-111`).

### 11. CLI and setup

Actual `pytm` commands:

- `setup`
- `configure`
- `version`
- `query` (local NDJSON store, optional JSON output)

Evidence: `python/pyterrain_map/cli.py:226-321`.

The setup wizard prints nonexistent next steps:

```text
1. Start the PyTerrainMap server: pytm server
2. Set up ROS bridge: pytm ros-bridge --config config.yaml
3. View dashboard: open http://localhost:8080
```

Those commands/routes are not implemented. Evidence: `python/pyterrain_map/setup_wizard.py:103-111` vs `cli.py:257-320` and `src/server.rs:256-275`.

The setup wizard and `PyTerrainMapSetup` save credentials as plain JSON with mode `0600`, described as "encrypted in production" but not actually encrypted (`python/pyterrain_map/setup_wizard.py:51-61`).

`PyTerrainMapClient` is not a real warehouse client: `connect()` only sets `_connected = True`, observations go into a Python list, and timestamps use `time.time()` seconds (`python/pyterrain_map/api.py:223-315`). It is not exported by `__init__.py` and should not be used as an integration layer.

## Browser Integration Assessment

### Option A: Python sidecar plus PyRoboStudio gateway (recommended)

Run PyTerrainMap in a Python process and put a PyRoboStudio-owned HTTP gateway in front of it. The gateway should:

- terminate browser auth and CORS
- translate browser requests into PyTerrainMap `TerrainMap` or direct Rust-server calls
- expose a stable response schema, not the bare internal array
- add pagination, limits, and temporal filters
- provide WebSocket/SSE or polling
- own persistence and restart behavior

Reason: the browser cannot directly import the native PyO3 extension; no WASM/Pyodide build or JavaScript binding was found. `start_server()` is useful but too narrow for the frontend by itself.

### Option B: consume file artifacts only

- NDJSON observations for batch ingest
- custom grid-map JSON for a 2D overlay
- Cesium `root.pnts`/`tileset.json` for local 3D point clouds
- GeoJSON/KML from Rust only if a Python or service wrapper is added

This avoids exposing the server's missing CORS/auth/live-update behavior.

### Option C: extend the Rust server

Add CORS/preflight handling, read authentication, temporal filtering, export endpoints, a persistent store injection path, and a live channel. This is a real code change, not a configuration toggle. Do not assume `ApiConfig.enable_cors` already does this: the field is defined but not wired into the server (`src/api/mod.rs:266-310`; `src/server.rs:244-278`).

## Risks and Gaps

1. **Browser CORS:** no actual `Access-Control-Allow-Origin`/OPTIONS handling; a separately hosted frontend will fail preflight for JSON POSTs.
2. **No live channel:** no WebSocket/SSE; frontend must poll.
3. **No read auth:** `/query/spatial`, `/stats`, and `/health` are public.
4. **No server persistence:** Python `start_server()` cannot attach a backend; restart loses state.
5. **No HTTP temporal query:** only radius query is routed.
6. **Elevation filters ignored:** accepted in the request but not applied.
7. **No HTTP export:** `ExportRequest` is defined but unused.
8. **Incomplete GIS export:** GeoTIFF and Shapefile are not implemented; 3D Tiles in `export/mod.rs` is a skeleton; OBJ coordinates are not projected meters.
9. **Timestamp bug risk:** `TerrainMap.query()` compares second-based `now` with observation timestamps documented as microseconds (`src/py_api.rs:442-452`; `src/types.rs:304`; `storage/base.py:20`). This likely makes Python temporal filtering wrong.
10. **Stub intelligence:** `detect_changes()` returns zeros; `query_by_sensor()` returns empty; `fuse_observations()` is simple confidence aggregation.
11. **Network dependency:** `analyze_terrain()`/`is_accessible()` call Open-Meteo synchronously and fail offline.
12. **Camera ingestion:** HTTP camera values ignore supplied detections.
13. **Security surface:** `run_op` accepts filesystem paths; do not expose it directly to untrusted clients.
14. **Credential handling:** setup stores credentials unencrypted at rest, despite wording suggesting production encryption.
15. **Documentation drift:** status doc says `1.10.2` and alpha while package says `1.11.0`; current CI builds Linux/Windows wheels, while macOS wheel claims are documentation-only here.
16. **Known failing tests:** repository docs acknowledge multiple Rust test failures; this audit did not run the suite.
17. **Platforms:** current CI test job is Ubuntu-only; no macOS/Windows full-suite coverage in the workflow reviewed.

## Evidence

| Claim | Evidence |
|---|---|
| Package is Rust + PyO3, Apache-2.0, version 1.11.0 | `Cargo.toml:1-7,22`; `pyproject.toml:5-11`; `LICENSE` |
| Actual HTTP routes are health/version/submit/query/stats only | `src/server.rs:244-278` |
| Submit schema and sensor value parsing | `src/api/mod.rs:60-165` |
| Spatial query schema | `src/api/mod.rs:174-212` |
| Spatial query ignores elevation bounds | `src/server.rs:338-384`; `src/query/mod.rs:45-75` |
| Optional write token only | `src/server.rs:51-54,214-239,293` |
| TLS and self-signed dev certificate | `src/py_server.rs:93-166`; `src/server.rs:483-557` |
| Server is in-memory on Python start | `src/py_server.rs:130`; `src/server.rs:89-115` |
| H3 resolution 9 and elevation buckets | `src/spatial/mod.rs:14-15,48-90` |
| Observation data model and microseconds | `src/types.rs:296-320`; `storage/base.py:15-30` |
| Python `TerrainMap` is a simple in-memory Vec/bbox query | `src/py_api.rs:290-317,425-465` |
| Public Python exports | `python/pyterrain_map/__init__.py:53-143`; `py.pyi:9-242` |
| `analyze_terrain()` uses Open-Meteo and errors offline | `src/py_query_functions.rs:20-108`; `src/elevation/mod.rs:45-117` |
| `detect_changes()` is hardcoded zero output | `src/py_query_functions.rs:232-269` |
| `query_by_sensor()` is a stub | `src/py_query_functions.rs:335-364` |
| `fuse_observations()` is simple aggregation | `src/py_query_functions.rs:273-321` |
| Local NDJSON storage layout | `python/pyterrain_map/storage/local.py:1-27,42-97` |
| Custom grid-map format, degrees not meters | `python/pyterrain_map/gridmap.py:1-8,26-85` |
| ROS bridge is duck-typed and has no ROS import | `python/pyterrain_map/ros/bridge.py:7-21` |
| Allowlisted advanced ops | `src/ops.rs:73-79`; `docs/ADVANCED_OPS.md` |
| Cesium tile export is local, non-georeferenced | `docs/ADVANCED_OPS.md`; `src/ops.rs:691-765` |
| GIS export gaps | `src/export/mod.rs:229-269,315-332` |
| Export security exists but is not exposed | `src/export_security/mod.rs:1-240`; no Python/HTTP references found |
| CLI has only setup/configure/version/query | `python/pyterrain_map/cli.py:226-321` |
| Setup wizard prints nonexistent commands | `python/pyterrain_map/setup_wizard.py:103-111` |
| Setup credentials are plain JSON with mode 0600 | `python/pyterrain_map/setup_wizard.py:51-61` |
| Python API client is in-memory, second-based, not real | `python/pyterrain_map/api.py:223-315` |
| CI is Ubuntu-only for tests; Linux/Windows wheel build | `.github/workflows/ci.yml:7-14,118-136` |
| Docs admit known failing tests and partial features | `docs/STATUS.md:23-38`; `docs/KNOWN_ISSUES.md:154-180` |
| Version/status drift | `docs/STATUS.md:3` vs `pyproject.toml:6` |

## Unverified / Not Present

The following were not found in source or could not be verified without building/running:

- Browser UI, dashboard, static assets, or frontend application.
- WebSocket, SSE, long-polling, or any server-push mechanism.
- Implemented CORS headers or OPTIONS preflight handling.
- Read authentication, rate limiting, or query pagination on HTTP routes.
- HTTP temporal query or HTTP spatial-temporal query route.
- HTTP export route despite `ExportRequest`/`ExportResponse` types.
- Python API for GeoJSON/KML/OBJ/WKT/Shapefile/GeoTIFF export.
- Working Shapefile or GeoTIFF export.
- Georeferenced 3D Tiles export; current point-cloud exporter uses local Cartesian coordinates.
- Python exposure of the traversability spatial knowledge graph.
- Python/HTTP exposure of `export_security` policies.
- Real `detect_changes()` or store-backed `query_by_sensor()`.
- Live SQLite, BigQuery, Snowflake, S3/Iceberg, or multi-warehouse connections beyond types/configuration.
- Full camera-to-map SLAM or ML-based object classification.
- ROS 2 runtime dependency, ROS executables, or `pytm server`/`pytm ros-bridge` commands.
- Browser-native/WASM/Pyodide build or JavaScript bindings.
- macOS ARM64 wheel status; current CI does not build macOS wheels.
- Test-suite pass/fail status; no tests were executed during this audit.
- Production-grade credential encryption.

## Recommendation

Use PyTerrainMap as a **domain/data component**, not as the PyRoboStudio browser backend as-is.

For an initial integration:

1. Keep observations and terrain queries server-side.
2. Build a small adapter that owns CORS, auth, pagination, and WebSocket/SSE.
3. Use `TerrainMap.with_postgres(...)` or a PyTerrainMap-owned persistent store for restart safety, not bare `start_server()`.
4. Start with the custom grid-map JSON for 2D visualization and NDJSON for data exchange.
5. Treat terrain intelligence, Gaussian splatting, and 3D reconstruction as optional advanced features requiring separate validation.
6. Add contract tests against the adapter, including offline behavior, timestamp units, token handling, and query limits.

Do not commit to browser integration based on README claims alone; the HTTP surface is materially smaller than the repository's overall Rust/Python surface.
