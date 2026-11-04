"""foxglove-sdk WebSocket transport wired into the sidecar (per ADR-0002).

Advertises the recorded fixture topics as JSON channels and publishes the
fixture message stream with real log times, so a viewer can play back the
recorded session. Read-only: Service/capabilities never include publishing.
"""
import json
from pathlib import Path

import foxglove
from mcap.reader import make_reader

FIXTURES = Path(__file__).resolve().parent.parent.parent / "fixtures"
PORT = 9887


class WsTransport:
    def __init__(self, fixture: Path | None = None, port: int = PORT) -> None:
        self.fixture = fixture or (FIXTURES / "sample_session.mcap")
        self.port = port
        self._server: foxglove.WebSocketServer | None = None
        self.loaded = False
        self.starting = False

    def start(self) -> foxglove.WebSocketServer:
        if self._server:
            return self._server
        with open(self.fixture, "rb") as fp:
            schema_meta = {}
            for _schema, channel, _message in make_reader(fp).iter_messages():
                schema_meta[channel.topic] = channel.message_encoding
        summary_time_range = self._time_range()
        del summary_time_range
        self.starting = True
        self._server = foxglove.start_server(
            name="pyrobostudio-sidecar-ws",
            port=self.port,
            capabilities=[foxglove.Capability.Time],
            supported_encodings=["json"],
        )
        self.starting = False
        self.loaded = True
        self.replay()
        return self._server

    def replay(self) -> int:
        """Publish the fixture stream to currently-connected clients.

        Returns the number of messages logged. Called from start() (startup
        burst) and available for benchmarks / future playback loops so a
        client that is already connected can receive the stream.
        """
        if not self._server:
            raise RuntimeError("replay() called before start()")
        count = 0
        with open(self.fixture, "rb") as fp:
            for _schema, channel, message in make_reader(fp).iter_messages():
                try:
                    payload = json.loads(message.data)
                except (ValueError, UnicodeDecodeError):
                    continue
                foxglove.log(channel.topic, payload, log_time=message.log_time)
                count += 1
        return count

    def _time_range(self) -> tuple[int, int]:
        with open(self.fixture, "rb") as fp:
            times = [m.log_time for _s, _c, m in make_reader(fp).iter_messages()]
        if not times:
            raise ValueError(f"{self.fixture}: fixture has no messages")
        return (times[0], times[-1])

    def stop(self) -> None:
        self.loaded = False
        if self._server:
            self._server.stop()
            self._server = None
