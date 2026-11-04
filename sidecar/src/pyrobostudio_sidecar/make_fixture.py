"""Generate a deterministic MCAP fixture plus graph/event metadata for tests.
Run: uv run python -m pyrobostudio_sidecar.make_fixture
Output: sidecar/fixtures/sample_session.mcap, sample_events.json
"""
import json
import math
from pathlib import Path
from mcap.writer import Writer
FIXTURE_DIR = Path(__file__).parent.parent.parent / "fixtures"
SPAN_NS = 10_000_000_000
STEP_NS = 200_000_000
CMDVEL_SCHEMA = "geometry_msgs/msg/Twist"
SCAN_SCHEMA = "sensor_msgs/msg/LaserScan"
def make_fixture() -> None:
    FIXTURE_DIR.mkdir(exist_ok=True)
    path = FIXTURE_DIR / "sample_session.mcap"
    with open(path, "wb") as fp:
        w = Writer(fp)
        w.start(profile="ros2")
        schema_cmdvel = w.register_schema(CMDVEL_SCHEMA, "jsonschema", b"{}")
        schema_scan = w.register_schema(SCAN_SCHEMA, "jsonschema", b"{}")
        ch_vel = w.register_channel("/robot1/cmd_vel", message_encoding="json", schema_id=schema_cmdvel)
        ch_scan = w.register_channel("/robot1/scan", message_encoding="json", schema_id=schema_scan)
        for i in range(SPAN_NS // STEP_NS):
            t = i * STEP_NS
            gap = 3 <= i <= 5
            if not gap:
                x = 1.0 + math.sin(i / 5) * 0.2
                payload = json.dumps(
                    {"linear": {"x": round(x, 3), "y": 0.0, "z": 0.0},
                     "angular": {"x": 0.0, "y": 0.0, "z": round(math.sin(i / 7), 3)}}
                ).encode()
                w.add_message(ch_vel, log_time=t, publish_time=t, data=payload)
            if i % 5 == 0:
                payload = json.dumps(
                    {"capacity": 16, "ranges": [round(0.4 + 0.2 * abs(math.cos(t / 1e9)), 2)] * 10}
                ).encode()
                w.add_message(ch_scan, log_time=t, publish_time=t, data=payload)
        w.finish()
    events = [
        {
            "id": "ev-gap",
            "sessionId": "sample_session",
            "timestampNs": 1_000_000_000,
            "kind": "communication_gap",
            "label": "cmd_vel gap 0.8s (i=3..5)",
            "severity": "warn",
        },
        {
            "id": "ev-scan-anomaly",
            "sessionId": "sample_session",
            "timestampNs": 6_000_000_000,
            "kind": "scan_range_spike",
            "label": "scan ranges spike 2.0x",
            "severity": "error",
        },
        {
            "id": "ev-recovered",
            "sessionId": "sample_session",
            "timestampNs": 9_000_000_000,
            "kind": "recovery",
            "label": "teleop resumed",
            "severity": "info",
        },
    ]
    (FIXTURE_DIR / "sample_events.json").write_text(json.dumps(events, indent=2))
    graph = {
        "nodes": [
            {"id": "n/robot1/teleop", "ns": "/robot1", "name": "teleop", "kind": "node"},
            {"id": "n/robot1/controller", "ns": "/robot1", "name": "controller", "kind": "node"},
            {"id": "n/robot1/lidar", "ns": "/robot1", "name": "lidar", "kind": "node"},
        ],
        "topics": [
            {"id": "t/robot1/cmd_vel", "name": "/robot1/cmd_vel", "msgType": CMDVEL_SCHEMA, "pubCount": 1, "subCount": 1, "qos": {"summary": "best_effort, depth 5 (fixture metadata)"}},
            {"id": "t/robot1/scan", "name": "/robot1/scan", "msgType": SCAN_SCHEMA, "pubCount": 1, "subCount": 1, "qos": {"summary": "best_effort, depth 10 (fixture metadata)"}},
        ],
        "edges": [
            {"id": "e1", "nodeId": "n/robot1/teleop", "topicId": "t/robot1/cmd_vel", "direction": "pub", "qosCompat": "ok"},
            {"id": "e2", "nodeId": "n/robot1/controller", "topicId": "t/robot1/cmd_vel", "direction": "sub", "qosCompat": "ok"},
            {"id": "e3", "nodeId": "n/robot1/lidar", "topicId": "t/robot1/scan", "direction": "pub", "qosCompat": "ok"},
            {"id": "e4", "nodeId": "n/robot1/controller", "topicId": "t/robot1/scan", "direction": "sub", "qosCompat": "ok"},
        ],
        "activity": [],
    }
    (FIXTURE_DIR / "sample_graph.json").write_text(json.dumps(graph, indent=2))
    tf = {
        "frames": [
            {"frameId": "odom", "authority": "sample_session"},
            {"frameId": "base_link", "parentId": "odom", "translation": [1.0, 0.0, 0.0], "rotation": [0, 0, 0, 1]},
            {"frameId": "laser", "parentId": "base_link", "translation": [0.2, 0.0, 0.3], "rotation": [0, 0, 0, 1]},
        ]
    }
    (FIXTURE_DIR / "sample_tf.json").write_text(json.dumps(tf, indent=2))
    print(f"wrote {path}, events, graph, tf")
def make_repo_fixtures() -> None:
    """Phase 4 adapter fixtures: ros2bag .db3, lerobot dataset, tracks JSON, world_spec.json, sqlite stores."""
    from pyrobostudio_sidecar.ros2bag import write_db3_fixture
    from pyrobostudio_sidecar.fixtures_env import make_ni_db, make_sf_db
    import numpy as np
    import pyarrow as pa
    import pyarrow.parquet as pq
    cmd_vel = {"linear": {"x": 0.5, "y": 0.0, "z": 0.0}, "angular": {"x": 0.0, "y": 0.0, "z": 0.1}}
    scan = {
        "header": {"stamp": {"sec": 0, "nanosec": 0}, "frame_id": "laser"},
        "angle_min": 0.0, "angle_max": 1.0, "angle_increment": 0.01,
        "time_increment": 0.0, "scan_time": 0.0, "range_min": 0.2, "range_max": 10.0,
        "ranges": [0.4, 0.6, 0.8], "intensities": [1.0, 1.0, 1.0],
    }
    odom = {
        "header": {"stamp": {"sec": 0, "nanosec": 0}, "frame_id": "odom"},
        "child_frame_id": "base_link",
        "pose": {"pose": {"position": {"x": 1.0, "y": 0.0, "z": 0.0},
                          "orientation": {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0}},
                 "covariance": [0.0] * 36},
        "twist": {"twist": {"linear": {"x": 0.5, "y": 0.0, "z": 0.0},
                            "angular": {"x": 0.0, "y": 0.0, "z": 0.1}},
                  "covariance": [0.0] * 36},
    }
    db3 = FIXTURE_DIR / "sample_session.db3"
    write_db3_fixture(
        db3,
        topics={
            "/robot1/cmd_vel": "geometry_msgs/msg/Twist",
            "/robot1/scan": "sensor_msgs/msg/LaserScan",
            "/odom": "nav_msgs/msg/Odometry",
        },
        timed_messages={
            "/robot1/cmd_vel": [(0, cmd_vel), (200_000_000, cmd_vel)],
            "/robot1/scan": [(100_000_000, scan)],
            "/odom": [(50_000_000, odom)],
        },
    )
    lc = FIXTURE_DIR / "warehouse_demo"
    (lc / "meta" / "episodes" / "chunk-000").mkdir(parents=True, exist_ok=True)
    (lc / "data" / "chunk-000").mkdir(parents=True, exist_ok=True)
    flat = [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6], [0.7, 0.8, 0.9]]
    info = {
        "codebase_version": "v3.0", "robot_type": "warehouse_bot", "fps": 10,
        "total_episodes": 2, "total_frames": 3, "chunks_size": 1000,
        "data_path": "data/chunk-{chunk_index:03d}/file-{file_index:03d}.parquet",
        "video_path": None, "video_codec": None, "video_crf": None,
        "features": {"observation.state": {"dtype": "float32", "shape": [3]},
                     "action": {"dtype": "float32", "shape": [3]}},
    }
    (lc / "meta" / "info.json").write_text(json.dumps(info))
    eps = pa.table({
        "episode_index": pa.array([0, 1], pa.int64()),
        "length": pa.array([2, 1], pa.int64()),
        "dataset_from_index": pa.array([0, 2], pa.int64()),
        "dataset_to_index": pa.array([2, 3], pa.int64()),
        "data/chunk_index": pa.array([0, 0], pa.int64()),
        "data/file_index": pa.array([0, 0], pa.int64()),
    })
    pq.write_table(eps, lc / "meta" / "episodes" / "chunk-000" / "file-000.parquet")
    d = 3
    table = pa.table({
        "observation.state": pa.FixedSizeListArray.from_arrays(np.array(flat, dtype=np.float32).ravel(), d),
        "action": pa.FixedSizeListArray.from_arrays(np.array([[x * 0.5 for x in s] for s in flat], dtype=np.float32).ravel(), d),
    })
    pq.write_table(table, lc / "data" / "chunk-000" / "file-000.parquet")
    (lc / "meta" / "stats.json").write_text(json.dumps({
        "observation.state": {"mean": [0.0] * d, "std": [1.0] * d, "min": [0.0] * d, "max": [1.0] * d},
        "action": {"mean": [0.0] * d, "std": [0.5] * d, "min": [0.0] * d, "max": [0.5] * d},
    }))
    (lc / ".versions.json").write_text(json.dumps({"versions": [{"tag": "v1", "created": "2026-11-01", "episodes": 2}], "current": "v1"}))
    tracks = {
        "schema_version": "1",
        "clip_id": "clip-warehouse-1",
        "max_age": 3,
        "frames": [
            {"frame": 0, "timestampNs": 0, "tracks": [
                {"track_id": 1, "bbox": [10, 10, 60, 120], "class_id": 0, "confidence": 0.93,
                 "time_since_update": 0, "hit_streak": 4, "is_confirmed": True},
                {"track_id": 2, "bbox": [200, 80, 260, 190], "class_id": 1, "confidence": 0.44,
                 "time_since_update": 2, "hit_streak": 1, "is_confirmed": False}]},
            {"frame": 1, "timestampNs": 200_000_000, "tracks": [
                {"track_id": 1, "bbox": [12, 10, 64, 120], "class_id": 0, "confidence": 0.91,
                 "time_since_update": 0, "hit_streak": 5, "is_confirmed": True}]},
        ],
    }
    (FIXTURE_DIR / "sample_tracks.json").write_text(json.dumps(tracks, indent=2))
    world_dir = FIXTURE_DIR / "warehouse_sim"
    world_dir.mkdir(exist_ok=True)
    world_spec = {
        "metadata": {"seed": "66", "name": "warehouse_sim"},
        "scene_bounds_min": [-50.0, -50.0, 0.0],
        "scene_bounds_max": [50.0, 50.0, 40.0],
        "lighting": {"sun_intensity": 1.2, "sun_angle_elevation": 55.0, "sun_angle_azimuth": 200.0,
                     "ambient_intensity": 0.5, "shadow_distance": 300},
        "weather": {"rain_intensity": 0.0, "cloud_coverage": 0.4, "fog_density": 0.05,
                    "fog_color_rgb": [0.8, 0.8, 0.9], "fog_distance": 900, "wind_speed": 0.8,
                    "temperature_celsius": 21},
        "time_of_day": {"hour": 10, "minute": 0, "day_of_year": 1, "season": "summer"},
        "rendering": {"profile": "edge", "resolution_width": 960, "resolution_height": 540, "fps": 30,
                      "ray_tracing": False, "motion_blur": False, "depth_of_field": False},
        "sensors": {"rgb_enabled": True, "depth_enabled": True, "lidar_enabled": True, "thermal_enabled": False,
                    "lidar_channels": 16, "lidar_range_max": 100, "save_to_disk": True,
                    "output_format_rgb": "png", "output_format_depth": "npy", "output_format_lidar": "pcd"},
        "objects": [
            {"id": "crate_a", "name": "crateA", "type": "crate", "position": [2, 1, 0], "rotation": [0, 0, 0],
             "scale": [1, 1, 1], "material": "wood", "physics_enabled": True},
            {"id": "shelf_1", "name": "shelf", "type": "shelf", "position": [-6, 0, 0], "rotation": [0, 0, 90],
             "scale": [2, 1, 3], "material": "metal", "physics_enabled": True},
        ],
    }
    (world_dir / "world_spec.json").write_text(json.dumps(world_spec, indent=2))
    make_ni_db(FIXTURE_DIR / "pynetworkintel.db")
    make_sf_db(FIXTURE_DIR / "syncfleet.db")
    print(f"wrote adapter fixtures in {FIXTURE_DIR}: sample_session.db3, warehouse_demo/, sample_tracks.json, warehouse_sim/, pynetworkintel.db, syncfleet.db")

if __name__ == "__main__":
    make_fixture()
    make_repo_fixtures()
