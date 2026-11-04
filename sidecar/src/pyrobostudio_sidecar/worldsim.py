"""pyrobosimulator world_spec.json adapter (SIMULATED provenance).

Reads <dir>/<world_id>/world_spec.json written by the simulator API
(api.py writes model_dump with indent=2). Schema per world_spec_schema.json.
"""
import json
from pathlib import Path


class WorldSpecError(ValueError):
    pass


REQUIRED = ["metadata", "scene_bounds_min", "scene_bounds_max", "lighting", "weather", "time_of_day", "rendering", "sensors"]


def load_world(path: Path) -> dict:
    spec = json.loads(Path(path).read_text())
    missing = [k for k in REQUIRED if k not in spec]
    if missing:
        raise WorldSpecError(f"{path}: missing keys {missing}")
    bounds_min = spec["scene_bounds_min"]
    bounds_max = spec["scene_bounds_max"]
    if len(bounds_min) != 3 or len(bounds_max) != 3:
        raise WorldSpecError(f"{path}: scene bounds must be 3-tuples")
    if not all(bounds_min[i] < bounds_max[i] for i in range(3)):
        raise WorldSpecError(f"{path}: scene_bounds_min must be < max componentwise")
    world_id = Path(path).parent.name
    return {
        "worldId": world_id,
        "origin": "simulated",
        "badge": "SIMULATED — fixture world_spec, not a live simulator",
        "metadata": spec.get("metadata", {}),
        "sceneBoundsMin": bounds_min,
        "sceneBoundsMax": bounds_max,
        "objects": spec.get("objects", []),
        "lighting": spec["lighting"],
        "weather": spec["weather"],
        "timeOfDay": spec["time_of_day"],
        "rendering": spec["rendering"],
        "sensors": spec["sensors"],
        "camera": spec.get("camera"),
    }


def summarize(world: dict) -> dict:
    types: dict[str, int] = {}
    for obj in world["objects"]:
        t = obj.get("type", "generic")
        types[t] = types.get(t, 0) + 1
    physics_on = sum(1 for obj in world["objects"] if obj.get("physics_enabled", True))
    return {
        "worldId": world["worldId"],
        "origin": world["origin"],
        "badge": world["badge"],
        "objectCount": len(world["objects"]),
        "objectTypeHistogram": types,
        "physicsEnabledCount": physics_on,
        "sensors": world["sensors"],
        "renderingProfile": world["rendering"].get("profile") if isinstance(world["rendering"], dict) else None,
    }
