# ADR-0002: Python sidecar with foxglove-sdk transport; no Rust service in v1

**Status:** Accepted (server handshake verified: sidecar/spikes/test_foxglove_handshake.py, 2026-10-31) · **Date:** 2026-10-31

## Context
- No PyRobo\* repository ships a server (repo audits); all integration is app-owned.
- macOS is Tier 3 for ROS 2 — the dev machines cannot assume rclpy.
- Binary-friendly browser transport is needed (images, LiDAR). rosbridge is JSON-only; `@foxglove/ws-protocol` is deprecated/archived; `foxglove-sdk` (PyPI 0.30.3, MIT, actively maintained 2026-10-26) provides the maintained protocol with schema announcements, a `Time` playback capability, and a Rust core.
- ROS 2 live introspection exists natively only when rclpy/foxglove_bridge are available.

## Decision
1. One **Python sidecar** (FastAPI HTTP/JSON + foxglove-sdk WebSocket binary plane) owns every connection to ROS, files, terrain, and fleet services. Browser never touches DDS or external APIs directly.
2. No Rust microservice in v1 — PyRoboReplay/PyRoboFrames already expose Rust performance through PyO3; adding a second service layer is unjustified complexity.
3. Sidecar must start and serve recorded/offline mode without rclpy installed (pure-Python decode: rosbags, mcap, PyRoboReplay). Live mode requires Ubuntu + ROS 2 (Jazzy/Lyrical, not Kilted).
4. Live graph introspection comes from rclpy graph API in the sidecar; foxglove_bridge (v3.6.3) is the fallback shortcut where available.

## Consequences
- Two-plane API (WS binary + HTTP control) must be kept consistent (contracts doc).
- foxglove-sdk protocol churn risk → pin versions, conformance test, negotiate protocol versions.
- **Verified 2026-10-31** (`sidecar/spikes/test_foxglove_handshake.py`, foxglove-sdk 0.30.3 on Python 3.12 via uv): server starts on localhost, negotiates subprotocol `foxglove.sdk.v1`, and the client receives `{"op":"serverInfo", ... "capabilities":["time"]}` followed by `{"op":"advertise","channels":[...]}`. Notes learned: channels are created at context level via `foxglove.log()` (no `server.add_channel`); the wire ops are `serverInfo`/`advertise` (not the older `info` naming from ws-protocol docs). Playback-control (`Capability.Time`) advertisement confirmed.

## Rejected alternatives
- rosbridge-only (JSON shape wrong for payload-rich robotics data; QoS handling limitations).
- Building a custom WS protocol (reinvesting maintained MIT semantics).
- Forking Lichtblick as the shell (MPL-2.0 file-level copyleft conflicts; ecosystem abandoned-fork risk; we'd inherit the generic-shell work we want clean room for missions/adapters).
