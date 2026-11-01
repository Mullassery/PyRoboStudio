# PyRoboSimulator — Integration Research

Research date: 2026-10-30
Repo: `/Users/georgimullassery/Desktop/Projects/PyRoboSimulator`
Commit inspected: `a676c27` ("build: bump to 0.12.6"), branch `main`
Mode: static read-only audit. Nothing was built, installed, run, or modified in the source repo.

---

## 1. What it does / implementation status

PyRoboSimulator is an alpha-stage, multi-agent robotics/world simulator split into four pieces:

| Piece | Path | What it actually is |
|---|---|---|
| Rust core | `pyrobosimulator-core/src/`, `Cargo.toml` | Small pip-installable simulation core exposed through PyO3. Real gravity, forward-Euler point/sphere agents, pairwise sphere collisions, RocksDB event log, static SDF export. No joints, meshes, sensors, or robot models. |
| Python package | `python/pyrobosimulator/` | Maturin wheel containing the Rust `_core`, plus a separate Phase-0 FastAPI app, Pydantic "WorldSpec" API, Claude world generator, and optional Gymnasium/PettingZoo adapters. |
| FastAPI backend | `backend/src/` | Larger service: MuJoCo physics backend, synthetic RGB/depth/LiDAR/thermal sensors, scenario generation, narrative converter, REST/SSE/WebSocket scaffolding, auth. **The HTTP layer is largely demo CRUD and is not wired to the simulation engine.** |
| React viewer | `frontend/` | Three.js canvas viewer + control/event/sensor panels speaking MessagePack over the backend WebSocket. Dev-server only; the backend does not serve it. |

The project's own docs are unusually candid: `README.md:137-145` says `SimulationEngine`/`ScenarioBuilder` are not in the pip package, the Rust `NarrativeEngine` is unimplemented, DB/cache are in-memory, the backend suite is not green (~882 pass / 33 fail / 1 error at last run), and the project is Alpha. `docs/internal/ROADMAP_HONEST.md` repeats this honesty pass.

**Bottom line for PyRoboStudio:** the reusable assets are (a) the `WorldFrame` MessagePack schema + TypeScript viewer, (b) the MuJoCo backend and synthetic sensor services, and (c) scenario generation. There is no production-ready "create simulation over REST, receive live frames" path today: the REST simulation router never instantiates `SimulationEngine`, and the WebSocket router has no frame producer.

### Verified status by capability

| Capability | Status | Evidence |
|---|---|---|
| Rust multi-agent state + gravity + integration + collision | Implemented, unit-tested | `pyrobosimulator-core/src/agent.rs:113` (`step`), `world.rs:117` (`step`), `world.rs:134` (`detect_collisions`), 22 `#[test]` in core `src` |
| RocksDB event storage | Implemented | `pyrobosimulator-core/src/storage.rs:30-45` |
| SDF export | Implemented (static XML string) | `pyrobosimulator-core/src/ros2.rs:36` |
| Narratives in Rust | Raises `PyNotImplementedError` | `pyrobosimulator-core/src/narrative.rs:24-31` |
| Claude narrative → scenario | Implemented in backend | `backend/src/narratives/narrative_converter.py:28`, `:47`; `anthropic==0.122.0` at `backend/pyproject.toml:63` |
| MuJoCo real physics | Implemented in source; not executed here | `backend/src/simulators/mujoco_backend.py:103`, `:153`, `:246`, `:333`, `:447`, `:641`, `:684`, `:706`, `:745`, `:786`, `:828` |
| Gazebo | Fail-fast stub, requires ROS 2 | `backend/src/simulators/gazebo_backend.py:64-83` |
| Isaac Sim | Real adapter scaffold, requires Omniverse + NVIDIA GPU | `README.md:65`; `backend/src/simulators/isaac_sim_backend.py` |
| Synthetic sensors | Implemented service | `backend/src/services/sensors.py` (RGB/Depth/Lidar/Thermal/SensorManager) |
| Scenario generation | Implemented service; no HTTP endpoint | `backend/src/services/scenario_generator.py:127` (`ScenarioBuilder`); `scenario_generation.py` |
| Simulation CRUD REST | Implemented but in-memory/demo | `backend/src/routers/simulations.py:19-20` |
| REST → simulation engine | **Not wired** | no import/call of `SimulationEngine` in `backend/src/routers/` |
| Results/agents/summary REST | Demo/empty data | `backend/src/routers/results.py:62-100` |
| Live WebSocket frames | Transport implemented, **no producer wired** | `backend/src/routers/visualization.py:22`, `:157`; `broadcast_frame` has no caller in `backend/src` |
| Sensor data in frames | Disabled | `backend/src/services/visualization_integration.py:106-107` (`if False`) |
| Database-backed users/sims | ORM exists, routers use dicts | `backend/src/db/models.py:12-120`; `routers/simulations.py:19`; `README.md:141` |

