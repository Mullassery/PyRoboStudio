# PyRoboStudio

Browser-based robotics visualization studio for the PyRobo* ecosystem — an
independent React workspace, a Python sidecar, and read-only adapters for the
Mullassery robotics repositories (PyRoboReplay, PyRoboFrames, PyRoboVision,
PyRoboSimulator, PyNetworkIntel, SyncFleet).

**Design posture:** read-only by design — the studio visualizes and
correlates; it never publishes to robots or writes to source repositories.
Simulated or derived data is always badged (`SIMULATED`/`DERIVED`), never
presented as measured. Honest status reporting over demo polish.

## What works today

- **Shell** — dockview workspace, layout save/restore, ⌘K command palette,
  dark/light themes, source switching (simulated ↔ sidecar) with live
  re-resolution and sidecar-lost detection.
- **Panels (9)** — ROS graph explorer (xyflow + ELK layout, namespace
  collapse, QoS edges), data inspector (bounded topic samples),
  3D world viewer (R3F + TF frame tree), terrain viewer (deck.gl H3
  confidence/conflict layers), replay timeline, charts (recharts),
  network topology (PyNetworkIntel subnet/device/service graph), mission
  timeline (manifest artifacts + causal events), track debugger
  (identity-colored bboxes + derived SE(lifecycle) events).
- **Sidecar** (FastAPI, port 8787) — recorded MCAP session serving, Foxglove
  WS on 9887 (conformance-tested), `/repos/*` read-only adapters for six
  PyRobo* stores, mission manifest v1 with sha256 verification, per-adapter
  degradation in `/capabilities`.
- **Cross-view** — selection bus with per-panel mapping tables and explicit
  "not correlated" states; shared TimeBus (mission events drive replay).
- **Workspace export/import** — versioned JSON download/import via palette.

## Quickstart

```sh
# sidecar (Python 3.12 + uv)
cd sidecar
uv sync
uv run python -m pyrobostudio_sidecar.make_fixture   # regenerates fixtures
uv run uvicorn pyrobostudio_sidecar.server:app --port 8787

# frontend (Node 20+)
npm install
npm run dev        # http://localhost:5173, /api proxied to the sidecar
```

Open http://localhost:5173 — the shell boots against the simulated source;
switch to the sidecar source via ⌘K to see recorded fixture data.

## Tests

```sh
npm run typecheck          # tsc --noEmit
npx vitest run             # unit tests
npx playwright test        # E2E (starts vite + sidecar webServers)
cd sidecar && uv run pytest -q   # sidecar tests incl. security negatives
```

Benchmarks (real measured numbers, methodology, and limits):
`docs/benchmarks.md` — run `BENCH=1 npx vitest run src/test/bench-graph.spec.ts`,
`uv run --project sidecar python scripts/bench_sidecar.py`, `node scripts/soak.mjs 60`.

## Documentation

- `docs/roadmap.md` — phase-by-phase status with honest DONE/PARTIAL markers
- `docs/architecture/` — system architecture, visualization SDK, data-source
  contracts, security model (incl. vulnerability triage log)
- `docs/research/` — competitive analysis, library evaluation (licenses
  verified from wheels/upstream), per-repo adapter schemas
- `docs/decisions/` — ADRs, each recording verification evidence
- `docs/plugin-author-guide.md` — how to add a panel
- `docs/sidecar-deployment.md` — running the sidecar on macOS/Ubuntu
- `docs/troubleshooting.md` — common failure modes and fixes
- `docs/benchmarks.md` — measured performance numbers

## Status

Phases 0–6 complete through the Phase 6 gate: research/architecture (0–1),
vertical slice (2), visualization foundation (3), repository adapters (4),
cross-view workflows (5), benchmark + harden (6). Known degraded paths are
documented, not hidden: live ROS mode requires Ubuntu + ROS 2 (macOS is
Tier 3); the SyncFleet annotation-sync spike stays behind a feature flag;
Foxglove WS sustained data-rate is unmeasured. Current open items and the
full phase history live in `docs/roadmap.md`.

## Repository layout

```
src/            React app (shell, panels, SDK, sources, state)
sidecar/        Python FastAPI sidecar + fixtures + tests
tests/e2e/      Playwright scenarios
scripts/        benchmark + soak scripts
docs/           architecture, research, ADRs, guides, benchmarks
```
