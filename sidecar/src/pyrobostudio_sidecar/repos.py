"""Phase 4 repo adapters: FastAPI router exposing read-only summaries per repo store.

All mounts are fixture-backed (sidecar/fixtures) and read-only. Missing
adapters degrade independently per the master-prompt rule that an optional
integration must not break the core app.

Phase 6 hardening: every request opens a fresh handle via `mount.factory()`.
uvicorn serves sync endpoints from a worker-thread pool, and sharing one
sqlite3 connection across threads corrupts cursor state under concurrency
(found by the Phase 6 benchmark: intermittent 500s at 8-way concurrency).
"""
import sqlite3
from contextlib import closing
from pathlib import Path
from typing import Any, Callable

from fastapi import APIRouter, HTTPException

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

ROOT_FIX = Path(__file__).resolve().parent.parent.parent / "fixtures"

MOUNT_ERRORS = (
    FileNotFoundError,
    ValueError,
    sqlite3.Error,
    DatasetError,
    NetworkIntelError,
    SyncFleetError,
)


class AdapterMount:
    def __init__(self, factory: Callable[[], Any], degraded: list[str]):
        self.factory = factory
        self.degraded = degraded


def mount_from_fixtures() -> dict[str, AdapterMount | None]:
    mounts: dict[str, AdapterMount | None] = {}
    base = ROOT_FIX

    def try_mount(name: str, build) -> None:
        try:
            build()  # validate the fixture exists and parses before mounting
            mounts[name] = AdapterMount(build, [])
        except MOUNT_ERRORS:
            mounts[name] = None

    try_mount("ros2bag", lambda: Ros2BagAdapter(base / "sample_session.db3"))
    try_mount("lerobot", lambda: LeRobotAdapter(base / "warehouse_demo"))
    try_mount("vision-tracks", lambda: load_tracks(base / "sample_tracks.json"))
    try_mount("worldsim", lambda: load_world(base / "warehouse_sim" / "world_spec.json"))
    try_mount("networkintel", lambda: open_ro(base / "pynetworkintel.db"))
    try_mount("syncfleet", lambda: sf_open(base / "syncfleet.db"))
    if mounts["networkintel"]:
        mounts["networkintel"].degraded = ["surfaces latest scan session and devices/findings only"]
    return mounts


def _handle(m: AdapterMount | None, adapter: str) -> Any:
    if m is None:
        raise HTTPException(503, f"{adapter} adapter unavailable")
    try:
        return m.factory()
    except MOUNT_ERRORS as e:
        raise HTTPException(500, f"{adapter} mount failed: {e}")


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
            try:
                if name == "ros2bag":
                    store = m.factory()
                    summary.update(
                        {
                            "topics": [t["name"] for t in store.topics()],
                            "span": store.span(),
                            "degraded": m.degraded + store.degradation(),
                        }
                    )
                elif name == "lerobot":
                    summary["summary"] = m.factory().summary()
                elif name == "vision-tracks":
                    summary["summary"] = tr_summarize(m.factory())
                elif name == "worldsim":
                    store = m.factory()
                    summary["summary"] = {"worldId": store["worldId"], "badge": store["badge"]}
                elif name == "syncfleet":
                    with closing(m.factory()) as con:
                        summary["statusSummary"] = status(con)
            except MOUNT_ERRORS as e:
                summary["loaded"] = False
                summary["degraded"] = [f"mount failed at request time: {e}"]
            out.append(summary)
        return {"adapters": out}

    @router.get("/ros2bag/topics")
    def ros2bag_topics() -> list[dict]:
        return _handle(mounts["ros2bag"], "ros2bag").topics()

    @router.get("/ros2bag/span")
    def ros2bag_span() -> dict:
        store = _handle(mounts["ros2bag"], "ros2bag")
        return {**store.span(), "messageCounts": store.message_counts()}

    @router.get("/ros2bag/topics/{topic:path}/samples")
    def ros2bag_samples(topic: str) -> list[dict]:
        store = _handle(mounts["ros2bag"], "ros2bag")
        try:
            return store.samples("/" + topic.removeprefix("/"), 10)
        except KeyError:
            raise HTTPException(404, f"unknown topic /{topic}")
        except ValueError as e:
            raise HTTPException(422, str(e))

    @router.get("/lerobot/summary")
    def lerobot_summary() -> dict:
        store = _handle(mounts["lerobot"], "lerobot")
        return {**store.summary(), "provenance": store.provenance(), "episodes": store.episodes()}

    @router.get("/lerobot/episodes/{episode_index}/steps")
    def lerobot_steps(episode_index: int) -> list[dict]:
        store = _handle(mounts["lerobot"], "lerobot")
        try:
            return store.steps(episode_index)
        except KeyError:
            raise HTTPException(404, f"unknown episode {episode_index}")
        except DatasetError as e:
            raise HTTPException(422, str(e))

    @router.get("/vision-tracks/summary")
    def vision_summary() -> dict:
        return tr_summarize(_handle(mounts["vision-tracks"], "vision-tracks"))

    @router.get("/vision-tracks/frames")
    def vision_frames() -> list[dict]:
        return _handle(mounts["vision-tracks"], "vision-tracks")["frames"]

    @router.get("/worldsim/summary")
    def world_summary() -> dict:
        return w_summarize(_handle(mounts["worldsim"], "worldsim"))

    @router.get("/worldsim/objects")
    def world_objects() -> list[dict]:
        return _handle(mounts["worldsim"], "worldsim")["objects"]

    @router.get("/networkintel/sessions")
    def ni_sessions() -> list[dict]:
        with closing(_handle(mounts["networkintel"], "networkintel")) as con:
            return sessions(con)

    @router.get("/networkintel/topology")
    def ni_topology() -> dict:
        with closing(_handle(mounts["networkintel"], "networkintel")) as con:
            sess = sessions(con)
            if not sess:
                raise HTTPException(404, "no scan sessions")
            return topology(con, sess[0]["id"])

    @router.get("/networkintel/findings")
    def ni_findings() -> list[dict]:
        with closing(_handle(mounts["networkintel"], "networkintel")) as con:
            sess = sessions(con)
            if not sess:
                raise HTTPException(404, "no scan sessions")
            return findings(con, sess[0]["id"])

    @router.get("/syncfleet/status")
    def sf_status() -> dict:
        with closing(_handle(mounts["syncfleet"], "syncfleet")) as con:
            return status(con)

    return router


def router() -> APIRouter:
    return create_router(mount_from_fixtures())
