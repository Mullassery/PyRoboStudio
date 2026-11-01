# ADR-0003: dockview-react for the dockable workspace shell

**Status:** Accepted (verified: src/spike/dockview-spike.test.tsx, 2026-10-31) · **Date:** 2026-10-31

## Context
The master prompt requires resizable/dockable panels and **saved workspace layouts**. Serialization is the expensive requirement. Options verified 2026-10-31 (`library-evaluation.md`):
- `dockview-react` 8.8.3, MIT, released 2026-10-30, built-in `toJSON/fromJSON`.
- `flexlayout-react` 0.11.1, MIT, Caplin-maintained, built-in serialization, ESM-only, 0.x semver.
- `react-mosaic-component` 7.2.1, Apache-2.0, no built-in serialization, react-dnd dep tree.
- `golden-layout` 2.6.0 — no release since 2022, no React binding (excluded).

## Decision
Use `dockview-react` (first-party React package, strongest cadence, first-class JSON layout persistence). Store serialized layouts via zustand `persist`/localStorage plus JSON export. Do not depend on any `dockview-enterprise` features.

## Consequences
- CSS is a side-effect import; bundle actual measured at Phase 2 (`rollup-plugin-visualizer`).
- **Verified 2026-10-31** (`src/spike/dockview-spike.test.tsx`): `tsc --noEmit` (strict) passes; addPanel + `toJSON`/`clear`/`fromJSON` layout round-trip passes under React 19.3.1 / Vite 8.3.5 / Vitest 5.0.5 with a `ResizeObserver` test stub. Notes learned: panel content commits asynchronously (tests need `act`+`waitFor`); only the active tab's content component is mounted (`showOnlyVisibleTabs`-style behavior), which matters for panel-level assumptions later.

## Rejected alternatives
- flexlayout-react (excellent fallback — 0.x versions and ESM-only are acceptable but cadence/model-driven API is slightly less ergonomic for a palette-driven workspace).
- Building a docking engine (explicitly discouraged by the master prompt; unnecessary).
- react-mosaic-component (DIY serialization; dependency weight).
