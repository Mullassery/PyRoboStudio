"""Environment-test fixtures for networkintel + syncfleet adapters (verbatim upstream DDL subsets)."""
import sqlite3
from pathlib import Path

NI_DDL = [
    "CREATE TABLE scan_sessions (id INTEGER PRIMARY KEY, scan_time DATETIME NOT NULL, duration_seconds REAL, target VARCHAR(255), device_count INTEGER DEFAULT 0, finding_count INTEGER DEFAULT 0, status VARCHAR(50) DEFAULT 'completed', error_message TEXT)",
    "CREATE TABLE devices (id INTEGER PRIMARY KEY, scan_id INTEGER REFERENCES scan_sessions(id), ip VARCHAR(45) NOT NULL, hostname VARCHAR(255), os VARCHAR(255), device_type VARCHAR(50) DEFAULT 'linux', is_online BOOLEAN DEFAULT 1, last_seen DATETIME NOT NULL, first_seen DATETIME NOT NULL)",
    "CREATE TABLE services (id INTEGER PRIMARY KEY, device_id INTEGER REFERENCES devices(id), port INTEGER NOT NULL, name VARCHAR(100), version VARCHAR(255), protocol VARCHAR(10) DEFAULT 'tcp', state VARCHAR(50) DEFAULT 'open', first_seen DATETIME, last_seen DATETIME)",
    "CREATE TABLE findings (id INTEGER PRIMARY KEY, scan_id INTEGER REFERENCES scan_sessions(id), device_ip VARCHAR(45), finding_type VARCHAR(50), severity VARCHAR(20), title VARCHAR(500), description TEXT, evidence TEXT, recommendation TEXT, business_impact TEXT, cve_id VARCHAR(50), cvss_score REAL, exploit_available BOOLEAN DEFAULT 0, found_at DATETIME, resolved_at DATETIME)",
]

SF_DDL = [
    "CREATE TABLE operation_journal (id INTEGER PRIMARY KEY, dataset_id INTEGER REFERENCES datasets(id), entity_id VARCHAR(255), origin_node_id VARCHAR(255), origin_seq INTEGER NOT NULL, op_type INTEGER, schema_version INTEGER, payload BLOB, causal_metadata BLOB, created_at DATETIME, checksum BLOB)",
    "CREATE TABLE replication_checkpoints (id INTEGER PRIMARY KEY, peer_id VARCHAR(255), dataset_id INTEGER, last_acked_seq INTEGER, last_applied_seq INTEGER, updated_at DATETIME)",
    "CREATE TABLE conflicts (id INTEGER PRIMARY KEY, operation_id VARCHAR(255), local_operation_id VARCHAR(255), remote_operation_id VARCHAR(255), conflict_type INTEGER, detected_at DATETIME, resolved_at DATETIME, resolution TEXT)",
    "CREATE TABLE datasets (id INTEGER PRIMARY KEY, dataset_id VARCHAR(255), schema_version INTEGER, conflict_policy VARCHAR(50), created_at DATETIME)",
]


def make_ni_db(path: Path) -> dict:
    con = sqlite3.connect(path)
    for ddl in NI_DDL:
        con.execute(ddl)
    con.execute("INSERT INTO scan_sessions VALUES (1, '2026-11-01 10:00:00', 4.2, '192.168.1.0/24', 2, 1, 'completed', NULL)")
    con.execute("INSERT INTO devices VALUES (1, 1, '192.168.1.2', 'robot-1', 'Ubuntu', 'linux', 1, '2026-11-01', '2026-11-01')")
    con.execute("INSERT INTO devices VALUES (2, 1, '192.168.1.3', 'robot-2', 'Ubuntu', 'linux', 0, '2026-11-01', '2026-11-01')")
    con.execute("INSERT INTO services VALUES (1, 1, 2224, 'ros2-dds', NULL, 'udp', 'open', '2026-11-01', '2026-11-01')")
    con.execute("INSERT INTO services VALUES (2, 1, 22, 'ssh', 'OpenSSH_9.6', 'tcp', 'open', '2026-11-01', '2026-11-01')")
    con.execute("INSERT INTO findings VALUES (1, 1, '192.168.1.3', 'exposure', 'high', 'Open exploit reachable', 'nmap', 'svc', 'patch', 'disruption', 'CVE-9999-0001', 8.1, 1, '2026-11-01', NULL)")
    con.commit()
    con.close()
    return {"scan_id": 1}


def make_sf_db(path: Path) -> dict:
    con = sqlite3.connect(path)
    for ddl in SF_DDL:
        con.execute(ddl)
    con.execute("INSERT INTO datasets VALUES (1, 'terrain-cells', 1, 'last-write-wins', '2026-11-01')")
    for seq in range(1, 6):
        con.execute(
            "INSERT INTO operation_journal VALUES (?, 1, ?, 'nodeA', ?, 0, 1, ?, NULL, '2026-11-01 10:00:00', NULL)",
            (seq, f"cell-{seq}", seq, b"payload"),
        )
    con.execute("INSERT INTO replication_checkpoints VALUES (1, 'nodeB', 1, 4, 4, '2026-11-01 10:01:00')")
    con.execute("INSERT INTO replication_checkpoints VALUES (2, 'nodeC', 1, 3, 3, '2026-11-01 10:01:00')")
    con.execute("INSERT INTO conflicts VALUES (1, 'op-x', 'op-x-local', 'op-x-remote', 0, '2026-11-01 10:02:00', NULL, NULL)")
    con.commit()
    con.close()
    return {"peer_lagging": "nodeC", "lag": 2}
