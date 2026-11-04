"""API tests for the Phase 4 /repos/* router mounted in the FastAPI app."""
import pytest
from fastapi.testclient import TestClient

from pyrobostudio_sidecar.server import create_app


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(create_app(ws_port=None))


def test_repos_overview(client: TestClient) -> None:
    r = client.get("/repos")
    assert r.status_code == 200
    body = r.json()
    names = {a["adapter"] for a in body["adapters"]}
    assert names == {"ros2bag", "lerobot", "vision-tracks", "worldsim", "networkintel", "syncfleet"}
    assert all(a["loaded"] for a in body["adapters"]), body


def test_repos_ros2bag(client: TestClient) -> None:
    topics = client.get("/repos/ros2bag/topics").json()
    assert {t["name"] for t in topics} == {"/robot1/cmd_vel", "/robot1/scan", "/odom"}
    span = client.get("/repos/ros2bag/span").json()
    assert span["messageCounts"]["/robot1/cmd_vel"] == 2
    samples = client.get("/repos/ros2bag/topics/robot1/cmd_vel/samples").json()
    assert len(samples) == 2
    assert samples[0]["payload"]["linear"]["x"] == 0.5
    assert client.get("/repos/ros2bag/topics/bogus/samples").status_code == 404


def test_repos_lerobot(client: TestClient) -> None:
    summary = client.get("/repos/lerobot/summary").json()
    assert summary["robot_type"] == "warehouse_bot"
    assert summary["total_episodes"] == 2
    assert summary["provenance"][".versions.json"]["current"] == "v1"
    steps = client.get("/repos/lerobot/episodes/0/steps").json()
    assert len(steps) == 2
    assert steps[0]["features"]["observation.state"][0] == pytest.approx(0.1)
    assert client.get("/repos/lerobot/episodes/9/steps").status_code == 404


def test_repos_vision_and_world(client: TestClient) -> None:
    tracks = client.get("/repos/vision-tracks/summary").json()
    assert tracks["totalTrackInstances"] == 3
    assert tracks["clipId"] == "clip-warehouse-1"
    world = client.get("/repos/worldsim/summary").json()
    assert world["worldId"] == "warehouse_sim"
    assert "SIMULATED" in world["badge"]
    objects = client.get("/repos/worldsim/objects").json()
    assert {o["type"] for o in objects} == {"crate", "shelf"}


def test_repos_networkintel(client: TestClient) -> None:
    sessions = client.get("/repos/networkintel/sessions").json()
    assert sessions[0]["status"] == "completed"
    topo = client.get("/repos/networkintel/topology").json()
    kinds = {n["kind"] for n in topo["nodes"]}
    assert {"subnet", "device", "service"} <= kinds
    findings = client.get("/repos/networkintel/findings").json()
    assert findings[0]["cveId"] == "CVE-9999-0001"


def test_repos_syncfleet(client: TestClient) -> None:
    status = client.get("/repos/syncfleet/status").json()
    assert status["journal"]["operations"] == 5
    lag = {p["peerId"]: p["lagOps"] for p in status["replicationLag"]}
    assert lag["nodeC"] == 2
    assert len(status["openConflicts"]) == 1


def test_capabilities_reports_repo_adapters(client: TestClient) -> None:
    caps = client.get("/capabilities").json()
    repo_entries = {a["name"]: a for a in caps["adapterStatus"] if a["name"].startswith("repos/")}
    assert set(repo_entries) == {
        "repos/ros2bag", "repos/lerobot", "repos/vision-tracks",
        "repos/worldsim", "repos/networkintel", "repos/syncfleet",
    }
    assert all(e["loaded"] for e in repo_entries.values())
