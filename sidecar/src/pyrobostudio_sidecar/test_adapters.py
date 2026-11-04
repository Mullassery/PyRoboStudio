"""Round-trip fixtures + tests for vision tracks, world specs, networkintel and syncfleet adapters."""
import json
from pathlib import Path

import pytest

from pyrobostudio_sidecar.vision_tracks import TracksError, export_tracks, load_tracks, summarize
from pyrobostudio_sidecar.worldsim import load_world, summarize as wsummarize


def test_tracks_roundtrip(tmp_path: Path) -> None:
    data = {
        "schema_version": "1",
        "clip_id": "clip-7",
        "max_age": 3,
        "frames": [
            {"frame": 0, "timestampNs": 0, "tracks": [
                {"track_id": 1, "bbox": [0, 0, 10, 20], "class_id": 0,
                 "confidence": 0.95, "time_since_update": 0, "hit_streak": 2, "is_confirmed": True},
                {"track_id": 2, "bbox": [50, 60, 70, 80], "class_id": 1,
                 "confidence": 0.4, "time_since_update": 1, "hit_streak": 1, "is_confirmed": False},
            ]},
            {"frame": 1, "timestampNs": 100_000_000, "tracks": [
                {"track_id": 1, "bbox": [1, 0, 12, 20], "class_id": 0,
                 "confidence": 0.9, "time_since_update": 0, "hit_streak": 3, "is_confirmed": True},
            ]},
        ],
    }
    path = tmp_path / "tracks.json"
    path.write_text(json.dumps(export_tracks(data)))
    loaded = load_tracks(path)
    assert loaded == data
    s = summarize(loaded)
    assert s["totalTrackInstances"] == 3
    assert s["confirmedTrackInstances"] == 2
    assert s["staleTrackInstances"] == 0
    assert s["frames"] == 2


def test_tracks_validation() -> None:
    with pytest.raises(TracksError, match="missing keys"):
        export_tracks({"schema_version": "1", "clip_id": "x", "max_age": 3})
    with pytest.raises(TracksError, match="schema_version"):
        export_tracks({"schema_version": "2", "clip_id": "x", "frames": [], "max_age": 3})
    bad = {"schema_version": "1", "clip_id": "x", "frames": [
        {"frame": 0, "timestampNs": 0, "tracks": [
            {"track_id": 1, "bbox": [10, 10, 5, 5], "class_id": 0, "confidence": 0.9,
             "time_since_update": 0, "hit_streak": 1, "is_confirmed": True}]}], "max_age": 2}
    with pytest.raises(TracksError, match="invalid bbox"):
        export_tracks(bad)


WORLD = {
    "metadata": {"seed": "42"},
    "scene_bounds_min": [-10.0, -10.0, 0.0],
    "scene_bounds_max": [10.0, 10.0, 10.0],
    "lighting": {"sun_intensity": 1.0, "sun_angle_elevation": 45.0, "sun_angle_azimuth": 120.0,
                 "ambient_intensity": 0.2, "shadow_distance": 500},
    "weather": {"rain_intensity": 0.0, "cloud_coverage": 0.3, "fog_density": 0.0,
                "fog_color_rgb": [0.8, 0.8, 0.9], "fog_distance": 1000, "wind_speed": 1.0,
                "temperature_celsius": 20},
    "time_of_day": {"hour": 9, "minute": 0, "day_of_year": 1, "season": "summer"},
    "rendering": {"profile": "medium", "resolution_width": 1280, "resolution_height": 720, "fps": 30,
                  "ray_tracing": False, "motion_blur": False, "depth_of_field": False},
    "sensors": {"rgb_enabled": True, "depth_enabled": True, "lidar_enabled": True, "thermal_enabled": False,
                "lidar_channels": 16, "lidar_range_max": 100, "save_to_disk": True,
                "output_format_rgb": "png", "output_format_depth": "npy", "output_format_lidar": "pcd"},
    "objects": [
        {"id": "crate_1", "name": "crate", "type": "crate", "position": [0, 0, 0], "rotation": [0, 0, 0],
         "scale": [1, 1, 1], "material": "wood", "physics_enabled": True},
        {"id": "wall_1", "name": "wall", "type": "wall", "position": [5, 0, 0], "rotation": [0, 0, 0],
         "scale": [1, 3, 1], "material": "brick", "physics_enabled": True},
    ],
}


def test_world_spec_roundtrip(tmp_path: Path) -> None:
    world_dir = tmp_path / "warehouse_sim"
    world_dir.mkdir()
    (world_dir / "world_spec.json").write_text(json.dumps(WORLD))
    w = load_world(world_dir / "world_spec.json")
    assert w["worldId"] == "warehouse_sim"
    assert w["origin"] == "simulated"
    s = wsummarize(w)
    assert s["objectCount"] == 2
    assert s["objectTypeHistogram"] == {"crate": 1, "wall": 1}
    assert "SIMULATED" in s["badge"]


def test_world_spec_bounds_guard(tmp_path: Path) -> None:
    bad = dict(WORLD)
    bad["scene_bounds_min"] = [20.0, -10.0, 0.0]
    world_dir = tmp_path / "upside_down"
    world_dir.mkdir()
    (world_dir / "world_spec.json").write_text(json.dumps(bad))
    with pytest.raises(Exception):
        load_world(world_dir / "world_spec.json")
