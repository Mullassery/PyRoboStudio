"""Phase 4 repo adapters: FastAPI router exposing read-only summaries per repo store.

All mounts are fixture-backed (sidecar/fixtures) and read-only. Missing
adapters degrade independently per the master-prompt rule that an optional
integration must not break the core app.
"""
import sqlite3
from typing import Any

from fastapi import APIRouter, HTTPException

from pyrobostudio_sidecar.fixtures_env import make_ni_db, make_sf_db
from pyrobostudio_sidecar.lerobot import DatasetError, LeRobotAdapter
from pyrobostudio_sidecar.networkintel import (
    NetworkIntelError,
    devices,
    findings,
    open_ro,
    sessions,
    topology,
)
from pyrobostudio_sidecar.ros2bag import Ros2BagAdapter
from pyrobostudio_sidecar.syncfleet import SyncFleetError, open_ro as sf_open, status
from pyrobostudio_sidecar.vision_tracks import load_tracks, summarize as tr_summarize
from pyrobostudio_sidecar.worldsim import load_world, summarize as w_summarize


class AdapterMount:
    def __init__(self, store: Any, degraded: list[str]):
        self.store = store
        self.degraded = degraded


ROOT_FIX = __import__("pathlib").Path(__file__).resolve().parent.parent.parent / "fixtures"


def create_router(mounts: dict[str, AdapterMount | None]) -> APIRouter:
    router = APIRouter(prefix="/repos", tags=["repos"])

    @router.get("")
    def overview() -> dict:
        out: list[dict] = []
        for name, m in mounts.items():
            if m is None:
                out.append({"adapter": name, "loaded": False, "degraded": ["fixture missing — run make_fixture"]})
                continue
            summary: dict[str, Any] = {"adapter": name, "loaded": True, "degraded": m.degraded}
            if name == "ros2bag":
                summary.update({"topics": [t["name"] for t in m.store.topics()], "span": m.store.span(), "degraded": m.degraded + m.store.degradation()})
            elif name == "lerobot":
                summary["summary"] = m.store.summary()
            elif name == "vision-tracks":
                summary["summary"] = tr_summarize(m.store)
            elif name == "worldsim":
                summary["summary"] = {"worldId": m.store["worldId"], "badge": m.store["badge"]}
            elif name == "syncfleet":
                summary["statusSummary"] = status(m.store)
            out.append(summary)
        return {"adapters": out}

    @router.get("/ros2bag/topics")
    def ros2bag_topics() -> list[dict]:
        m = mounts["ros2bag"]
        if m is None:
            raise HTTPException(503, "ros2bag adapter unavailable")
        return m.store.topics()

    @router.get("/ros2bag/span")
    def ros2bag_span() -> dict:
        m = mounts["ros2bag"]
        if m is None:
            raise HTTPException(503, "ros2bag adapter unavailable")
        return {**m.store.span(), "messageCounts": m.store.message_counts()}

    @router.get("/ros2bag/topics/{topic:path}/samples")
    def ros2bag_samples(topic: str) -> list[dict]:
        m = mounts["ros2bag"]
        if m is None:
            raise HTTPException(503, "ros2bag adapter unavailable")
        try:
            return m.store.samples("/" + topic.removeprefix("/"), 10)
        except KeyError:
            raise HTTPException(404, f"unknown topic /{topic}")
        except ValueError as e:
            raise HTTPException(422, str(e))

    @router.get("/lerobot/summary")
    def lerobot_summary() -> dict:
        m = mounts["lerobot"]
        if m is None:
            raise HTTPException(503, "lerobot adapter unavailable")
        return {**m.store.summary(), "provenance": m.store.provenance(), "episodes": m.store.episodes()}

    @router.get("/lerobot/episodes/{episode_index}/steps")
    def lerobot_steps(episode_index: int) -> list[dict]:
        m = mounts["lerobot"]
        if m is None:
            raise HTTPException(503, "lerobot adapter unavailable")
        try:
            return m.store.steps(episode_index)
        except KeyError:
            raise HTTPException(404, f"unknown episode {episode_index}")
        except DatasetError as e:
            raise HTTPException(422, str(e))

    @router.get("/vision-tracks/summary")
    def vision_summary() -> dict:
        m = mounts["vision-tracks"]
        if m is None:
            raise HTTPException(503, "vision-tracks adapter unavailable")
        return tr_summarize(m.store)

    @router.get("/vision-tracks/frames")
    def vision_frames() -> list[dict]:
        m = mounts["vision-tracks"]
        if m is None:
            raise HTTPException(503, "vision-tracks adapter unavailable")
        return m.store["frames"]

    @router.get("/worldsim/summary")
    def world_summary() -> dict:
        m = mounts["worldsim"]
        if m is None:
            raise HTTPException(503, "worldsim adapter unavailable")
        return w_summarize(m.store)

    @router.get("/worldsim/objects")
    def world_objects() -> list[dict]:
        m = mounts["worldsim"]
        if m is None:
            raise HTTPException(503, "worldsim adapter unavailable")
        return m.store["objects"]

    @router.get("/networkintel/sessions")
    def ni_sessions() -> list[dict]:
        m = mounts["networkintel"]
        if m is None:
            raise HTTPException(503, "networkintel adapter unavailable")
        return sessions(m.store)

    @router.get("/networkintel/topology")
    def ni_topology() -> dict:
        m = mounts["networkintel"]
        if m is None:
            raise HTTPException(503, "networkintel adapter unavailable")
        sess = sessions(m.store)
        if not sess:
            raise HTTPException(404, "no scan sessions")
        return topology(m.store, sess[0]["id"])

    @router.get("/networkintel/findings")
    def ni_findings() -> list[dict]:
        m = mounts["networkintel"]
        if m is None:
            raise HTTPException(503, "networkintel adapter unavailable")
        sess = sessions(m.store)
        if not sess:
            raise HTTPException(404, "no scan sessions")
        return findings(m.store, sess[0]["id"])

    @router.get("/syncfleet/status")
    def sf_status() -> dict:
        m = mounts["syncfleet"]
        if m is None:
            raise HTTPException(503, "syncfleet adapter unavailable")
        return status(m.store)

    return router


def mount_from_fixtures() -> dict[str, AdapterMount | None]:
    mounts: dict[str, AdapterMount | None] = {}
    base = ROOT_FIX

    def try_mount(name: str, build) -> None:
        try:
            mounts[name] = AdapterMount(build(), [])
        except (
            FileNotFoundError,
            ValueError,
            sqlite3.Error,
            DatasetError,
            NetworkIntelError,
            SyncFleetError,
        ) as e:
            mounts[name] = None
            _ = e

    try_mount("ros2bag", lambda: Ros2BagAdapter(base / "sample_session.db3"))
    try_mount("lerobot", lambda: LeRobotAdapter(base / "warehouse_demo"))
    try_mount("vision-tracks", lambda: load_tracks(base / "sample_tracks.json"))
    try_mount("worldsim", lambda: load_world(base / "warehouse_sim" / "world_spec.json"))
    try_mount("networkintel", lambda: open_ro(base / "pynetworkintel.db"))
    try_mount("syncfleet", lambda: sf_open(base / "syncfleet.db"))
    if mounts["networkintel"]:
        mounts["networkintel"].degraded = ["surfaces latest scan session and devices/findings only"]
    return mounts


def router() -> APIRouter:
    return create_router(mount_from_fixtures())
