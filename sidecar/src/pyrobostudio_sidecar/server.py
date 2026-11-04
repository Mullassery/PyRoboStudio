"""PyRoboStudio sidecar FastAPI application (offline/recorded mode).

Serves the HTTP control plane (/capabilities, /graph, /topics, /tf,
/sessions, /sessions/{id}/events, /terrain/regions) from an MCAP fixture
plus deterministic metadata. No ROS install required. Live ROS mode
requires a ROS 2 environment (Ubuntu); this build reports that honestly
via /capabilities.adapterStatus instead of pretending.
"""
import json
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException

from pyrobostudio_sidecar.mission import MissionError, load_manifest, manifest_out, mission_summary
from pyrobostudio_sidecar.recorded import degraded_topics, iter_samples, load_session, topic_activity
from pyrobostudio_sidecar.repos import mount_from_fixtures, router as repos_router
from pyrobostudio_sidecar.terrain_fixture import regions_json
from pyrobostudio_sidecar.ws_transport import WsTransport

ROOT = Path(__file__).resolve().parent.parent.parent
FIXTURES = ROOT / "fixtures"
MAX_SAMPLES = 10
WS_PORT = 9887


def _load_json(name: str) -> object:
    return json.loads((FIXTURES / name).read_text())


def create_app(session_id: str = "sample_session", ws_port: int | None = WS_PORT) -> FastAPI:
    ws_transport = WsTransport(port=ws_port) if ws_port else None

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        if ws_transport:
            ws_transport.start()
        yield
        if ws_transport:
            ws_transport.stop()

    app = FastAPI(lifespan=lifespan)
    mounts = mount_from_fixtures()
    app.include_router(repos_router())
    mcap_path = FIXTURES / "sample_session.mcap"
    if not mcap_path.exists():
        raise RuntimeError(
            "fixture missing: run `uv run python -m pyrobostudio_sidecar.make_fixture`"
        )
    fmcap = load_session(mcap_path, session_id)
    degraded = degraded_topics(fmcap) + ["graph metadata from fixture, not DDS discovery"]
    name_to_id = {t["name"]: t["id"] for t in fmcap.topics}

    @app.get("/capabilities")
    def capabilities() -> dict:
        ws_state = bool(ws_transport) and (ws_transport.starting or ws_transport.loaded)
        return {
            "schema_version": "1",
            "origin": "recorded",
            "rosConnected": False,
            "rosDistro": None,
            "capabilities": sorted(
                [
                    "session.read",
                    "session.playback_control",
                    "graph.read",
                    "topics.read",
                    "tf.read",
                    "terrain.read",
                ]
            ),
            "adapterStatus": [
                {"name": "recorded", "loaded": True, "degraded": degraded},
                {"name": "foxglove-ws", "loaded": ws_state, "errors": [] if ws_state else ["websocket transport not started"]},
                {
                    "name": "ros-live",
                    "loaded": False,
                    "errors": ["no ROS 2 environment on this host"],
                },
                *[
                    {
                        "name": f"repos/{name}",
                        "loaded": m is not None,
                        "degraded": [] if m is None else m.degraded,
                        "errors": [] if m is not None else ["fixture missing — run make_fixture"],
                    }
                    for name, m in mounts.items()
                ],
            ],
            "limits": {"maxSubscriptions": 8, "maxBufferedMessages": 200},
        }

    @app.get("/graph")
    def graph() -> dict:
        base = _load_json("sample_graph.json")
        activity = topic_activity(fmcap)
        activity_out = []
        for row in activity:
            tid = row["topicId"]
            name = next(t["name"] for t in fmcap.topics if t["id"] == tid)
            hz = 1_000_000_000 * row["messageCount"] / max(1, fmcap.end_ns - fmcap.start_ns)
            activity_out.append(
                {"topicId": tid, "hz": round(hz, 2), "reliability": "observed"}
            )
        return {**base, "activity": activity_out}

    @app.get("/topics/{topic_id:path}/samples")
    def topic_samples(topic_id: str) -> list[dict]:
        name = next((t["name"] for t in fmcap.topics if t["id"] == topic_id), None)
        if name is None:
            raise HTTPException(404, f"unknown topic {topic_id}")
        samples = iter_samples(fmcap, name, MAX_SAMPLES)
        return [
            {
                "topicId": topic_id,
                "seq": i,
                "timestampNs": s.timestamp_ns,
                "payload": s.payload,
            }
            for i, s in enumerate(samples)
        ]

    @app.get("/tf")
    def tf() -> dict:
        return _load_json("sample_tf.json")

    @app.get("/sessions")
    def sessions() -> list[dict]:
        return [
            {
                "id": fmcap.session_id,
                "format": "mcap",
                "origin": "recorded",
                "span": fmcap.span(),
                "topicCount": len(fmcap.topics),
                "eventCount": len(_load_json("sample_events.json")),
                "degraded": degraded,
            }
        ]

    @app.get("/sessions/{sid}/events")
    def session_events(sid: str) -> list[dict]:
        if sid != fmcap.session_id:
            raise HTTPException(404, f"unknown session {sid}")
        return _load_json("sample_events.json")

    @app.get("/missions")
    def missions() -> list[dict]:
        path = FIXTURES / "mission_warehouse.json"
        if not path.exists():
            return []
        try:
            return [mission_summary(load_manifest(path))]
        except MissionError as e:
            return [{"missionId": None, "error": f"manifest invalid: {e}"}]

    @app.get("/missions/{mid}")
    def mission_detail(mid: str) -> dict:
        path = FIXTURES / "mission_warehouse.json"
        if not path.exists():
            raise HTTPException(404, f"unknown mission {mid}")
        try:
            data = load_manifest(path)
        except MissionError as e:
            raise HTTPException(500, f"manifest invalid: {e}")
        if data["mission_id"] != mid:
            raise HTTPException(404, f"unknown mission {mid}")
        return manifest_out(data)

    @app.get("/terrain/regions")
    def terrain() -> list[dict]:
        return regions_json()

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8787)
