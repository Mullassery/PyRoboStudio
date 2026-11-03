"""HTTP conformance tests for the sidecar app (fixtures required)."""
import h3
import pytest
from fastapi.testclient import TestClient

from pyrobostudio_sidecar.server import create_app


@pytest.fixture(name="client")
def client_fixture():
    return TestClient(create_app())


def test_capabilities_lists_read_only(client):
    caps = client.get("/capabilities").json()
    assert caps["origin"] == "recorded"
    assert caps["rosConnected"] is False
    assert caps["capabilities"] == sorted(caps["capabilities"])
    forbidden = {"ros.publish", "clientPublish", "teleop"}
    assert not (set(caps["capabilities"]) & forbidden)
    assert any(a["name"] == "ros-live" and not a["loaded"] for a in caps["adapterStatus"])


def test_graph_topics_match_activity_ids(client):
    g = client.get("/graph").json()
    ids = [t["id"] for t in g["topics"]]
    assert ids
    for act in g["activity"]:
        assert act["topicId"] in ids


def test_samples_bounded_and_typed(client):
    s = client.get("/topics/t/robot1/cmd_vel/samples").json()
    assert 0 < len(s) <= 10
    assert all("timestampNs" in x and "payload" in x for x in s)
    first = s[0]["payload"]
    assert set(first) == {"linear", "angular"}


def test_unknown_topic_404(client):
    assert client.get("/topics/t/bogus/samples").status_code == 404


def test_sessions_and_events(client):
    sessions = client.get("/sessions").json()
    assert len(sessions) == 1
    sid = sessions[0]["id"]
    span = sessions[0]["span"]
    assert span["endNs"] > span["startNs"]
    events = client.get(f"/sessions/{sid}/events").json()
    assert all(e["severity"] in {"info", "warn", "error"} for e in events)
    assert client.get(f"/sessions/{sid}/events").status_code != 500


def test_sessions_honors_unknown_sid(client):
    assert client.get("/sessions/nope/events").status_code == 404


def test_tf_tree_shape(client):
    frames = client.get("/tf").json()["frames"]
    ids = {f["frameId"] for f in frames}
    assert "odom" in ids and "base_link" in ids
    for f in frames:
        if f["frameId"] != "odom":
            assert f["parentId"] in ids


def test_terrain_regions_are_real_h3(client):
    regions = client.get("/terrain/regions").json()
    assert regions
    assert all(h3.is_valid_cell(r["cellId"]) for r in regions)


def test_foxglove_ws_handshake():
    """Conformance: ws transport negotiates foxglove.sdk.v1 and advertises fixture topics."""
    import asyncio
    import json

    import websockets

    from pyrobostudio_sidecar.ws_transport import WsTransport

    t = WsTransport(port=9891)
    t.start()
    try:

        async def grab() -> tuple[dict, list | None]:
            conn = await websockets.connect(
                "ws://127.0.0.1:9891", subprotocols=["foxglove.sdk.v1"], open_timeout=5
            )
            info = None
            adv = None
            for _ in range(20):
                try:
                    msg = await asyncio.wait_for(conn.recv(), timeout=2)
                except TimeoutError:
                    break
                if isinstance(msg, bytes):
                    continue
                text = json.loads(msg)
                if text["op"] == "serverInfo":
                    info = text
                elif text["op"] == "advertise" and text.get("channels"):
                    adv = text["channels"]
                    break
            await conn.close()
            return info, adv

        info, adv = asyncio.run(grab())
        assert info is not None
        assert "time" in info["capabilities"]
        topics = {c["topic"] for c in adv or []}
        assert "/robot1/cmd_vel" in topics
        assert "/robot1/scan" in topics
        assert all(c["encoding"] == "json" for c in adv or [])
    finally:
        t.stop()
