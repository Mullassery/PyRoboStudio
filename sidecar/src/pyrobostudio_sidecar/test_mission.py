"""Tests for mission manifest v1: validation, hashes, and HTTP endpoints."""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from pyrobostudio_sidecar.mission import MissionError, load_manifest, mission_summary, sha256_of
from pyrobostudio_sidecar.server import create_app

FIXTURES = Path(__file__).resolve().parent.parent.parent / "fixtures"


def test_manifest_fixture_loads() -> None:
    data = load_manifest(FIXTURES / "mission_warehouse.json")
    assert data["mission_id"] == "mission-warehouse-001"
    assert {a["kind"] for a in data["artifacts"]} >= {"rosbag", "vision_tracks", "world_spec"}
    for a in data["artifacts"]:
        assert a["sha256"] == sha256_of(FIXTURES / a["uri"])


def _copy_artifacts(tmp_path: Path) -> None:
    import shutil

    data = json.loads((FIXTURES / "mission_warehouse.json").read_text())
    for a in data["artifacts"]:
        dst = tmp_path / a["uri"]
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(FIXTURES / a["uri"], dst)


def test_manifest_rejects_stale_hash(tmp_path: Path) -> None:
    _copy_artifacts(tmp_path)
    data = json.loads((FIXTURES / "mission_warehouse.json").read_text())
    data["artifacts"][0]["sha256"] = "0" * 64
    p = tmp_path / "mission.json"
    p.write_text(json.dumps(data))
    with pytest.raises(MissionError, match="sha256 mismatch"):
        load_manifest(p)


def test_manifest_rejects_missing_keys(tmp_path: Path) -> None:
    p = tmp_path / "mission.json"
    p.write_text(json.dumps({"schema_version": "1"}))
    with pytest.raises(MissionError, match="missing keys"):
        load_manifest(p)


def test_manifest_rejects_event_outside_time_base(tmp_path: Path) -> None:
    _copy_artifacts(tmp_path)
    data = json.loads((FIXTURES / "mission_warehouse.json").read_text())
    data["events"][0]["timestamp_ns"] = 99_000_000_000_000
    p = tmp_path / "mission.json"
    p.write_text(json.dumps(data))
    with pytest.raises(MissionError, match="outside mission time base"):
        load_manifest(p)


def test_summary_shape() -> None:
    data = load_manifest(FIXTURES / "mission_warehouse.json")
    s = mission_summary(data)
    assert s["artifactCount"] == 6
    assert s["robots"] == ["robot1", "robot2"]


def test_mission_endpoints() -> None:
    client = TestClient(create_app(ws_port=None))
    r = client.get("/missions")
    assert r.status_code == 200
    assert r.json()[0]["missionId"] == "mission-warehouse-001"
    d = client.get("/missions/mission-warehouse-001")
    assert d.status_code == 200
    body = d.json()
    assert all(len(a["sha256Short"]) == 12 for a in body["artifacts"])
    assert client.get("/missions/bogus").status_code == 404
