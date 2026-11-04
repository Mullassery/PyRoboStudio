"""Phase 6: Foxglove WS sustained-rate measurement (honest gap closure).

Builds a synthetic MCAP with N messages, starts a WsTransport on a free
port, connects a foxglove.sdk.v1 client, and measures how many replay
messages the client receives per second.

Run: cd sidecar && uv run python ../scripts/bench_ws.py
"""
import asyncio
import json
import math
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "sidecar" / "src"))

from mcap.writer import Writer  # noqa: E402

from pyrobostudio_sidecar.ws_transport import WsTransport  # noqa: E402

N_MESSAGES = 5000
PORT = 9893


def build_fixture(path: Path, n: int) -> None:
    with open(path, "wb") as fp:
        w = Writer(fp)
        w.start(profile="ros2")
        schema = w.register_schema("json", "jsonschema", b"{}")
        ch = w.register_channel("/bench/stream", message_encoding="json", schema_id=schema)
        for i in range(n):
            t = i * 1_000_000
            payload = json.dumps({"i": i, "v": round(math.sin(i / 10), 3)}).encode()
            w.add_message(ch, log_time=t, publish_time=t, data=payload)
        w.finish()


def timed_replay(t: WsTransport) -> float:
    global replay_t0
    time.sleep(1.0)  # let the client connect and subscribe
    replay_t0 = time.perf_counter()
    n = t.replay()
    print(f"replay() logged {n} messages")
    return time.perf_counter() - replay_t0


replay_t0 = 0.0


async def main() -> None:
    import websockets

    with tempfile.NamedTemporaryFile(suffix=".mcap", delete=False) as fp:
        fixture = Path(fp.name)
    build_fixture(fixture, N_MESSAGES)

    t = WsTransport(fixture=fixture, port=PORT)
    received = 0
    t0 = None
    t_last = 0.0

    async def client() -> None:
        nonlocal received, t0, t_last
        async with websockets.connect(
            f"ws://127.0.0.1:{PORT}", subprotocols=["foxglove.sdk.v1"], open_timeout=5
        ) as conn:
            channel_ids: list[int] = []
            deadline = time.monotonic() + 20
            while time.monotonic() < deadline and not channel_ids:
                try:
                    msg = await asyncio.wait_for(conn.recv(), timeout=10)
                except TimeoutError:
                    break
                if isinstance(msg, bytes):
                    continue
                text = json.loads(msg)
                if text.get("op") == "advertise" and text.get("channels"):
                    channel_ids = [c["id"] for c in text["channels"]]
            if channel_ids:
                await conn.send(json.dumps({"op": "subscribe", "subscriptions": [{"id": 1, "channelId": cid} for cid in channel_ids]}))
            while time.monotonic() < deadline and received < N_MESSAGES:
                try:
                    msg = await asyncio.wait_for(conn.recv(), timeout=10)
                except TimeoutError:
                    break
                if isinstance(msg, bytes):
                    if t0 is None:
                        t0 = time.perf_counter()
                    received += 1
                    t_last = time.perf_counter()

    server = t.start()
    try:
        # client connects + subscribes first, then we replay — measures the
        # sustained rate a connected viewer can receive
        replay_result = await asyncio.gather(client(), asyncio.to_thread(timed_replay, t))
        received_msgs = replay_result[0]
        del received_msgs
    finally:
        t.stop()
        fixture.unlink(missing_ok=True)
        del server

    elapsed = (t_last - t0) if t0 and t_last and t_last > t0 else 0.0
    rate = received / elapsed if elapsed > 0 else 0
    print(f"ws replay benchmark: received {received}/{N_MESSAGES} messages, stream window {elapsed:.3f}s -> {rate:.0f} msgs/s (first->last)")
    if received < N_MESSAGES:
        print(f"honest note: {N_MESSAGES - received} messages not received by the client")


asyncio.run(main())