---

## 2. Language / stack, version, license, constraints, dependencies

### Versions and license

| Item | Value | Evidence |
|---|---|---|
| Rust core / PyPI package version | **0.12.6** | `Cargo.toml:6`, `pyproject.toml:7` |
| Backend package version | **0.10.0** (same PyPI name, different version) | `backend/pyproject.toml:6-7` |
| Backend OpenAPI version | 0.1.0 | `backend/src/main.py:37` |
| Frontend version | 0.2.0, private | `frontend/package.json:2-4` |
| README stated version | 0.12.5 (stale by one patch) | `README.md:149` |
| Stale built metadata | 0.8.0 | `pyrobosimulator.egg-info/PKG-INFO` |
| License | **Apache-2.0** | `LICENSE:1`, `Cargo.toml:9`, `pyproject.toml:11`, `backend/pyproject.toml:11` |
| Python | `>=3.10` | `pyproject.toml:9`, `backend/pyproject.toml:10` |
| Dev status | Alpha (3) | `pyproject.toml:14`, `README.md:149` |

Version skew is significant: core 0.12.6, backend 0.10.0, OpenAPI 0.1.0, README 0.12.5, egg-info 0.8.0. Do not use one number to describe "the project".

### Stack

- **Rust core:** `pyo3` 0.29 (`abi3-py310`, `extension-module`), `serde`, `serde_json`, `uuid`, `chrono`, `anyhow`, `thiserror`, `rocksdb` 0.22; core crate adds `redis` 0.25, `tokio`, `bevy_ecs` 0.15 (`Cargo.toml:14-31`, `pyrobosimulator-core/Cargo.toml`).
- **Python package build:** maturin; module `pyrobosimulator._core`; source at `python/` (`pyproject.toml:32-42`).
- **Backend:** FastAPI ≥0.115, uvicorn 0.24, Pydantic ≥2.6, pydantic-settings 2.1, SQLAlchemy 2.0.23, asyncpg, Alembic, redis 5.0.1, websockets 12, msgpack, python-jose, passlib/bcrypt, numpy 1.24.3, scipy, pillow, anthropic 0.122 (`backend/pyproject.toml:14-63`).
- **Frontend:** React 18.2, react-dom, three 0.161; Vite 6.4.3, TypeScript 5.3, Vitest 4.1, Testing Library (`frontend/package.json`).

### Dependency / packaging constraints

- Root `pyproject.toml` declares **no base runtime dependencies** at all; only extras `rl` (gymnasium/pettingzoo), `simready`, `usd`, `omniverse` (`pyproject.toml:44-48`).
- `python/pyrobosimulator/__init__.py:10` imports `gym_env`, and `gym_env.py:16` imports `numpy` at module level. `numpy` is not a base dependency. A plain `pip install pyrobosimulator` is therefore likely to fail on `import pyrobosimulator` unless numpy is already present. This is static analysis, not a run result.
- `python/pyrobosimulator/api.py`, `schemas.py`, and `world_gen.py` need FastAPI/Pydantic/Anthropic, which are also not declared in the root wheel. The stale `pyrobosimulator.egg-info/requires.txt` lists them (from an older build), which does not help a current wheel.
- There are **two distributions named `pyrobosimulator`** (root wheel 0.12.6 and backend editable package 0.10.0). They cannot coexist cleanly in one environment.
- Backend README requires PostgreSQL 14+/Redis 6 for the documented setup, even though current routers use in-memory dicts (`backend/README.md:9-11`, `backend/src/routers/simulations.py:19`). `docker-compose.yml` supplies Postgres/Redis.
- Backend imports are path-sensitive: `backend/src/main.py:12-14` uses `from config.settings`, `from routers`, `from services...`. The documented command is `uvicorn src.main:app` from `backend/` (`backend/README.md:40`), but `backend/config/` contains only `.env.example` (no Python package). The README troubleshooting section tells users to add `PYTHONPATH=$(pwd)/src` (`backend/README.md:251`). The Dockerfile copies `config/` to `/app/config` and runs `uvicorn src.main:app` (`backend/Dockerfile:44-57`), so the same ambiguity exists there. Treat the run instruction as unverified/likely broken.
- `backend/src/routers/results.py:10` and `routers/simulations.py:19` hold **separate in-memory stores**; creating a simulation does not create any `events_db` entry, so `/results` returns 404 until a test or external code inserts events.
- Auth state is also in-memory (`backend/src/routers/auth.py`), and tests explicitly document that `routers.auth` vs `src.routers.auth` can be two module objects with two `users_db` dicts (`backend/tests/conftest.py:80-100`). Import-path discipline matters.

