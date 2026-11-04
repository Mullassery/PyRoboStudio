"""Round-trip tests: .db3 written with real CDR payloads decodes to the originals.

Also validates against the real pyroboreplay repo fixture when present.
"""
import sqlite3
from pathlib import Path

import pytest

from pyrobostudio_sidecar.ros2bag import Ros2BagAdapter, write_db3_fixture

FIXTURES = Path(__file__).resolve().parent.parent.parent / "fixtures"
PYROBOREPLAY_BAG = Path("/Users/georgimullassery/Desktop/Projects/pyroboreplay/tests/fixtures/ros2_cdr_fixture.db3")


@pytest.fixture(name="bag_path")
def bag_path_fixture(tmp_path: Path) -> Path:
    path = tmp_path / "sample_session.db3"
    heading = 0.1
    cmd_vel = {
        "linear": {"x": 0.5, "y": 0.0, "z": 0.0},
        "angular": {"x": 0.0, "y": 0.0, "z": heading},
    }
    scan = {
        "header": {"stamp": {"sec": 1, "nanosec": 2}, "frame_id": "laser"},
        "angle_min": 0.0,
        "angle_max": 1.0,
        "angle_increment": 0.01,
        "time_increment": 0.0,
        "scan_time": 0.0,
        "range_min": 0.2,
        "range_max": 10.0,
        "ranges": [0.4, 0.6, 0.8],
        "intensities": [1.0, 1.0, 1.0],
    }
    odom = {
        "header": {"stamp": {"sec": 0, "nanosec": 0}, "frame_id": "odom"},
        "child_frame_id": "base_link",
        "pose": {"pose": {"position": {"x": 1.0, "y": 0.0, "z": 0.0},
                          "orientation": {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0}},
                 "covariance": [0.0] * 36},
        "twist": {"twist": {"linear": {"x": 0.5, "y": 0.0, "z": 0.0},
                            "angular": {"x": 0.0, "y": 0.0, "z": heading}},
                  "covariance": [0.0] * 36},
    }
    write_db3_fixture(
        path,
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
    return path


def test_topics_and_span(bag_path: Path) -> None:
    a = Ros2BagAdapter(bag_path)
    names = [t["name"] for t in a.topics()]
    assert names == ["/robot1/cmd_vel", "/robot1/scan", "/odom"]
    assert a.span() == {"startNs": 0, "endNs": 200_000_000, "clockDomain": "ros_time"}
    assert a.degradation() == []
    assert a.message_counts()["/robot1/cmd_vel"] == 2


def test_cdr_roundtrip(bag_path: Path) -> None:
    a = Ros2BagAdapter(bag_path)
    s = a.samples("/robot1/scan")
    assert len(s) == 1
    payload = s[0]["payload"]
    assert payload["header"]["frame_id"] == "laser"
    assert payload["range_min"] == pytest.approx(0.2, abs=1e-5)
    assert payload["ranges"][:3] == [pytest.approx(0.4, abs=1e-5), pytest.approx(0.6, abs=1e-5), pytest.approx(0.8, abs=1e-5)]

    s_vel = a.samples("/robot1/cmd_vel")
    assert s_vel[0]["payload"]["angular"]["z"] == pytest.approx(0.1, abs=1e-5)

    s_odom = a.samples("/odom")
    assert s_odom[0]["payload"]["child_frame_id"] == "base_link"
    assert s_odom[0]["payload"]["pose"]["pose"]["position"]["x"] == pytest.approx(1.0)


def test_unknown_topic_and_degradation(bag_path: Path) -> None:
    a = Ros2BagAdapter(bag_path)
    with pytest.raises(KeyError):
        a.samples("/nope")


def test_schema_guard(tmp_path: Path) -> None:
    path = tmp_path / "junk.db3"
    con = sqlite3.connect(path)
    con.execute("CREATE TABLE other (a TEXT)")
    con.commit()
    con.close()
    with pytest.raises(ValueError, match="not a ROS 2 bag"):
        Ros2BagAdapter(path)


@pytest.mark.skipif(not PYROBOREPLAY_BAG.exists(), reason="pyroboreplay repo not on disk")
def test_real_pyroboreplay_fixture(op: None = None) -> None:
    a = Ros2BagAdapter(PYROBOREPLAY_BAG)
    topics = {t["name"]: t["msgType"] for t in a.topics()}
    assert topics["/scan"] == "sensor_msgs/msg/LaserScan"
    assert topics["/odom"] == "nav_msgs/msg/Odometry"
    scan = a.samples("/scan")[0]["payload"]
    assert "ranges" in scan
    odom = a.samples("/odom")[0]["payload"]
    assert odom["child_frame_id"] == "base_link_real"
    assert a.span()["clockDomain"] == "ros_time"
