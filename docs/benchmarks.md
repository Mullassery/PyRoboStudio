# Benchmarks — real numbers, not claims

Phase 6 performance-budget campaign. Every number here was measured on the
development machine (Apple Silicon MacBook, macOS, 2026-11-04) with the
commands shown. They are single-run measurements intended as engineering
evidence for the xyflow-vs-sigma decision point and sidecar capacity —
not a CI gate. Re-run them when the graph renderer or sidecar changes.

## 1. Graph model + ELK layout scaling (xyflow vs sigma switch point)

Command: `BENCH=1 npx vitest run src/test/bench-graph.spec.ts`
Synthetic graph: N nodes + N topics + 2N pub/sub edges, expanded view.

| nodes | topics | edges | model build (ms) | ELK layout (ms) |
|------:|-------:|------:|-----------------:|----------------:|
| 50    | 50     | 100   | 0.2              | 73.0 (cold)     |
| 100   | 100    | 200   | 0.1              | 41.7            |
| 250   | 250    | 500   | 0.3              | 89.3            |
| 500   | 500    | 1000  | 0.8              | 125.2           |
| 1000  | 1000   | 2000  | 2.9              | 234.1           |
| 2000  | 2000   | 4000  | 9.5              | 460.9           |

Reading:
- ELK layout scales ~linearly (~0.23 ms/node) after warmup. Even 2000 nodes
  lay out in under 0.5 s.
- The practical xyflow ceiling is **DOM node count**, not layout: each node
  is a positioned DOM element; at several thousand nodes interaction
  (pan/zoom) degrades before layout does.
- **Decision point (evidence-based):** xyflow + ELK is adequate through
  ~1000–2000 nodes. A sigma.js (WebGL) switch becomes worth it beyond that,
  and sigma's ForceAtlas2 replaces ELK's layered semantics — a real cost.
  ROS 2 graphs in the PyRobo* ecosystem are hundreds of nodes, not
  thousands; no switch is justified today.

## 2. Sidecar HTTP throughput/latency

Command: `uv run --project sidecar python scripts/bench_sidecar.py`
(httpx, 8 concurrent workers, 5 s per endpoint, against a local uvicorn dev
server — single process, no production tuning)

| endpoint                        | rps    | p50 (ms) | p95 (ms) | p99 (ms) | errors |
|---------------------------------|-------:|---------:|---------:|---------:|-------:|
| /capabilities                   | 1589   | 2.94     | 5.32     | 9.2      | 0      |
| /graph                          | 1459   | 3.06     | 8.50     | 83.95    | 0      |
| /topics/.../samples (max=10)    | 1423   | 3.32     | 14.04    | 54.63    | 0      |
| /repos/networkintel/topology    | 1440   | 3.34     | 16.88    | 48.25    | 0      |
| /repos/syncfleet/status         | 1449   | 3.33     | 17.09    | 45.88    | 0      |

**Bug found by this benchmark (and fixed):** the first run showed
intermittent 500s on the sqlite-backed `/repos/*` endpoints under 8-way
concurrency. Root cause: a single `sqlite3` connection shared across
uvicorn's worker threads corrupts cursor state (rows returned with wrong
shapes → `IndexError`). Fix: every request now opens a fresh read-only
connection (`repos.py` per-request handles; `Ros2BagAdapter` per-call
connections). Re-run shows 0 errors.

## 3. Message-rate ceilings (by design, measured where applicable)

- HTTP polling architecture: panels poll at 1.5–4 s intervals with bounded
  sample views (max 10 per topic; subscription cap 8 topics). The effective
  ceiling is the poll cadence, not the server: at ~1400 rps endpoint
  capacity the sidecar is not the bottleneck for a single-user studio.
- Foxglove WS (port 9887): channel advertisement is conformance-tested;
  sustained data-rate ceiling over WS is **unmeasured** — honest gap, only
  relevant when a live ROS bridge streams through it (Phase 7+).

## 4. Memory soak + dockview multi-panel limits

Command: `node scripts/soak.mjs 60` (Chromium with `--enable-precise-memory-info`)

| measurement                          | value      |
|--------------------------------------|-----------:|
| baseline heap (shell, 1 panel)       | 125.7 MB   |
| after opening all 9 registered panels| 129.7 MB   |
| 60 s soak, 40 tab switches           | 129.0–143.9 MB (GC sawtooth) |
| final heap after soak                | 129.0 MB   |
| net growth over soak                 | ~0 MB      |

Reading: opening all panels costs ~4 MB; 40 panel switches show GC sawtooth
and return to baseline — no leak evidence at this scale. Dockview handles
9 panels without degradation; no multi-panel limit observed.

## Honest limits of these benchmarks

- Single machine, single run, dev-mode servers (vite dev, un-tuned uvicorn).
- Synthetic graph topology (uniform degree 2), not a real ROS 2 graph.
- The soak exercises panel switching, not sustained data streaming.
- Foxglove WS data-rate ceiling unmeasured (see §3).