---

## 3. Exact verified interfaces

### 3.1 Rust core (Python-visible)

Module: `pyrobosimulator._core` (`pyrobosimulator-core/src/lib.rs:17-28`). Re-exported from `python/pyrobosimulator/__init__.py:12-15`.

| Type | Constructor / methods | Notes |
|---|---|---|
| `World` | `World(name: str)`; `id()`, `name()`, `creation_time()`, `set_fidelity(level)`, `fidelity()`, `add_agent(agent)`, `remove_agent(id) -> bool`, `get_agent(id) -> Agent \| None`, `agents() -> list[Agent]`, `agent_count() -> int`, `gravity() -> [x,y,z]`, `set_gravity(x,y,z)`, `step(dt)`, `detect_collisions() -> list[(id,id)]` | `world.rs:9-140`. Metadata exists but has no Python getter/setter beyond fidelity. |
| `Agent` | `Agent(name: str, agent_type: AgentType)`; `id()`, `name()`, `agent_type()`, `position()`, `set_position(x,y,z)`, `velocity()`, `set_velocity(x,y,z)`, `set_mass(m)`, `set_max_velocity(v)`, `set_collision_radius(r)`, `apply_force(fx,fy,fz)`, `step(dt)`, `distance_to(other)`, `collides_with(other)` | `agent.rs:17-149`. Fields `rotation`, `mass`, `max_velocity`, `collision_radius`, `acceleration` are `pub` in Rust but **have no getters**; Python cannot read rotation/mass/radius. |
| `AgentType` | `Robot`, `Human`, `NPC`, `Organization`, `Animal` | `agent.rs:7-13` |
| `Mission` | `Mission(world_id, name)`; `id()`, `name()`, `add_objective(str)` | `mission.rs:7-34`. No getter for objectives or world_id. |
| `NarrativeEngine` | `generate_from_events(events)` raises `NotImplementedError` | `narrative.rs:24-31` |
| `ROS2Bridge` | `export_world(world) -> str` | Emits SDF 1.9 XML; no ROS runtime, TF, launch files, topics, or Nav2 (`ros2.rs:36-38`). |
| `StorageEngine` | `StorageEngine(db_path)`; `save_event(world_id, event)`, `load_world_history(world_id)` | RocksDB; keys `{world_id}\0{timestamp_nanos:020}\0{uuid}` (`storage.rs:1-6`, `:30-45`). |

Core agent motion is explicit Euler with a speed clamp and zeroed acceleration each step (`agent.rs:118-135`). `World.step(dt)` applies `gravity * mass` to every agent then steps it (`world.rs:117-127`). Collision detection is O(n²) sphere overlap (`world.rs:134-145`), explicitly not intended for the claimed 100K-agent scale without future broad-phase work.

### 3.2 Backend HTTP API

Mounted in `backend/src/main.py:97-101`. All REST routes are under `/api/v1` except the WebSocket.

| Method / path | Behavior | Auth | Evidence |
|---|---|---|---|
| `GET /health` | `{"status":"ok","version":"0.1.0"}` | none | `main.py:53-57` |
| `GET /ready` | Checks DB + cache; 503 if unavailable | none | `main.py:59-78` |
| `GET /metrics` | Prometheus text | none | `main.py:80-84` |
| `POST /api/v1/auth/register` | In-memory user, bcrypt | none | `routers/auth.py:31` |
| `POST /api/v1/auth/login` | JWT HS256 | none | `routers/auth.py:74` |
| `POST /api/v1/auth/logout` | Route exists | none | `routers/auth.py:113` |
| `POST /api/v1/simulations` | Creates dict entry; requires `name`, optional `scenario_id`, `num_agents` 1–1,000,000, `duration` ≤3600 | Bearer | `routers/simulations.py:35-87` |
| `GET /api/v1/simulations` | Paginated user-scoped list | Bearer | `:91` |
| `GET/PUT/DELETE /api/v1/simulations/{id}` | Dict CRUD | Bearer | `:132`, `:152`, `:186` |
| `POST /api/v1/simulations/{id}/start` | Flips status to `running`, hardcodes `started_at`; **does not start physics** | Bearer | `:209-238` |
| `POST /api/v1/simulations/{id}/stop` | Flips to `cancelled` | Bearer | `:240-268` |
| `GET /api/v1/simulations/{id}/status` | Static progress (`0.0` or `0.5`), `events_recorded: 0` | Bearer | `:271-310` |
| `GET /api/v1/simulations/{id}/results` | Paginated events from a separate dict | **none** | `routers/results.py:16-58` |
| `GET /api/v1/simulations/{id}/agents` | Always returns `[]` ("for demo") | **none** | `:62-74` |
| `GET /api/v1/simulations/{id}/summary` | Counts events; `average_agent_velocity=1.5` hardcoded | **none** | `:77-100` |
| `GET /api/v1/simulations/{id}/stream` | SSE replay of stored events | **none** | `:104` |
| `WS /ws/simulations/{id}/stream` | Accepts client, reads JSON control commands, pushes buffered MessagePack frames | **none** | `routers/visualization.py:22-116` |

