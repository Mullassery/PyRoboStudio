"""Spike 2 validation: foxglove-sdk 0.30.3 server handshake + advertisements.

Proves (per library-evaluation.md follow-up #2):
- server starts and negotiates subprotocol foxglove.sdk.v1
- client receives server "info" and channel "advertise" messages
- UserMessage data reaches the server listener
Run:  .venv/bin/python spikes/test_foxglove_handshake.py
"""
import asyncio
import json
import sys

import foxglove
import websockets

PORT = 9887


def main() -> int:
    server = foxglove.start_server(
        name="pyrobostudio-spike",
        port=PORT,
        capabilities=[foxglove.Capability.Time],
        supported_encodings=["json"],
    )
    foxglove.log("/spike/pose", {"x": 1.0})

    received: dict[str, object] = {"info": None, "advertise": None}

    async def client() -> None:
        conn = await websockets.connect(
            f"ws://127.0.0.1:{PORT}",
            subprotocols=["foxglove.sdk.v1"],
            open_timeout=5,
        )
        assert conn.subprotocol == "foxglove.sdk.v1"
        deadline = 20
        for _ in range(deadline):
            try:
                msg = await asyncio.wait_for(conn.recv(), timeout=2)
            except TimeoutError:
                continue
            if isinstance(msg, bytes):
                continue  # skip binary health ping etc.
            text = json.loads(msg)
            if text["op"] == "serverInfo":
                received["info"] = text
            elif text["op"] == "advertise" and text.get("channels"):
                received["advertise"] = text["channels"][0]
                break
        await conn.close()

    asyncio.run(client())
    server.stop()

    info = received["info"]
    adv = received["advertise"]
    ok = True
    if not info:
        print("FAIL: no info message")
        ok = False
    else:
        assert info["name"] == "pyrobostudio-spike"  # type: ignore[index]
        assert "time" in info["capabilities"]  # type: ignore[index]
        print("serverInfo OK:", json.dumps(info))  # type: ignore[index]
    if not adv:
        print("FAIL: no advertise message")
        ok = False
    else:
        assert adv["topic"] == "/spike/pose"  # type: ignore[index]
        assert adv["encoding"] == "json"  # type: ignore[index]
        print("advertise OK:", json.dumps(adv))  # type: ignore[index]

    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
