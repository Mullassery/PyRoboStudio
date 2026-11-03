# PyRoboStudio

Browser-based robotics visualization studio for the PyRobo* ecosystem — an
independent React workspace, a Python sidecar, and adapters for the Mullassery
robotics repositories.

## Status

Phases 0–1 (research + architecture + ADRs) complete. Phase 2 (minimal vertical
slice) largely done — shell, SDK/panel registry, graph explorer, data
inspector, simulated + sidecar sources, unit + Playwright test suites. Phase 3
(visualization foundation) done — R3F 3D viewer, deck.gl/H3 terrain, replay
timeline, charts. Remaining Phase 2/3 gap recorded honestly in `docs/roadmap.md`:
`.db3`/PyRoboReplay adapter (Phase 4). Foxglove WS is wired into the
sidecar (uvicorn lifespan, conformance-tested); sidecar-lost-mid-session
E2E passes via transport-failure interception.

- `docs/research/` — competitive analysis, library evaluation, per-repo audits
- `docs/architecture/` — system, SDK, data-source contracts, security model
  (incl. `§8` npm-audit triage log)
- `docs/decisions/` — ADRs (each records verification evidence)

## Layout