Two important corrections to the README quickstart:

- `README.md:54-57` posts `{"scenario": "parking_lot", "num_agents": 50, "duration": 30.0}`. `SimulationCreate` requires `name` and has no `scenario` field (`backend/src/models/simulations.py`), so this request returns 422 rather than creating a simulation.
- The README says simulations are driven over REST (`README.md:132`), but `/start` only mutates a dict. To get actual physics/events you must import and run `SimulationEngine` yourself.

### 3.3 WebSocket frame contract

Canonical source: `backend/src/services/frame_streaming.py`.

```text
WorldFrame {
  type: "frame",
  frame_id: int,
  timestamp_ms: float,          # wall-clock ms since streamer start
  agents: [{
    id: int,
    pos: [x,y,z], rot: [rx,ry,rz], vel: [vx,vy,vz],
    state: "idle"|"moving"|"goal_reached"|"collision",
    traj?: [[x,y], ...]
  }],
  events: [{ id, type, agent_id, pos:[x,y,z], timestamp_ms, data? }],
  sensors: { "<agent_id>": { rgb?: base64, depth?: base64, lidar?: [[x,y,z]], thermal?: base64 } },
  obstacles?: [{ id, pos:[x,y,z], size:[w,h,d], type }]
}
```

Serialization is `msgpack.packb(..., use_bin_type=True)` (`frame_streaming.py:154-156`). Control messages are JSON `{type: "play"|"pause"|"resume"|"speed"|"camera"|"filter", payload: {...}}`; speed is clamped to 0.1–4.0 (`visualization.py:119-155`).

`AgentFrame.rotation` is an **Euler-style Vector3**, not a quaternion (`frame_streaming.py:31`, `:45`). The only in-repo producer, `VisualizationStreamer`, always writes `rotation=(0,0,0)` (`visualization_integration.py:81`) and disables sensors (`:106-107`).

**Producer gap:** `broadcast_frame` exists at `visualization.py:157`, but `grep` finds no call site in `backend/src`. `VisualizationStreamer` (`visualization_integration.py:18`) is only imported by tests. Consequently a browser can connect to the WebSocket and receive heartbeats/nothing, but no simulation frames, unless PyRoboStudio supplies its own producer.

### 3.4 Package-level Phase-0 FastAPI app (separate from `backend/`)

`python/pyrobosimulator/api.py:60` defines `create_app()` with:

- `POST /api/v1/generate-world` (`:72`) — Claude/Pydantic world generation.
- `POST /api/v1/load-world` (`:111`).
- `GET /api/v1/sensors/{world_id}/{sensor_type}` (`:141`).
- `GET /api/v1/worlds/{world_id}` (`:218`).
- `GET /api/v1/health` (`:225`), `GET /` (`:230`).

`python -m pyrobosimulator` serves this app with uvicorn on `0.0.0.0:8000` (`python/pyrobosimulator/__main__.py:6-8`). It is **not** the backend service: different world schemas, different routes, in-memory `_loaded_worlds`, no simulation loop, no WebSocket. `WorldSpec` here is PBR/material/object oriented (`python/pyrobosimulator/schemas.py:20-120`), unlike backend `WorldConfig` (bounds/spawn zones/obstacles).

### 3.5 CLI

`pyrobosimulator` → `python/pyrobosimulator/cli.py:main` (`pyproject.toml:23-24`). Only subcommand is `dashboard` with `--static`/`--export` (`cli.py:5-18`).

Risk: interactive mode calls `self.dashboard.run()` (`cli_dashboard.py:83`), but `SimpleDashboard`/`RichDashboard` only define `render()` (`:28-49`). Interactive dashboard therefore raises `AttributeError`. The metrics are explicitly labeled sample data, including "Physics Accuracy 98.4% (sample)" and "UE5 Render FPS 120 fps (sample)" (`cli_dashboard.py:55-73`).

