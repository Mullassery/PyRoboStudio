# PyRoboStudio Security Model

**Date:** 2026-10-31
**Status:** Proposed (Phase 1). Grounded in: PyTerrainMap audit (optional/write-only auth, unauthenticated reads, no rate limits, self-signed TLS — `docs/research/repos/pyterrainmap.md`), ROSboard's unauthenticated model (rejected, competitive analysis), SyncFleet alpha limitations (not hardened for the public internet).

## 1. Threat posture: read-only, local-first

- **v1 sends nothing, commands nothing.** The studio is a viewer. No ROS publishing, no teleop, no writes to PyRobo\* stores. The foxglove-sdk `ClientPublish` capability is not enabled server-side. Browser-to-robot control, if ever added, is a separately designed, authenticated, audited feature (master prompt §6, §11).
- **Primary trust boundary = the LAN/workstation.** The sidecar binds to localhost by default; remote access is opt-in, explicit, and documented as an accelerated risk surface.

## 2. Components and what runs where

| Component | Where | Privileges |
|---|---|---|
| Studio browser app | user's browser | none beyond the page; no arbitrary hosts reachable (fetch through sidecar only) |
| Python sidecar | dev workstation or Ubuntu robot host; env vars for endpoints | reads: bag files, ROS topics, PyTerrainMap/SyncFleet APIs via their own credentials configured in env/secret file — never in browser |
| ROS 2 / foxglove_bridge | Ubuntu with ROS 2 | read-only subscription; no bridge-side publish enablement |
| PyRobo\* services (PyTerrainMap etc.) | as deployed | accessed by the sidecar with their configured auth; **never directly by the browser** |

macOS note: no ROS install assumed; sidecar must never require `rclpy` to start (offline adapters only) — see `system-architecture.md` §2.

## 3. Boundaries and controls

### 3.1 Sidecar HTTP/WS API
- Binds `127.0.0.1` by default; if exposing: origin allowlist (no `*` once non-localhost is enabled), TLS required, optional bearer token generated per launch and echoed to the user, request logging.
- Endpoints are an allowlist mirroring `data-source-contracts.md`. **No file paths accepted from clients** (feed configured datasets via config, not URLs); no shell exec, no eval, no template rendering of user content.
- Input validation on every route (pydantic), bounded response sizes, rate limits tuned to GUI needs, per-connection subscription limits enforced server-side.
- CORS minimal; WebSocket same-origin enforcement.

### 3.2 PyRobo\* access
- PyTerrainMap audit failures are treated as ours too: sidecar enforces auth + TLS against terrain endpoints even where the service doesn't require it, and documents that unauthenticated reads are a deployment smell to fix upstream, not here.
- SyncFleet journals: read-only consumption. SyncFleet's own docs say alpha, not internet-hardened — we do not expose its peer enrollment or any write path through the studio.

### 3.3 Browser app
- No `dangerouslySetInnerHTML` for remote strings; DOMPurify for any rich text from payloads.
- CSP: `default-src 'self'; connect-src ws://localhost:* http://localhost:*` (nicetightonce remote endpoints are configured), no inline `<script>`.
- Extension/plugin posture: static registration only (SDK doc §5); no dynamic code loading; plugins use `ctx.fetch` portal, never raw network.
- Never render a "live" badge unless a socket is connected *and* `CapabilitiesResponse.origin === 'live'` for that source (data-source-contracts §3.4 rule).

## 4. Data handling

- Message payloads may contain frames/images: previews are downsampled; raw payload storage in browser is avoided (buffers in sidecar; size bounds in contracts).
- Credentials (terrain tokens, robot SSH if ever) live in the sidecar env/config with file perms 0600; never logged; error messages redact URLs/tokens.
- Logs: sidecar logs schemas and counts, not payload contents, by default (toggleable for debugging with a warning).

## 5. Supply chain

- npm/Python deps pinned + lockfiles; `npm audit`/`pip-audit` in CI; license inventory maintained in `library-evaluation.md` and extended at each dependency addition (so no EPL/GPL components silently land elsewhere than elk-js paths).
- Russian-nesting-doll risk tracked: foxglove-sdk is Rust-built Python (maturin) like PyRobo\* — fine, but version-lock and audit SBOMs on release builds.

## 6. Anti-patterns explicitly rejected (evidence: competitive analysis)

- ROSboard-style "auth is future work" web servers — reject.
- Foxglove-style cloud-first default for a tool whose data is inherently robot-local.
- "Visualization implies control" — never.
- Unauthenticated direct browser→PyTerrainMap access — reject.

## 7. Deployment checklist (first release)

- [ ] Sidecar binds localhost, origin allowlist, bearer token optional, TLS optional but documented
- [ ] No publish/command endpoints exist (grep-able negative test in CI)
- [ ] Sidecar rejects file paths from clients (fixture test)
- [ ] Browser CSP + no-inline-script enforced in build
- [ ] `pip-audit` / `npm audit` clean or triaged
- [ ] Documented threat model in this file kept updated at each phase gate

## 8. Vulnerability triage log (npm audit / pip-audit)

### 2026-11-01 — Phase 2/3 gate, `npm audit`: 11 findings (3 moderate, 8 high) — TRIAGED, no action

- **All 11 findings are transitive** and confined to the deck.gl dependency graph that ADR-0005 requires: `@deck.gl/geo-layers` → `@deck.gl/mesh-layers` → `@luma.gl/gltf` → `@loaders.gl/{gltf,textures,compression,zip}` → `texture-compressor`/`image-size`/`fflate`/`sha.js`. Findings categories: ZIP/ICNS parser infinite-loop DoS (malformed archives) in `fflate`, `image-size`, `texture-compressor`.
- **Exposure analysis:** PyRoboStudio never invokes the affected code paths. We render layers from explicit `h3-index` strings and region objects; we never load 3D tiles, glTF archives, texture archives, or ZIP bundles. No untrusted-network bytes reach those decoders in the studio.
- **Why we did not "fix":** `npm audit fix --force` would downgrade `@deck.gl/geo-layers` to 9.0.6 (breaking, contradicts ADR-0005 pinning), and none of the vulnerable symbols are in the executed dependency closure. Re-evaluate on each deck.gl upgrade; if a loaders.gl release drops `fflate` 0.7.x, take it immediately.
- Record kept per §2 "no silent skipping of `npm audit`".
