# ADR-0005: 3D stack — R3F for robot/sensor space; deck.gl and/or Cesium (Resium) for terrain; separate canvases

**Status:** Accepted · **Date:** 2026-10-31

## Context
Master prompt Module C needs URDF robots, TF, trajectories, point clouds, occupancy grids, camera overlays, markers. Module E needs terrain/traversability over PyTerrainMap (H3 observations with confidence decay; repo exports Cesium 3D Tiles — verified in `docs/research/repos/pyterrainmap.md`).

Verified 2026-10-31: three.js 0.187 MIT and active; R3F v9 requires React 19 ✓; `urdf-loader` 0.13.1 Apache-2.0 but single-maintainer; CesiumJS 1.146 is **Apache-2.0** (the "license changed" rumor is false); `deck.gl` 9.4.1 ships `H3HexagonLayer` and `Tile3DLayer` **in core/geo-layers**; `@foxglove/three`, `@react-three/cesium`, `react-urdf-loader` **do not exist on npm** (flagged research assumptions corrected); ros3djs lineage effectively dead.

## Decision
1. **Robot/TF/sensor panel:** React Three Fiber + three.js + `urdf-loader` wrapped in R3F ourselves; labels via troika/drei; point clouds via `<Points>`/custom shader with fp16 quantization, deck.gl `PointCloudLayer` at LiDAR scale.
2. **Terrain panel:** deck.gl for H3 confidence/staleness/conflict layers + `Tile3DLayer` for 3D Tiles; Cesium (+Resium) only if full 3D Terrain REST streaming proves needed — both Apache-2.0/MIT.
3. **R3F and deck.gl/Cesium run on separate canvases**, coordinated through shared zustand camera/pose state rather than fighting for one WebGL context; this also satisfies synchronized image/3D requirements.

## Consequences
- urdf-loader version lock + fork path documented in SDK docs (single-maintainer risk).
- No claim of "renders 3D Tiles like Foxglove" until Phase 3 acceptance evidence.
- Two render contexts raise shared-frame discipline requirements in the time cursor (documented contract).

## Rejected alternatives
- One unified WebGL context (context conflicts; awkward render loop coexistence).
- Foxglove 3D engine reuse (package not published; Studio repo archived).
- ros3djs (pinned three r89, unmaintained).
