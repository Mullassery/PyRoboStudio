"""Adapter tests for the networkintel + syncfleet read paths against fixture DBs."""
from pathlib import Path

import pytest

from pyrobostudio_sidecar.fixtures_env import make_ni_db, make_sf_db
from pyrobostudio_sidecar.networkintel import (
    NetworkIntelError,
    devices,
    findings,
    open_ro,
    sessions,
    topology,
)
from pyrobostudio_sidecar.syncfleet import (
    SyncFleetError,
    open_ro as sf_open,
    status,
)


def test_ni_sessions(tmp_path: Path) -> None:
    path = tmp_path / "pynetworkintel.db"
    make_ni_db(path)
    con = open_ro(path)
    s = sessions(con)
    assert s[0]["id"] == 1 and s[0]["status"] == "completed"
    assert s[0]["deviceCount"] == 2 and s[0]["findingCount"] == 1
    dev = devices(con, 1)
    assert {d["ip"] for d in dev} == {"192.168.1.2", "192.168.1.3"}
    r1 = next(d for d in dev if d["ip"] == "192.168.1.2")
    assert {svc["port"] for svc in r1["services"]} == {2224, 22}
    assert r1["isOnline"] is True
    f = findings(con, 1)
    assert f[0]["cveId"] == "CVE-9999-0001"
    assert f[0]["exploitAvailable"] is True


def test_ni_topology(tmp_path: Path) -> None:
    path = tmp_path / "pynetworkintel.db"
    make_ni_db(path)
    con = open_ro(path)
    topo = topology(con, 1)
    kinds = {n["kind"] for n in topo["nodes"]}
    assert {"subnet", "device", "service"} <= kinds
    assert any(n["id"] == "subnet:192.168.1.0/24" for n in topo["nodes"])
    device_nodes = [n for n in topo["nodes"] if n["kind"] == "device"]
    assert len(device_nodes) == 2
    assert len([e for e in topo["edges"] if e["source"].startswith("subnet")]) == 2


def test_not_a_networkintel_db(tmp_path: Path) -> None:
    path = tmp_path / "bogus.db"
    path.touch()
    import sqlite3
    con = sqlite3.connect(path)
    con.execute("CREATE TABLE other (a TEXT)")
    con.commit()
    con.close()
    with pytest.raises(NetworkIntelError, match="expected tables"):
        open_ro(path)


def test_couple_real_networkintel_db_if_present() -> None:
    real = Path("/Users/georgimullassery/Desktop/Projects/PyNetworkIntel/pynetworkintel.db")
    if not real.exists():
        pytest.skip("networkintel runtime db not generated")
    con = open_ro(real)
    sessions(con)


def test_sf_status(tmp_path: Path) -> None:
    path = tmp_path / "syncfleet.db"
    make_sf_db(path)
    con = sf_open(path)
    st = status(con)
    assert st["journal"]["operations"] == 5
    assert st["journal"]["datasets"][0]["maxOriginSeq"] == 5
    lag = {p["peerId"]: p["lagOps"] for p in st["replicationLag"]}
    assert lag["nodeB"] == 1
    assert lag["nodeC"] == 2
    assert {p["peerId"] for p in st["stalePeers"]} == {"nodeB", "nodeC"}
    assert len(st["openConflicts"]) == 1


def test_sf_conflict_is_open(tmp_path: Path) -> None:
    path = tmp_path / "syncfleet_resolved.db"
    make_sf_db(path)
    con = sf_open(path)
    con.close()
    import sqlite3
    con2 = sqlite3.connect(path)
    con2.execute("UPDATE conflicts SET resolved_at = '2026-11-01 11:00' WHERE id = 1")
    con2.commit()
    con2.close()
    con3 = sf_open(path)
    st = status(con3)
    assert st["openConflicts"] == []


def test_not_a_journal_db(tmp_path: Path) -> None:
    path = tmp_path / "bogus.db"
    import sqlite3
    con = sqlite3.connect(path)
    con.execute("CREATE TABLE other (a TEXT)")
    con.commit()
    con.close()
    with pytest.raises(SyncFleetError, match="expected"):
        sf_open(path)


def test_couple_real_syncfleet_db_if_present() -> None:
    real = Path.home() / ".local/share/syncfleet/syncfleet.db"
    if not real.exists():
        pytest.skip("syncfleet runtime db not generated")
    con = sf_open(real)
    status(con)