---

## 4. Data model

### 4.1 Worlds

There are **three incompatible world representations**:

1. **Rust core `World`** (`pyrobosimulator-core/src/world.rs:9-18`): `id`, `name`, RFC3339 `creation_time`, `active_agents`, `metadata{description, fidelity_level, simulation_speed, tags}`, gravity. No geometry beyond agent spheres; agents are the only entities.
2. **Backend `WorldConfig`** (`backend/src/services/scenario_generator.py`, `backend/src/models/scenarios.py`): rectangular XY bounds, grid size, spawn zones, obstacles, weather, time-of-day, seed. This is what `ScenarioBuilder` returns.
3. **Python package `WorldSpec`** (`python/pyrobosimulator/schemas.py`): location/time/weather/season, PBR materials, scene objects with `position` and `rotation` tuples, lighting, rendering quality, sensors, narrative. Used by the Phase-0 API and Claude generator.

There is also `world_spec_schema.json` at repo root: title "PyRoboSimulator World Specification", required `[location,time,weather,environment]`, with `terrain`, `scene_scale`, `narrative`, `metadata`. Grep finds **no code reference** to this file; it appears in docs/archive only. It is a fourth, unused schema. Do not build against it.

### 4.2 Agents / robots / poses

| Model | Fields | Evidence |
|---|---|---|
| Core `Agent` | id, name, type (Robot/Human/NPC/Organization/Animal), position `[f64;3]`, velocity `[f64;3]`, quaternion rotation `[f64;4]`, acceleration, mass (default 1), max_velocity (50), collision_radius (0.5) | `agent.rs:17-35` |
| Backend engine `Agent` | id, position/velocity/acceleration `Vector3`, type, max_velocity 10, collision_radius 0.5, goal, trajectory, state | `backend/src/services/simulation_engine.py` (Agent dataclass near `:593`) |
| Backend API `AgentState` | id, position, velocity, rotation? (see `models/agents.py`), status | `backend/src/models/agents.py` |
| MuJoCo `RobotState` | name, pos `(x,y,z)`, rotation quaternion `(x,y,z,w)`, linear/angular velocity, joint positions/velocities/forces, timestamp | `backend/src/simulators/backend_interface.py:145-155` |
| `RobotConfig` | name, robot type, model path (URDF/USD/MJCF), position, rotation quaternion `(x,y,z,w)`, scale, fixed_base | `backend_interface.py:90-105` |

Coordinate/rotation conventions are **not unified**:

- Backend engine and visualization are 2D XY, `z=0`, rotations Euler `(0,0,0)`.
- MuJoCo interface uses `(x,y,z,w)` quaternions and converts internally to MuJoCo's `(w,x,y,z)` (`mujoco_backend.py:55-68`).
- Core stores `(x,y,z,w)` quaternion but exposes no getter.
- No TF tree, no named frames, no global origin convention, no handedness documentation.

### 4.3 Sensors

- Backend synthetic sensors: `RGBSensor`, `DepthSensor`, `LidarSensor`, `ThermalSensor`, `SensorManager` (`backend/src/services/sensors.py`).
- MuJoCo sensors: RGB/depth camera, LiDAR, IMU (`mujoco_backend.py:641-828`).
- Frame wire format: base64 JPEG for RGB, base64 float32 buffers for depth/thermal (512×512 / 256×256 comments), LiDAR as `[[x,y,z], ...]` (`frame_streaming.py:104-118`).
- Sensor configuration types: `CameraConfig` (640×480, 90° FOV), `LidarConfig` (32 beams, 10 Hz, 100 m), `IMUConfig` (`backend_interface.py:112-137`).
- In practice, the only WS producer disables sensor capture (`visualization_integration.py:106-107`), so live sensor frames are currently not emitted.

### 4.4 State, events, timestamps

- Event types: `step_complete`, `collision`, `goal_reached`, `sensor_reading`, `state_change`, `error` (`backend/src/models/events.py`).
- Engine events carry simulation time in seconds; WS `timestamp_ms` is wall-clock since streamer start; `frame_id` is monotonic per streamer.
- Core event log key uses `timestamp_nanos` inside a RocksDB key (`storage.rs`).
- Simulation statuses: `created`, `running`, `completed`, `failed`, `cancelled` (`backend/src/models/simulations.py`).
- Agent states on the wire: `idle`, `moving`, `goal_reached`, `collision` (`frame_streaming.py:33`).

### 4.5 Scenarios

