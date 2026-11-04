# PyRoboStudio

Browser-based robotics visualization studio for the PyRobo* ecosystem — an
independent React workspace, a Python sidecar, and adapters for the Mullassery
robotics repositories.

## Status

Phases 0–1 (research + architecture + ADRs) complete. Phase 2 (minimal vertical
slice) done — shell, SDK/panel registry, graph explorer, data inspector,
simulated + sidecar sources, unit + Playwright test suites. Phase 3
(visualization foundation) done — R3F 3D viewer, deck.gl/H3 terrain, replay
timeline, charts. Phase 4 (repository adapters) done — read-only sidecar
adapters for ROS 2 `.db3` bags (rosbags, Apache-2.0 verified), PyRoboFrames
LeRobot v3.0 Parquet, PyRoboVision track exports, PyRoboSimulator world specs,
PyNetworkIntel scans (+ topology panel), and SyncFleet journals, each with
round-trip fixture tests and exposed under `/repos/*` with per-adapter
`adapterStatus` degradation. Foxglove WS is wired into the sidecar (uvicorn
lifespan, conformance-tested); sidecar-lost-mid-session E2E passes via
transport-failure interception. Honest PARTIAL/open items tracked in
`docs/roadmap.md`.

- `docs/research/` — competitive analysis, library evaluation, per-repo audits
- `docs/architecture/` — system, SDK, data-source contracts, security model
  (incl. `§8` npm-audit triage log)
- `docs/decisions/` — ADRs (each records verification evidence)

## Layout