"""PyNetworkIntel sqlite adapter — read-only networkintel.db sessions/devices/findings.

DDL quoted from pynetworkintel/db.py (see adapter-schemas.md §5). Opens
read-only; topology is derived here over a distinct data model.
"""
import sqlite3
from pathlib import Path


class NetworkIntelError(ValueError):
    pass


def open_ro(path: Path) -> sqlite3.Connection:
    con = sqlite3.connect(f"file:{path}?mode=ro&immutable=1", uri=True, check_same_thread=False)
    tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    required = {"scan_sessions", "devices", "findings"}
    if not required <= tables:
        raise NetworkIntelError(f"{path}: expected tables {sorted(required)}, found {sorted(tables)}")
    return con


def sessions(con: sqlite3.Connection) -> list[dict]:
    rows = con.execute(
        "SELECT id, scan_time, duration_seconds, target, device_count, finding_count, status, error_message "
        "FROM scan_sessions ORDER BY scan_time DESC LIMIT 50"
    ).fetchall()
    return [
        {
            "id": r[0],
            "scanTime": r[1],
            "durationSeconds": r[2],
            "target": r[3],
            "deviceCount": r[4],
            "findingCount": r[5],
            "status": r[6],
            "errorMessage": r[7],
        }
        for r in rows
    ]


def devices(con: sqlite3.Connection, scan_id: int) -> list[dict]:
    rows = con.execute(
        "SELECT id, ip, hostname, os, device_type, is_online, last_seen FROM devices WHERE scan_id = ? ORDER BY ip",
        (scan_id,),
    ).fetchall()
    out = []
    for r in rows:
        device = {
            "id": r[0],
            "ip": r[1],
            "hostname": r[2],
            "os": r[3],
            "deviceType": r[4],
            "isOnline": bool(r[5]),
            "lastSeen": r[6],
            "services": [],
        }
        for svc in con.execute(
            "SELECT port, name, version, protocol, state FROM services WHERE device_id = ? ORDER BY port",
            (r[0],),
        ).fetchall():
            device["services"].append(
                {"port": svc[0], "name": svc[1], "version": svc[2], "protocol": svc[3], "state": svc[4]}
            )
        out.append(device)
    return out


def findings(con: sqlite3.Connection, scan_id: int) -> list[dict]:
    rows = con.execute(
        "SELECT finding_type, severity, title, device_ip, cve_id, cvss_score, exploit_available, found_at "
        "FROM findings WHERE scan_id = ? ORDER BY found_at DESC LIMIT 200",
        (scan_id,),
    ).fetchall()
    return [
        {
            "findingType": r[0],
            "severity": r[1],
            "title": r[2],
            "deviceIp": r[3],
            "cveId": r[4],
            "cvssScore": r[5],
            "exploitAvailable": bool(r[6]),
            "foundAt": r[7],
        }
        for r in rows
    ]


def topology(con: sqlite3.Connection, scan_id: int) -> dict:
    """Distinct data model: subnet → device → service, groupable by /24."""
    nodes: list[dict] = []
    edges: list[dict] = []
    subnets = {}
    devices_ = devices(con, scan_id)
    for dev in devices_:
        subnet = ".".join(dev["ip"].split(".")[:3]) + ".0/24" if dev["ip"].count(".") == 3 and dev["ip"].split(".")[:3] else None
        subnet_id = None
        if subnet:
            subnet_id = f"subnet:{subnet}"
            if subnet_id not in subnets:
                subnets[subnet_id] = subnet
                nodes.append({"id": subnet_id, "kind": "subnet", "label": subnet})
        nodes.append({"id": f"device:{dev['id']}", "kind": "device", "label": dev["ip"], "hostname": dev["hostname"], "isOnline": dev["isOnline"]})
        if subnet_id:
            edges.append({"id": f"m:{subnet_id}-{dev['id']}", "source": subnet_id, "target": f"device:{dev['id']}"})
        for svc in dev["services"]:
            nodes.append({"id": f"service:{dev['id']}:{svc['port']}", "kind": "service", "label": f"{svc['name'] or svc['port']}/{svc['port']}"})
            edges.append({"id": f"r:{dev['id']}-{svc['port']}", "source": f"device:{dev['id']}", "target": f"service:{dev['id']}:{svc['port']}"})
    return {"nodes": nodes, "edges": edges}
