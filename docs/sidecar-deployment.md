# Sidecar deployment guide

The PyRoboStudio sidecar is a local, read-only FastAPI service. It serves
recorded/simulated data to the browser and hosts the Foxglove WS server.
No ROS installation is required for recorded mode.

## Prerequisites

- Python 3.12 with [uv](https://docs.astral.sh/uv/)
- macOS (arm64) or Ubuntu 22.04+ — the dev machine is macOS arm64; Linux is
  the target for live-ROS mode (ROS 2 is Tier 3 on macOS, so live mode will
  not work there — this is stated honestly, not worked around)

## Run (development)

```sh
# from the repository root
cd sidecar
uv sync                                   # creates .venv, installs pinned deps
uv run python -m pyrobostudio_sidecar.make_fixture   # regenerates fixtures/
uv run uvicorn pyrobostudio_sidecar.server:app --port 8787
```

- HTTP control plane: `http://127.0.0.1:8787` (localhost bind by default —
  see `server.py.__main__`; do not expose it remotely without re-reading
  `docs/architecture/security-model.md` §2)
- Foxglove WS: `ws://127.0.0.1:9887` (started in the uvicorn lifespan)

## Frontend

```sh
npm install
npm run dev        # vite on :5173, proxies /api -> 127.0.0.1:8787
```

## Verify it works

```sh
curl -s http://127.0.0.1:8787/capabilities | head -c 200
# adapterStatus should list repos/ros2bag, repos/lerobot, ... all "loaded": true
curl -s http://127.0.0.1:8787/missions
```

If an adapter shows `"loaded": false`, its fixture is missing — re-run
`make_fixture` (each adapter degrades independently by design; a missing
fixture never takes the sidecar down).

## Tests

```sh
# sidecar
cd sidecar && uv run pytest -q
# frontend (needs the dev servers running for Playwright)
npm run typecheck && npx vitest run && npx playwright test
```

## Ubuntu notes

- Same commands; `uv` handles the venv.
- Live ROS 2 mode (subscription via a ROS 2 bridge) requires a ROS 2 distro
  install; the sidecar reports `ros-live` as `loaded: false` with an honest
  error until that environment exists.
- If port 8787/9887 are taken, pass different ports: uvicorn `--port` for
  HTTP; the WS port is currently fixed at 9887 in `server.py` (known
  limitation, not hidden).

## Production hardening (not yet implemented — tracked in roadmap Phase 6+)

- Origin allowlist + optional bearer token + TLS: only needed if you bind to
  a non-localhost interface; none of it is coded yet.
- Browser CSP: not yet enforced in the production build.
- The server is single-process uvicorn; measured ~1400 rps per endpoint at
  8-way concurrency (docs/benchmarks.md §2) — far beyond single-user needs.
