"""SyncFleet journal sqlite adapter — read-only status summaries.

Schema from SyncFleet migrations (adapter-schemas.md §6). Uses replication
checkpoints to compute lag and unresolved conflicts for staleness surfacing.
"""
import sqlite3
from pathlib import Path


class SyncFleetError(ValueError):
    pass


def open_ro(path: Path) -> sqlite3.Connection:
    con = sqlite3.connect(f"file:{path}?mode=ro&immutable=1", uri=True, check_same_thread=False)
    tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    required = {"operation_journal", "replication_checkpoints", "conflicts"}
    if not required <= tables:
        raise SyncFleetError(f"{path}: expected journal tables, found {sorted(tables)}")
    return con


def journal_stats(con: sqlite3.Connection) -> dict:
    ops = con.execute("SELECT COUNT(*) FROM operation_journal").fetchone()[0]
    span = con.execute("SELECT MIN(created_at), MAX(created_at) FROM operation_journal").fetchone()
    per_dataset = con.execute(
        "SELECT dataset_id, COUNT(*), MAX(origin_seq) FROM operation_journal GROUP BY dataset_id"
    ).fetchall()
    return {
        "operations": ops,
        "oldestOp": span[0],
        "newestOp": span[1],
        "datasets": [
            {"datasetId": d[0], "operations": d[1], "maxOriginSeq": d[2]}
            for d in per_dataset
        ],
    }


def replication_lag(con: sqlite3.Connection) -> list[dict]:
    rows = con.execute(
        "SELECT rp.peer_id, rp.dataset_id, rp.last_acked_seq, rp.last_applied_seq, rp.updated_at,"
        " (SELECT MAX(origin_seq) FROM operation_journal oj WHERE oj.dataset_id = rp.dataset_id)"
        " FROM replication_checkpoints rp ORDER BY rp.dataset_id, rp.peer_id"
    ).fetchall()
    out = []
    for r in rows:
        max_seq = r[5] or 0
        out.append(
            {
                "peerId": r[0],
                "datasetId": r[1],
                "lastAckedSeq": r[2],
                "lastAppliedSeq": r[3],
                "updatedAt": r[4],
                "lagOps": max_seq - (r[2] or 0),
                "maxOriginSeq": max_seq,
            }
        )
    return out


def open_conflicts(con: sqlite3.Connection) -> list[dict]:
    rows = con.execute(
        "SELECT id, operation_id, conflict_type, detected_at, resolution FROM conflicts"
        " WHERE resolved_at IS NULL ORDER BY detected_at DESC LIMIT 100"
    ).fetchall()
    return [
        {
            "id": r[0],
            "operationId": r[1],
            "conflictType": r[2],
            "detectedAt": r[3],
            "resolution": r[4],
        }
        for r in rows
    ]


def status(con: sqlite3.Connection) -> dict:
    stats = journal_stats(con)
    lag = replication_lag(con)
    conflicts = open_conflicts(con)
    return {
        "origin": "recorded",
        "journal": stats,
        "replicationLag": lag,
        "stalePeers": [p for p in lag if p["lagOps"] > 0],
        "openConflicts": conflicts,
        "degraded": [f"{p['peerId']} lag {p['lagOps']} ops" for p in lag if p["lagOps"] > 0],
    }
