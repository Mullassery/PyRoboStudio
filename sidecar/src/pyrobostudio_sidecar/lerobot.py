"""LeRobotDataset v3.0 Parquet adapter — read-only.

Layout per docs/research/adapter-schemas.md §2 and verified against the
PyRoboFrames writer (lerobot.py). A directory without meta/info.json is
rejected rather than guessed (mirrors PyRoboFrames Rust reader behavior).
"""
import json
from pathlib import Path

import pyarrow.parquet as pq

INFO_REQUIRED = ["codebase_version", "robot_type", "fps", "total_episodes", "total_frames", "features"]


class DatasetError(ValueError):
    pass


class LeRobotAdapter:
    def __init__(self, root: Path) -> None:
        self.root = root
        info_path = root / "meta" / "info.json"
        if not info_path.exists():
            raise DatasetError(f"{root}: not a LeRobotDataset v3.0 (missing meta/info.json)")
        info = json.loads(info_path.read_text())
        missing = [k for k in INFO_REQUIRED if k not in info]
        if missing:
            raise DatasetError(f"{root}: meta/info.json missing keys {missing}")
        if info["codebase_version"] != "v3.0":
            raise DatasetError(f"{root}: codebase_version {info['codebase_version']!r} != v3.0")
        self.info = info

    def dataset_id(self) -> str:
        return self.root.name

    def episodes(self) -> list[dict]:
        out: list[dict] = []
        for chunk in sorted((self.root / "meta" / "episodes").glob("chunk-*/file-*.parquet")):
            table = pq.read_table(chunk)
            cols = {name: table.column(name).to_pylist() for name in table.column_names}
            for i in range(table.num_rows):
                out.append(
                    {
                        "episode_index": cols["episode_index"][i],
                        "length": cols["length"][i],
                        "dataset_from_index": cols["dataset_from_index"][i],
                        "dataset_to_index": cols["dataset_to_index"][i],
                        "data/chunk_index": cols["data/chunk_index"][i],
                        "data/file_index": cols["data/file_index"][i],
                    }
                )
        return out

    def features(self) -> dict:
        return self.info["features"]

    def fps(self) -> int:
        return int(self.info["fps"])

    def steps(self, episode_index: int, max_steps: int = 64) -> list[dict]:
        eps = self.episodes()
        ep = next((e for e in eps if e["episode_index"] == episode_index), None)
        if ep is None:
            raise KeyError(f"unknown episode {episode_index}")
        from_idx = ep["dataset_from_index"]
        to_idx = min(ep["dataset_to_index"], from_idx + max_steps)
        chunk = self.root / "data" / f"chunk-{ep['data/chunk_index']:03d}" / f"file-{ep['data/file_index']:03d}.parquet"
        table = pq.read_table(chunk)
        stats = self.stats()
        cols = {name: table.column(name) for name in table.column_names}
        # Shards store one row per step; each column value is the step's fixed-size vector.
        def vec(name: str, row_i: int) -> list:
            return cols[name][row_i].as_py()

        out: list[dict] = []
        for gidx in range(from_idx, to_idx):
            row_i = gidx  # one row per step in this layout
            if row_i >= table.num_rows:
                raise DatasetError(f"{self.root}: data shard has {table.num_rows} rows, need row {row_i}")
            out.append(
                {
                    "globalStep": gidx,
                    "episode_index": episode_index,
                    "features": {
                        name: vec(name, row_i) for name in cols
                    },
                    "stats": {name: stats.get(name, {}) for name in cols},
                }
            )
        return out

    def stats(self) -> dict:
        stats_path = self.root / "meta" / "stats.json"
        if not stats_path.exists():
            raise DatasetError(f"{self.root}: missing meta/stats.json")
        return json.loads(stats_path.read_text())

    def summary(self) -> dict:
        return {
            "dataset_id": self.dataset_id(),
            "codebase_version": self.info["codebase_version"],
            "robot_type": self.info.get("robot_type"),
            "fps": self.fps(),
            "total_episodes": self.info["total_episodes"],
            "total_frames": self.info["total_frames"],
            "features": {name: f["shape"] for name, f in self.info["features"].items()},
        }

    def provenance(self) -> dict:
        versions = {}
        for name in (".versions.json", "manifest.json"):
            p = self.root / name
            if p.exists():
                versions[name] = json.loads(p.read_text())
        return versions