`ScenarioBuilder` (`backend/src/services/scenario_generator.py:127`) provides `parking_lot()`, `warehouse()`, `urban_street()`, and `random_world(...)`, returning `WorldConfig` with spawn zones, obstacles, weather, time-of-day, and seed. `scenario_generation.py` adds `AdvancedScenarioGenerator`, difficulty levels, scenario classes, and curriculum lessons.

No HTTP endpoint exposes scenarios. The SQLAlchemy `Scenario` table exists (`backend/src/db/models.py:40-70`) but no router uses it. There is no committed scenario JSON format, no scenario export CLI, and no artifact interchange consumed by the frontend.

### 4.6 Physics outputs

- Core: positions/velocities after Euler steps and collision pairs. No contacts, forces, joints, or meshes.
- MuJoCo: real body/joint state, contacts with position/normal/distance/force, and sensor data via `SimulationStep` (`backend_interface.py:175-188`, `mujoco_backend.py`). These objects never reach HTTP/WS today.
- Backend engine: simple move-toward-goal forces, collision/goal events, trajectories (`simulation_engine.py:708+`).

---

## 5. How PyRoboStudio could consume it

### Recommended: adapter around the backend services, not the REST API

The shortest credible path is to treat PyRoboSimulator as an **embedded Python simulation service**:

1. Run `MuJoCoBackend` (or `SimulationEngine`) inside a small PyRoboStudio-owned runner.
2. Use `VisualizationStreamer`/`WorldFrame` as the frame schema, or emit the same MessagePack contract directly.
3. Serve frames over a WebSocket that PyRoboStudio controls, or call `broadcast_frame` from a runner that imports `backend/src/routers/visualization.py`.
4. Reuse the existing React `WorldFrame` TypeScript types and panel components if useful.

This requires a fork/patch of the backend or a thin wrapper, because the existing `/start` route does not run the engine and the WS route has no producer. It does **not** require ROS 2 or a GPU. It does require `mujoco` (`pip install mujoco`) and the backend's Python dependencies.

### Viable but more work: consume the REST/WS contract as-is

If PyRoboStudio wants a clean service boundary, define the contract against:

