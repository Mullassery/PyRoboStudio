# PyRoboStudio

Browser-based robotics visualization studio for the PyRobo* ecosystem — an
independent React workspace, a Python sidecar, and adapters for the Mullassery
robotics repositories.

## Status

Phases 0–1 (research + architecture + ADRs) complete. Phase 2 (minimal vertical
slice) largely done — shell, SDK/panel registry, graph explorer, data
inspector, simulated + sidecar sources, unit + Playwright test suites. Phase 3
(visualization foundation) done — R3F 3D viewer, deck.gl/H3 terrain, replay
timeline, charts. Remaining Phase 2/3 gaps recorded honestly in
`docs/roadmap.md` (foxglove WS wired into server app, `.db3`/PyRoboReplay
adapter, disconnect-mid-session E2E).

- `docs/research/` — competitive analysis, library evaluation, per-repo audits
- `docs/architecture/` — system, SDK, data-source contracts, security model
  (incl. `§8` npm-audit triage log)
- `docs/decisions/` — ADRs (each records verification evidence)

## Layout

- `src/` — React (Vite 8, TS strict) frontend; `src/spike/` holds validation
  spikes referenced by ADRs
- `src/panels/` — panel plugins (graph-explorer, inspector, world3d, terrain,
  replay, charts) registered in `src/panels/index.ts`
- `sidecar/` — Python 3.12 (uv) FastAPI sidecar;
  `sidecar/src/pyrobostudio_sidecar/` (`server.py`, `recorded.py`,
  `make_fixture.py`, terrain fixture); fixtures in `sidecar/fixtures/`
  (generated deterministic MCAP + graph/tf/events metadata)

## Commands

```
npm install                 # frontend deps
npm run dev                 # vite dev server (proxies /api → sidecar :8787)
npm run typecheck           # tsc --noEmit (strict)
npm run test                # vitest run (unit)
npx playwright test         # E2E (starts sidecar + vite automatically)

uv run python -m pyrobostudio_sidecar.make_fixture   # regenerate fixtures
uv run uvicorn pyrobostudio_sidecar.server:app --port 8787   # sidecar
uv run python -m pyrobostudio_sidecar.spikes.test_foxglove_handshake  # transport conformance spike
```

## Safety posture

Read-only. No ROS publishing, no teleop, no command path, ever (see
`docs/architecture/security-model.md`).
