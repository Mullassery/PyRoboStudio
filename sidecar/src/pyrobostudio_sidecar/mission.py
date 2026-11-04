"""Mission manifest v1 (competitive-analysis Gap 1 MVP).

A versioned mission.json joins PyRobo* artifacts (bags, tracks, world specs,
fleet stores) under one mission/run identity with real sha256 hashes and a
shared time base. Read-only; served from sidecar/fixtures.
"""
import hashlib
import json
from pathlib import Path
from typing import Any

REQUIRED_TOP = {"schema_version", "mission_id", "run_id", "robots", "time_base", "artifacts", "events"}
REQUIRED_ARTIFACT = {"kind", "id", "uri", "sha256", "origin"}
KNOWN_KINDS = {"rosbag", "rosbag_db3", "vision_tracks", "world_spec", "networkintel", "syncfleet", "terrain"}
KNOWN_ORIGINS = {"live", "recorded", "simulated", "derived"}


class MissionError(ValueError):
    pass


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()


def validate_manifest(data: dict[str, Any], base_dir: Path) -> dict[str, Any]:
    missing = REQUIRED_TOP - set(data)
    if missing:
        raise MissionError(f"manifest missing keys {sorted(missing)}")
    if data["schema_version"] != "1":
        raise MissionError(f"unsupported manifest schema_version {data['schema_version']!r}")
    tb = data["time_base"]
    if not isinstance(tb, dict) or not {"domain", "start_ns", "end_ns"} <= set(tb):
        raise MissionError("time_base must have domain/start_ns/end_ns")
    if tb["end_ns"] <= tb["start_ns"]:
        raise MissionError("time_base end_ns must be > start_ns")
    seen: set[str] = set()
    for art in data["artifacts"]:
        miss = REQUIRED_ARTIFACT - set(art)
        if miss:
            raise MissionError(f"artifact missing keys {sorted(miss)}")
        if art["kind"] not in KNOWN_KINDS:
            raise MissionError(f"unknown artifact kind {art['kind']!r}")
        if art["origin"] not in KNOWN_ORIGINS:
            raise MissionError(f"unknown artifact origin {art['origin']!r}")
        if art["id"] in seen:
            raise MissionError(f"duplicate artifact id {art['id']!r}")
        seen.add(art["id"])
        p = base_dir / art["uri"]
        if not p.exists():
            raise MissionError(f"artifact uri not found: {art['uri']}")
        actual = sha256_of(p)
        if actual != art["sha256"]:
            raise MissionError(f"artifact {art['id']}: sha256 mismatch (manifest stale)")
    for ev in data["events"]:
        if not {"id", "timestamp_ns", "kind", "label", "severity"} <= set(ev):
            raise MissionError(f"event missing keys: {ev}")
        if ev["severity"] not in {"info", "warn", "error"}:
            raise MissionError(f"event {ev['id']}: bad severity {ev['severity']!r}")
        if not tb["start_ns"] <= ev["timestamp_ns"] <= tb["end_ns"]:
            raise MissionError(f"event {ev['id']}: timestamp outside mission time base")
    return data


def load_manifest(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text())
    return validate_manifest(data, path.parent)


def mission_summary(data: dict[str, Any]) -> dict[str, Any]:
    return {
        "missionId": data["mission_id"],
        "runId": data["run_id"],
        "robots": data["robots"],
        "artifactCount": len(data["artifacts"]),
        "eventCount": len(data["events"]),
        "timeBase": data["time_base"],
    }


def manifest_out(data: dict[str, Any]) -> dict[str, Any]:
    arts = [{**a, "sha256Short": a["sha256"][:12]} for a in data["artifacts"]]
    return {**data, "artifacts": arts}