- `POST /api/v1/auth/register` + `/login` to obtain a JWT (in-memory users).
- `POST /api/v1/simulations` with `{"name", "num_agents", "duration"}` (not the README's `scenario` field).
- `GET /api/v1/simulations/{id}/status` for status.
- `GET /api/v1/simulations/{id}/events`… actually `/results` and `/stream` for events.
- `WS /ws/simulations/{id}/stream` for frames.

But today this yields fake progress, empty agents, empty results (until events are inserted), and no frames. PyRoboStudio would have to patch `start_simulation` to instantiate the engine/streamer and populate the stores. Budget for that work; it is not a pure client integration.

### Existing artifacts

- **SDF export** from the Rust core (`ROS2Bridge.export_world`) is the only supported interchange artifact. It contains agents and world metadata, not sensor streams or MuJoCo state.
- **RocksDB event log** is a storage artifact, not a portable scenario/recording format.
- **No glTF/USD/scene export**, no `WorldConfig` JSON schema, no replay file format, and no gRPC anywhere in the repo.

### What does **not** exist

- No live simulation engine behind REST.
- No WebSocket frame producer.
- No scenario API or scenario file format.
- No ROS 2 runtime integration (only SDF string generation; Gazebo requires ROS 2 and fails fast).
- No TF/frame graph, no Nav2 topics, no joint command API over HTTP.
- No authentication on results/WS endpoints.
- No CORS entry for the Vite dev origin `http://localhost:5173`; the Vite proxy avoids CORS in dev, but direct browser calls from 5173 to 8000 would be blocked (`backend/config/.env.example:22`, `frontend/vite.config.ts:8-17`).

---

## 6. Existing frontend reusability / duplication risk

The `frontend/` app is a real React 18 + Three.js viewer, not a mock:

- `App.tsx` (~531 lines) sets up a `THREE.Scene`, perspective/orthographic cameras, renderer, lights, grid, agent meshes, obstacle meshes, trajectory lines, raycasting selection, follow/top-down/free camera modes, layer toggles, and panel layout (`frontend/src/App.tsx:1-531`).
- `hooks/useWebSocket.ts` connects to `${ws|wss}://${host}/ws/simulations/{id}/stream`, sets `binaryType='arraybuffer'`, decodes MessagePack with a **hand-written partial decoder**, and sends JSON control commands (`useWebSocket.ts:15-60`, decoder at `:64+`).
- Components present: `Controls`, `SensorPanel`, `EventLog`, plus `AgentList`, `StatsPanel`, `PresetButtons` in the tree. `App.tsx` only renders `Controls`, `EventLog`, `SensorPanel`; `AgentList`/`StatsPanel` are not imported, so they are unused/duplicated surface area.
- `useViewPresets` persists/export/imports camera presets.
- Tests exist under `components/__tests__`, `hooks/__tests__`, `services/__tests__` (Vitest + Testing Library).
- Vite proxies `/ws` and `/api` to `localhost:8000` only in dev; there is no production build served by the backend, no static mount, and no Dockerfile for the frontend.

**Reuse assessment:** the frame TypeScript interfaces and `useWebSocket` are directly reusable if PyRoboStudio adopts the same MessagePack contract. The Three.js scene and panels are useful references but are monolithic and tightly coupled to the frame shape; copying them wholesale would likely duplicate whatever renderer PyRoboStudio already has. The custom MessagePack decoder is a maintenance risk—prefer a maintained library unless the contract is frozen.

There is also a hidden coupling: the viewer assumes `?id=` and defaults to `1` (`App.tsx:67`), agent IDs are numeric map keys, and sensors are keyed by stringified agent ID. Any producer must match those assumptions exactly.

---

## 7. ROS 2 / hardware requirements and macOS

| Path | Requirement | macOS status |
|---|---|---|
| Rust core (`pip install pyrobosimulator`) | CPU only; PyO3 abi3-py310; RocksDB native build | Expected to work (CPython 3.10+, Rust toolchain for source builds), but **not verified here**. Prebuilt wheels may exist on PyPI for the platform; not checked. |
| Rust `ROS2Bridge.export_world` | **No ROS installation**; pure string generation | Should work anywhere the core imports. |
| MuJoCo backend | `pip install mujoco`; CPU by default; no GPU/ROS | MuJoCo officially supports macOS; not executed here. |
| Backend REST/WS | Python 3.10+, FastAPI, optional Postgres/Redis for documented setup | Runs on macOS, but documented setup assumes Docker for Postgres/Redis. In-memory routers mean those services are not strictly needed for the demo paths. |
| Gazebo backend | ROS 2 + Gazebo + `rclpy`; fails fast otherwise | **Not supported on macOS** in practice (ROS 2 desktop/Gazebo install is Linux-oriented). |
| Isaac Sim | Omniverse + NVIDIA GPU + drivers | Not supported on macOS; README states fail-fast. |
| SANA-WM | Python 3.11+, CUDA 12.8, H100/GB200, weights | Not macOS-compatible. |
| Frontend | Node + browser WebGL | Works on macOS. |

The README's headline claim is accurate: the core, tests, and MuJoCo path are NVIDIA-optional and CPU-first (`README.md:69-71`). ROS 2 is **not** needed to use the core or the exported SDF; it is only needed for the Gazebo backend, which is explicitly a fail-fast stub (`README.md:66`, `gazebo_backend.py:64-83`).

---

## 8. Tests, examples, fixtures, risks / unknowns

### Tests

- `backend/tests/`: ~50 files, including `test_simulation_engine.py`, `test_mujoco_backend.py`, `test_api_integration.py`, `test_simulations.py`, `test_event_streaming.py`, `test_world_streaming.py`, `test_trajectories.py`, `test_obstacles.py`, `test_camera_modes.py`, `test_gazebo_integration.py`, `test_unavailable_backends.py`.
- Fixtures include real assets: `backend/tests/fixtures/mujoco/pendulum.xml`, `simple_arm.urdf`.
- Root `tests/test_gym_env.py` uses fake engines and skips when gymnasium/pettingzoo are absent.
- Rust: 22 `#[test]` functions inside `pyrobosimulator-core/src`.
- README reports ~882 passed / 33 failed / 1 error at last full run (`README.md:145`). This was not re-run here (research-only).
- Backend tests manipulate `sys.path` and deliberately distinguish `routers.*` from `src.routers.*` (`backend/tests/conftest.py:80-100`), confirming the dual-import hazard.

### Examples — do not treat as API truth

- `examples/01_basic_engine.py` imports `Simulator` from `pyrobosimulator`; no such symbol exists.
- `examples/02_sensor_simulation.py` and `03_ai_training.py` also import `Simulator`/`SensorConfig` forms that the current package does not export.
- These examples are stale relative to the Rust core and will fail immediately. The README core snippet (`README.md:29-43`) is the better reference.

### Highest-impact risks

1. **REST is not a simulation facade.** `/start` only changes a dict; no engine, no events, no frames. Any integration assuming the README's "drive simulations over REST" will get a hollow service.
2. **WebSocket has no producer in production code.** `broadcast_frame` is never called outside tests. The viewer will connect but stay empty.
3. **Results/agents/summary are demo stubs.** `agents` always `[]`, summary velocity hardcoded, events store never populated by the simulation router.
4. **Auth is inconsistent.** Simulation CRUD requires JWT; results and WS are unauthenticated. Users/sims are in-memory and reset on restart.
5. **Version/identity confusion.** Two packages named `pyrobosimulator` (0.12.6 core vs 0.10.0 backend), five different version strings, and two different FastAPI apps in one repo.
6. **Packaging is broken for a plain wheel install.** Base deps are empty while `__init__` imports `gym_env` → `numpy`; `_core` import failure is silently swallowed, leaving `World` etc. undefined while still listed in `__all__`.
7. **Four world formats.** Rust `World`, backend `WorldConfig`, Python `WorldSpec`, unused `world_spec_schema.json`. None is a stable interchange contract.
8. **Import-path fragility.** `from config.settings`/`from routers` collide with `backend/config/` and require `PYTHONPATH=src`; the Dockerfile does not obviously set it.
9. **Rotation/frame conventions differ.** Euler-zero in the viewer producer, `(x,y,z,w)` in the MuJoCo interface, `(w,x,y,z)` internally, unexposed quaternion in the core, no TF.
10. **Scale claims are unverified.** O(n²) collisions in both cores; README itself disclaims the 100K-agent benchmark.
11. **CLI dashboard is broken in interactive mode** (`.run()` missing) and prints explicitly fake sample metrics.
12. **No scenario/recording artifact.** Scenario generation exists only as Python objects; replay/storage beyond RocksDB events is absent.

### Unverified / not present

- Not verified by execution: MuJoCo actually stepping, backend tests passing/failing, wheel installation, macOS builds, Docker image building, frontend type-check/tests.
- Not present: gRPC, ROS 2 topics/services/actions, TF, Nav2, USD/glTF export, scenario JSON schema in code, authentication on results/WS, production frontend serving, CORS for `localhost:5173`, spatial indexing, joint-level control over HTTP, non-sphere collision geometry in the core.
- `world_spec_schema.json` is present but unused; do not treat it as an implemented API.

---

## Evidence index

All paths relative to the PyRoboSimulator repo root.

- Versions/license: `Cargo.toml:6,9`; `pyproject.toml:7,9,11,14,23-24,32-48`; `backend/pyproject.toml:6-11`; `frontend/package.json:2-4`; `README.md:149`; `backend/src/main.py:37`; `pyrobosimulator.egg-info/PKG-INFO`.
- Core API: `pyrobosimulator-core/src/lib.rs:17-28`; `world.rs:9-145`; `agent.rs:7-149`; `mission.rs:7-34`; `narrative.rs:24-31`; `ros2.rs:36-38`; `storage.rs:1-45`.
- Package API: `python/pyrobosimulator/__init__.py:10-15`; `__main__.py:6-8`; `cli.py:5-18`; `cli_dashboard.py:28-83`; `api.py:60-230`; `schemas.py`; `world_gen.py:6-54`; `gym_env.py:16-36`.
- Backend app/routes: `backend/src/main.py:12-14,34-101`; `routers/auth.py:31,74,113`; `routers/simulations.py:16-310`; `routers/results.py:10-104`; `routers/visualization.py:22-180`.
- Frame schema/producer: `services/frame_streaming.py:12-180`; `services/visualization_integration.py:18-110`; `services/simulation_engine.py:614-960`.
- MuJoCo/backends: `simulators/mujoco_backend.py:55-180,246-828`; `simulators/backend_interface.py:73-188`; `simulators/gazebo_backend.py:64-83`.
- Data model: `models/simulations.py`, `models/events.py`, `models/agents.py`, `models/scenarios.py`; `db/models.py:12-120`; `services/scenario_generator.py:127-220`; `services/sensors.py`.
- Frontend: `frontend/vite.config.ts:8-27`; `frontend/src/App.tsx:11-67,430-531`; `frontend/src/hooks/useWebSocket.ts:15-64`; `frontend/package.json`.
- Tests/fixtures: `backend/tests/` (50 files), `backend/tests/fixtures/mujoco/pendulum.xml`, `backend/tests/fixtures/mujoco/simple_arm.urdf`, `backend/tests/conftest.py:80-100`, `tests/test_gym_env.py`.
- Docs: `README.md:17-25,54-71,79-96,122-145,151,239-242`; `backend/README.md:7-35,251`; `docs/internal/ROADMAP_HONEST.md`; `VISION.md`.
