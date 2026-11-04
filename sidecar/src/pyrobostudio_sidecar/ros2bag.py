"""ROS 2 bag (.db3) adapter — read-only decode via rosbags 0.11.9.

Schema per docs/research/adapter-schemas.md: standard ROS 2 sqlite layout
(topics/messages/metadata), CDR little-endian payloads starting at data[4].
Undecodable topics are reported as degraded, never silently skipped.
"""
import dataclasses
import json
import sqlite3
from pathlib import Path
from typing import Any

import numpy as np
from rosbags.typesys import Stores, get_typestore

SCHEMA_PROOF = "topics/messages/metadata"


def _to_jsonable(value: Any) -> Any:
    if isinstance(value, (str, bool)):
        return value
    if isinstance(value, (np.floating, np.integer)):
        return value.item()
    if isinstance(value, float):
        if np.isnan(value) or np.isinf(value):
            return str(value)
        return value
    if isinstance(value, (int,)):
        return value
    if isinstance(value, np.ndarray) or isinstance(value, (list, tuple)):
        return [_to_jsonable(v) for v in (value.tolist() if isinstance(value, np.ndarray) else value)]
    if isinstance(value, bytes):
        return None
    if dataclasses.is_dataclass(value):
        out = {}
        for f in dataclasses.fields(value):
            if f.name == "__msgtype__":
                continue
            raw = getattr(value, f.name)
            if f.name == "data" and isinstance(raw, (np.ndarray, list)) and len(raw) > 64:
                out[f.name] = f"<{type(raw).__name__} len={len(raw)}>"
            else:
                out[f.name] = _to_jsonable(raw)
        return out
    return None


class Ros2BagAdapter:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.typestore = get_typestore(Stores.ROS2_HUMBLE)
        self.con = sqlite3.connect(
            f"file:{path}?mode=ro&immutable=1", uri=True, check_same_thread=False
        )
        self._validate_schema()

    def _validate_schema(self) -> None:
        tables = {
            row[0]
            for row in self.con.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )
        }
        missing = {"topics", "messages"} - tables
        if missing:
            raise ValueError(f"{self.path}: not a ROS 2 bag, missing tables {sorted(missing)}")

    def topics(self) -> list[dict]:
        rows = self.con.execute("SELECT id, name, type FROM topics ORDER BY id").fetchall()
        return [
            {"id": f"t/{name}", "name": name, "msgType": typ}
            for _id, name, typ in rows
        ]

    def span(self) -> dict:
        row = self.con.execute(
            "SELECT MIN(timestamp), MAX(timestamp) FROM messages"
        ).fetchone()
        if row is None or row[0] is None:
            raise ValueError(f"{self.path}: bag has no messages")
        return {"startNs": int(row[0]), "endNs": int(row[1]), "clockDomain": "ros_time"}

    def metadata(self) -> dict:
        return {k: v for k, v in self.con.execute("SELECT key, value FROM metadata")}

    def degradation(self) -> list[str]:
        known = {name for name in self.typestore.types}
        out: list[str] = []
        for _id, name, typ in self.con.execute("SELECT id, name, type FROM topics"):
            if typ not in known:
                out.append(f"{name}: type {typ} not in rosbags ROS2_HUMBLE typestore")
        return out

    def samples(self, topic: str, max_count: int = 10) -> list[dict]:
        row = self.con.execute(
            "SELECT id, type FROM topics WHERE name = ?", (topic,)
        ).fetchone()
        if row is None:
            raise KeyError(f"unknown topic {topic}")
        _tid, typ = row
        if typ not in self.typestore.types:
            raise ValueError(f"type {typ} not decodable by rosbags typestore")
        rows = self.con.execute(
            "SELECT timestamp, data FROM messages WHERE topic_id = ? ORDER BY timestamp LIMIT ?",
            (row[0], max_count),
        ).fetchall()
        samples: list[dict] = []
        for seq, (ts, blob) in enumerate(rows):
            msg = self.typestore.deserialize_cdr(blob, typ)
            samples.append(
                {
                    "topicId": f"t/{topic}",
                    "seq": seq,
                    "timestampNs": int(ts),
                    "msgType": typ,
                    "payload": _to_jsonable(msg),
                }
            )
        return samples

    def message_counts(self) -> dict:
        out: dict[str, int] = {}
        for name, tid in self.con.execute("SELECT name, id FROM topics"):
            c = self.con.execute(
                "SELECT COUNT(*) FROM messages WHERE topic_id = ?", (tid,)
            ).fetchone()[0]
            out[name] = c
        return out


def write_db3_fixture(
    path: Path, topics: dict[str, str], timed_messages: dict[str, list[tuple[int, dict]]]
) -> None:
    """Write a standard ROS 2 bag .db3 with real CDR payloads (round-trip seed)."""
    import numpy as np
    from rosbags.typesys import Stores, get_typestore

    store = get_typestore(Stores.ROS2_HUMBLE)

    def encode(topic_type: str, payload: dict) -> bytes:
        cls_to_typ: dict[str, str] = {}
        for typ, cls in store.types.items():
            cls_to_typ[cls.__name__] = typ

        def build(typ: str, data: dict) -> Any:
            cls = store.types[typ]
            kwargs: dict[str, Any] = {}
            for field in dataclasses.fields(cls):
                name = field.name
                if name not in data:
                    continue
                val = data[name]
                raw = str(field.type)
                if raw.startswith("np.ndarray"):
                    if isinstance(val, dict) and "dtype" in val and "shape" in val:
                        val = np.array(val["data"], dtype=val["dtype"]).reshape(val["shape"].tolist())
                    else:
                        dtype = "f8" if "float64" in raw else "f4" if "float32" in raw else "i4" if "int32" in raw else None
                        val = np.array(val, dtype=dtype) if dtype else np.array(val)
                    kwargs[name] = val
                    continue
                if raw in cls_to_typ:
                    kwargs[name] = build(cls_to_typ[raw], val)
                    continue
                if "float" in raw:
                    kwargs[name] = np.float32(val) if "float32" in raw else float(val)
                    continue
                if raw in ("InterestingValue", "str", "bool", "int", "uint8", "uint16", "uint32", "int8", "int16", "int32", "int64", "uint64", "float", "double"):
                    kwargs[name] = val
                    continue
                kwargs[name] = val
            return cls(**kwargs)

        return store.serialize_cdr(build(topic_type, payload), topic_type)

    con = sqlite3.connect(path)
    con.execute("CREATE TABLE metadata ( key TEXT PRIMARY KEY, value TEXT )")
    con.execute("CREATE TABLE topics ( id INTEGER PRIMARY KEY, name TEXT UNIQUE, type TEXT )")
    con.execute("CREATE TABLE messages ( timestamp INTEGER, topic_id INTEGER, data BLOB )")
    con.execute("INSERT INTO metadata VALUES ('rosbag2', 'PyRoboStudio fixture v1')")
    ids: dict[str, int] = {}
    for i, (name, typ) in enumerate(topics.items(), start=1):
        con.execute("INSERT INTO topics VALUES (?, ?, ?)", (i, name, typ))
        ids[name] = i
    for name, msgs in timed_messages.items():
        for ts, payload in msgs:
            con.execute(
                "INSERT INTO messages VALUES (?, ?, ?)",
                (ts, ids[name], encode(topics[name], payload)),
            )
    con.commit()
    con.close()
