# Troubleshooting

## The shell boots but shows "disconnected: sidecar unreachable"

The sidecar isn't running. Start it:

```sh
cd sidecar && uv run uvicorn pyrobostudio_sidecar.server:app --port 8787
```

The footer polls health every 4 s and recovers automatically once the sidecar
is back (the source swaps back to sidecar when `/capabilities` answers again).

## `/capabilities` shows `repos/<name>: loaded: false`

That adapter's fixture is missing or invalid. Regenerate:

```sh
cd sidecar && uv run python -m pyrobostudio_sidecar.make_fixture
```

`make_fixture` is idempotent — it rewrites MCAP/db3/Parquet/JSON/sqlite
fixtures and the mission manifest (with fresh sha256 hashes). If a mission
manifest hash is stale after editing fixtures by hand, re-run it rather than
editing hashes manually.

## Mission manifest errors: "sha256 mismatch"

You edited a fixture file after the manifest was generated. Re-run
`make_fixture` — the manifest hashes are computed from the actual bytes.

## Graph panel is empty / nodes not clickable

If nodes render but are off-viewport, the post-layout fitView didn't run.
This was a real bug (fixed in Phase 5): after the async ELK layout, the panel
re-fits. If you see it again, check `graph-explorer.tsx` — the
`setTimeout(() => reactFlow.fitView(...))` after `setNodes` must survive
refactors.

## Playwright tests fail with "Element is outside of the viewport"

Graph nodes move during ELK relayout when selection changes. Wait for the
deferred fitView (`waitForTimeout(800)` after opening the graph panel) or use
`force: true` for clicks on graph nodes.

## Port conflicts

- HTTP 8787: `lsof -i :8787` then kill, or pass `--port` to uvicorn.
- Foxglove WS 9887: fixed in `server.py` (`WS_PORT`) — change there if needed.
- Vite 5173: `npx vite --port 5174` (update the Playwright webServer config
  if you change it permanently).

## `uv run pytest` from the repo root fails

Run it from `sidecar/` — the project env and pyproject live there.

## npm audit shows 11 findings

Known and triaged: all transitive in deck.gl/@loaders.gl archive parsers, none
in the executed closure; `npm audit fix --force` would break the ADR-0005
deck.gl pin. See `docs/architecture/security-model.md` §8. Re-triage on any
deck.gl upgrade.

## Live ROS mode

Not available on this host (macOS has no ROS 2 Tier-1 support). The
`ros-live` adapter reports `loaded: false` with an honest error — this is by
design, not a bug. Live mode requires Ubuntu + ROS 2 (see
`docs/sidecar-deployment.md`).
