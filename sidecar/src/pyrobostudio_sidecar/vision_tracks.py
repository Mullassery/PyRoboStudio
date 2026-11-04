"""PyRoboVision tracks/detections export adapter.

Upstream persists nothing on disk, so the adapter contract is an export JSON
defined in docs/research/adapter-schemas.md §3. Reader validates and exposes
staleness/quality fields as first-class values.
"""
import json
from pathlib import Path

SCHEMA_VERSION = "1"
REQUIRED = {"schema_version", "clip_id", "frames", "max_age"}


class TracksError(ValueError):
    pass


def export_tracks(data: dict) -> dict:
    """Validate + normalize an in-memory tracking result for export."""
    if data.get("schema_version") != SCHEMA_VERSION:
        raise TracksError(f"schema_version must be {SCHEMA_VERSION!r}")
    missing = REQUIRED - set(data)
    if missing:
        raise TracksError(f"export missing keys {sorted(missing)}")
    for frame in data["frames"]:
        for track in frame["tracks"]:
            bbox = track["bbox"]
            if len(bbox) != 4 or bbox[0] > bbox[2] or bbox[1] > bbox[3]:
                raise TracksError(f"frame {frame['frame']}: invalid bbox {bbox}")
            if not 0.0 <= track["confidence"] <= 1.0:
                raise TracksError(f"frame {frame['frame']}: confidence out of range")
    return data


def load_tracks(path: Path) -> dict:
    data = json.loads(Path(path).read_text())
    return export_tracks(data)


def track_stale(track: dict, max_age: int) -> bool:
    return track["time_since_update"] > max_age


def summarize(data: dict) -> dict:
    frames = data["frames"]
    total_tracks = sum(len(f["tracks"]) for f in frames)
    confirmed = sum(1 for f in frames for t in f["tracks"] if t["is_confirmed"])
    stale = sum(1 for f in frames for t in f["tracks"] if track_stale(t, data["max_age"]))
    classes: dict[int, int] = {}
    for f in frames:
        for t in f["tracks"]:
            classes[t["class_id"]] = classes.get(t["class_id"], 0) + 1
    confidences = [t["confidence"] for f in frames for t in f["tracks"]]
    return {
        "clipId": data["clip_id"],
        "frames": len(frames),
        "totalTrackInstances": total_tracks,
        "confirmedTrackInstances": confirmed,
        "staleTrackInstances": stale,
        "classHistogram": classes,
        "meanConfidence": round(sum(confidences) / len(confidences), 4) if confidences else None,
        "maxAge": data["max_age"],
    }
