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


if __name__ == "__main__":
    make_fixture()
