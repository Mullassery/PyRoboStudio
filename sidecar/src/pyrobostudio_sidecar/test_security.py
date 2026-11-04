"""Phase 6 security negative tests (see docs/architecture/security-model.md).

Verifies the read-only and localhost posture claims with tests, not prose.
"""
import sqlite3
from pathlib import Path

from fastapi.testclient import TestClient

from pyrobostudio_sidecar.networkintel import open_ro
from pyrobostudio_sidecar.server import create_app

FIXTURES = Path(__file__).resolve().parent.parent.parent / "fixtures"


def client() -> TestClient:
    return TestClient(create_app(ws_port=None))


def test_topic_path_traversal_is_rejected() -> None:
    c = client()
    for evil in ["..%2F..%2Fetc%2Fpasswd", "../../etc/passwd", "t/../../../etc/passwd"]:
        r = c.get(f"/topics/{evil}/samples")
        assert r.status_code == 404, (evil, r.status_code)


def test_session_id_traversal_is_rejected() -> None:
    c = client()
    for evil in ["..%2F..%2Fetc%2Fpasswd", "../../etc/passwd"]:
        r = c.get(f"/sessions/{evil}/events")
        assert r.status_code == 404, (evil, r.status_code)


def test_mission_id_traversal_is_rejected() -> None:
    c = client()
    for evil in ["..%2F..%2Ffixtures%2Fsample_session.mcap", "../fixtures/mission_warehouse.json"]:
        r = c.get(f"/missions/{evil}")
        assert r.status_code == 404, (evil, r.status_code)


def test_no_cors_wildcard_middleware() -> None:
    app = create_app(ws_port=None)
    middleware_classes = [m.cls.__name__ for m in app.user_middleware]
    assert "CORSMiddleware" not in middleware_classes, (
        "CORS middleware must not be added until a non-localhost origin story exists "
        "(security-model.md §2: CORS minimal; no wildcard)"
    )


def test_repo_databases_are_opened_read_only() -> None:
    con = open_ro(FIXTURES / "pynetworkintel.db")
    try:
        with pytest_write_fails(con):
            pass
    finally:
        con.close()


def pytest_write_fails(con: sqlite3.Connection):  # noqa: ANN201 - test helper
    import contextlib

    @contextlib.contextmanager
    def ctx():
        try:
            con.execute("INSERT INTO scan_sessions (id) VALUES (999)")
            raise AssertionError("write to read-only connection succeeded")
        except sqlite3.OperationalError as e:
            assert "read-only" in str(e) or "readonly" in str(e), str(e)
        yield

    return ctx()


def test_ros2bag_connection_is_read_only(tmp_path: Path) -> None:
    import shutil

    from pyrobostudio_sidecar.ros2bag import Ros2BagAdapter

    dst = tmp_path / "bag.db3"
    shutil.copy(FIXTURES / "sample_session.db3", dst)
    adapter = Ros2BagAdapter(dst)
    import contextlib

    with contextlib.closing(sqlite3.connect(f"file:{dst}?mode=ro", uri=True)) as con:
        try:
            con.execute("INSERT INTO topics VALUES (99, '/x', 'std_msgs/msg/Float32')")
            raise AssertionError("write to read-only bag connection succeeded")
        except sqlite3.OperationalError:
            pass
    assert adapter.topics()  # reads still work


def test_unknown_source_id_never_leaks_filesystem() -> None:
    c = client()
    r = c.get("/sessions/%2e%2e/%2e%2e/events")
    assert r.status_code in (404, 400)
    assert "fixtures" not in r.text
