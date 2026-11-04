"""Round-trip: a LeRobot v3 dataset written per PyRoboFrames layout re-opens identically."""
import json
from pathlib import Path

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
import pytest

from pyrobostudio_sidecar.lerobot import DatasetError, LeRobotAdapter


def write_minimal_dataset(root: Path, fps: int, episodes: list[list[list[float]]]) -> None:
    meta = root / "meta"
    data = root / "data" / "chunk-000"
    meta.mkdir(parents=True)
    data.mkdir(parents=True)
    flat = [step for ep in episodes for step in ep]
    n = len(flat)
    d = len(flat[0])
    dims = {"observation.state": [d], "action": [d], "episode_index": [1]}
    all_len = len(episodes)
    info = {
        "codebase_version": "v3.0",
        "robot_type": "warehouse_bot",
        "fps": fps,
        "total_episodes": len(episodes),
        "total_frames": n,
        "chunks_size": 1000,
        "data_path": "data/chunk-{chunk_index:03d}/file-{file_index:03d}.parquet",
        "video_path": None,
        "video_codec": None,
        "video_crf": None,
        "features": {k: {"dtype": "float32", "shape": v} for k, v in dims.items()},
    }
    (meta / "info.json").write_text(json.dumps(info))
    ep_rows = []
    offset = 0
    for i, ep in enumerate(episodes):
        ep_rows.append(
            {
                "episode_index": i,
                "length": len(ep),
                "dataset_from_index": offset,
                "dataset_to_index": offset + len(ep),
                "data/chunk_index": 0,
                "data/file_index": 0,
            }
        )
        offset += len(ep)
    ep_table = pa.table(
        {
            "episode_index": pa.array([r["episode_index"] for r in ep_rows], pa.int64()),
            "length": pa.array([r["length"] for r in ep_rows], pa.int64()),
            "dataset_from_index": pa.array([r["dataset_from_index"] for r in ep_rows], pa.int64()),
            "dataset_to_index": pa.array([r["dataset_to_index"] for r in ep_rows], pa.int64()),
            "data/chunk_index": pa.array([0 for _ in ep_rows], pa.int64()),
            "data/file_index": pa.array([0 for _ in ep_rows], pa.int64()),
        }
    )
    (meta / "episodes" / "chunk-000").mkdir(parents=True)
    pq.write_table(ep_table, meta / "episodes" / "chunk-000" / "file-000.parquet")
    table = pa.table(
        {
            "observation.state": pa.FixedSizeListArray.from_arrays(
                np.array(flat, dtype=np.float32).ravel(), d
            ),
            "action": pa.FixedSizeListArray.from_arrays(
                np.array([[x * 0.5 for x in step] for step in flat], dtype=np.float32).ravel(), d
            ),
        }
    )
    pq.write_table(table, data / "file-000.parquet")
    (meta / "stats.json").write_text(
        json.dumps(
            {
                "observation.state": {"mean": [0.0] * d, "std": [1.0] * d, "min": [0.0] * d, "max": [1.0] * d},
                "action": {"mean": [0.0] * d, "std": [0.5] * d, "min": [0.0] * d, "max": [0.5] * d},
            }
        )
    )
    (root / ".versions.json").write_text(json.dumps({"versions": [{"tag": "v1", "created": "2026-11-01", "episodes": len(episodes)}], "current": "v1"}))


@pytest.fixture(name="ds_root")
def ds_root_fixture(tmp_path: Path) -> Path:
    root = tmp_path / "warehouse_demo"
    episodes = [[[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]], [[0.7, 0.8, 0.9]]]
    write_minimal_dataset(root, 10, episodes)
    return root


def test_info_guard(tmp_path: Path) -> None:
    empty = tmp_path / "empty"
    empty.mkdir()
    with pytest.raises(DatasetError, match="not a LeRobotDataset"):
        LeRobotAdapter(empty)


def test_roundtrip_metadata(ds_root: Path) -> None:
    a = LeRobotAdapter(ds_root)
    s = a.summary()
    assert s["robot_type"] == "warehouse_bot"
    assert s["total_episodes"] == 2
    assert s["features"]["observation.state"] == [3]
    assert a.provenance()[".versions.json"]["current"] == "v1"
    assert a.fps() == 10


def test_roundtrip_episodes(ds_root: Path) -> None:
    a = LeRobotAdapter(ds_root)
    eps = a.episodes()
    assert [e["episode_index"] for e in eps] == [0, 1]
    assert eps[0]["length"] == 2
    assert eps[0]["dataset_from_index"] == 0 and eps[0]["dataset_to_index"] == 2
    assert eps[1]["dataset_from_index"] == 2


def test_roundtrip_feature_steps(ds_root: Path) -> None:
    a = LeRobotAdapter(ds_root)
    rows = a.steps(0)
    assert len(rows) == 2
    r0 = rows[0]["features"]["observation.state"]
    assert r0 == [pytest.approx(0.1, abs=1e-5), pytest.approx(0.2, abs=1e-5), pytest.approx(0.3, abs=1e-5)]
    assert rows[0]["stats"]["observation.state"]["max"] == [1.0, 1.0, 1.0]
    rows2 = a.steps(1)
    assert rows2[0]["features"]["action"][0] == pytest.approx(0.35, abs=1e-5)
