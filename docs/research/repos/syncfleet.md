# SyncFleet: Integration Research for PyRoboStudio

**Repository:** `/Users/georgimullassery/Desktop/Projects/SyncFleet`  
**Audited revision:** `f4d64a60286ff14123ea85d6676e022982d34509` (2026-10-28)  
**Audit type:** source/documentation review only. No build, install, test run, or repository modification was performed.

## 1. Bottom line

SyncFleet is a generic, local-first operation-journal synchronizer with a Rust core and a custom peer-to-peer TLS protocol. It is **not** a fleet-management or robotics backend: it has no fleet, robot, telemetry, mission, or device-state schema, no HTTP/WebSocket API, no web UI, and no Python data API.

For PyRoboStudio, SyncFleet could serve as a transport/persistence substrate for robot-local state, but it cannot be visualized or consumed directly by a browser. Integration requires a backend adapter that either reads SyncFleet's SQLite database as an internal artifact, invokes its CLI, or links the Rust library. All three options carry coupling risk because the project is pre-1.0 and the database schema is not a declared public API.

**Recommendation:** treat SyncFleet as a research candidate, not a drop-in component. If evaluated further, build a small adapter around a read-only SQLite snapshot or CLI subprocess boundary, and keep PyRoboStudio's own domain model independent of SyncFleet's journal schema.

## 2. Product and maturity

- Rust package `syncfleet` version `0.7.0`, edition 2021, MSRV 1.89, MIT licensed (`Cargo.toml:1-9`).
- Described as a "secure, local-first, peer-to-peer edge database synchronization engine" (`Cargo.toml:6`; `README.md:5`).
- Project status is explicitly **alpha**; APIs and configuration may change (`docs/STATUS.md:3`, `:35`).
- Core functionality demonstrated by source/tests: node identity, dataset registration, local operations, mTLS peering, certificate pinning, incremental pull/push, conflict policies, compaction, discovery, daemon mode, and a thin Python launcher.
- Not a general distributed SQL database, message broker, backup tool, or Byzantine-consensus system (`docs/STATUS.md:37-42`).
- The name "SyncFleet" does not imply fleet/robotics semantics. No domain concepts beyond datasets, entities, peers, and operations were found.

## 3. Architecture and stack

- **Core:** Rust, Tokio, SQLx/SQLite, Clap CLI, rustls, Ed25519/X25519, AES-GCM/PBKDF2 (`Cargo.toml:13-80`).
- **Storage:** one SQLite database per node at `<data_dir>/syncfleet.db`; WAL mode and migration support (`src/storage/mod.rs:42`, `:54-80`; `migrations/001_initial.sql`–`003_peering.sql`).
- **Transport:** custom length-prefixed JSON messages over mutual-TLS TCP, not HTTP. Protocol version is `1` (`src/net/mod.rs:17`, `:20-35`, `:275-304`).
- **Default listener:** `0.0.0.0:8443` (`src/config/mod.rs:54-75`).
- **Discovery:** optional mDNS service `_syncfleet._tcp`, enabled by default at compile time. It advertises this node; discovered peers are passed to the sync loop only after a local authorization check (`Cargo.toml:62-80`; `src/discovery/mod.rs:19-23`, `:69-100`; `src/cli/mod.rs:1463-1500`).
- **State model:** append-only operation journal plus per-origin checkpoints. There is no materialized application table or event projection.
- **Client model:** CLI commands operate locally; daemon mode serves peer synchronization and runs background sync tasks. The Python package simply executes the native binary.

## 4. Public interfaces

### 4.1 CLI

Global options: `-c/--config <path>` and `-l/--log-level <level>` (`src/cli/mod.rs:22-30`).

Subcommands (`src/cli/mod.rs:32-63`):

| Command | Operations and important options |
|---|---|
| `init` | `--node`, `--data-dir`, `--passphrase`, `--force` (`:65-125`) |
| `status` | `--format <text|json>`, `--verbose` (`:127-150`; `:549-604`) |
| `config` | `validate`, `show`, `example` (`:152-166`; `:606-620`) |
| `dataset` | `list`; `register --name --tables --policy --schema-version --force`; `show <id>`; `remove <id>`; `schema <id> <version>`; `apply --dataset --entity --op --data` (`:168-332`) |
| `peer` | `list`; `pair`; `token`; `redeem`; `export-cert`; `import-cert`; `certs`; `show`; `revoke`; `retire` and `reissue` stubs (`:334-505`; stubs at `:987-1001`) |
| `sync` | `status [dataset_id]`; `now --dataset-id --peer --addr` (`:507-547`) |
| `conflicts` | `list`; `show <id>`; `resolve <id> <resolution>` (`:622-673`) |
| `journal` | `stats`; `compact --retention-days --dry-run` (`:675-762`) |
| `daemon` | `start [--background]`; `stop`; `restart` (`:764-840`; implementation `:1261-1613`) |
| `doctor` | `--full`, `--format <text|json>`, `--repair` (`:842-859`) |

`status --format json` exposes only node identity plus dataset/peer/conflict counts; it does not expose journal contents (`src/cli/mod.rs:565-576`). `doctor --format json` returns diagnostic check records (`src/cli/mod.rs:1732-1739`). `sync status` is the only command that surfaces per-origin checkpoints.

### 4.2 Python package

- Package `syncfleet` requires Python >= 3.8 and has no Python dependencies (`pyproject.toml:5-26`).
- Exports only `__version__`, `binary_name`, `find_binary`, and `main` (`python/syncfleet/__init__.py:9-13`).
- The wrapper locates a native executable and forwards arguments/stdio; on POSIX it `execve`s the binary (`python/syncfleet/cli.py:1-18`, `:59-136`).
- Binary resolution order: `SYNCFLEET_BIN`, packaged `syncfleet/bin/syncfleet`, then `PATH` (`python/syncfleet/cli.py:11-17`, `:66-99`).
- Console entry point: `syncfleet = syncfleet.cli:main` (`pyproject.toml:34-35`).
- There is **no** Python API for datasets, operations, peers, or sync state. Importing the package does not open a database or expose data classes.

### 4.3 Configuration

TOML sections: `node`, `network`, `discovery`, `storage`, `replication`, `security`, `metrics`, `daemon`, plus static `peers` (`config/syncfleet.example.toml:1-68`; `src/config/mod.rs:225-238`). Default config paths include `~/.config/syncfleet/config.toml` and `/etc/syncfleet/config.toml` (`config/syncfleet.example.toml:3-6`).

Environment overrides use prefix `SYNCFLEET_` and double-underscore nesting, for example `SYNCFLEET_NODE__DATA_DIR` or `SYNCFLEET_NETWORK__LISTEN_ADDR` (`config/syncfleet.example.toml:8-9`; exercised in `tests/cli.rs:1-12`).

The `[metrics]` section describes an HTTP `/metrics` endpoint, but no metrics exporter or HTTP server was found in source. Likewise, `[daemon] user` and `group` fields exist but are not used (`src/config/mod.rs:192-211`; no source references outside the struct/grep). These settings should not be treated as implemented behavior.

### 4.4 Network protocol

The daemon accepts TLS connections and exchanges:

1. `Hello { node_id, node_name, protocol_version }`
2. `HelloReply { node_id, node_name, protocol_version, datasets }`
3. Per-dataset `Have` → `Ops` → `Ack` batches, ending with `Done`.

Evidence: `src/net/mod.rs:17-35`, `:275-304`; `src/replication/mod.rs:58-83`.

Peer identity is the certificate SAN `node_<node_id>`; the node ID itself is the first 16 bytes of SHA-256(Ed25519 public key), hex encoded (32 hex characters) (`src/identity/mod.rs:69-74`; `src/tls/cert.rs:45-67`). Certificates are pinned; peer authorization is checked before serving a dataset (`src/net/mod.rs:342-346`, `:401-405`).

There is no HTTP REST, GraphQL, WebSocket, SSE, or gRPC surface. The only server is the TLS sync listener.

## 5. Data model

Canonical tables (`migrations/001_initial.sql:13-85`; `002_phase2.sql`; `003_peering.sql`):

- `datasets`: `dataset_id`, `schema_version`, `conflict_policy`, `table_allowlist`, `created_at`.
- `operation_journal`: `id`, `dataset_id`, `entity_id`, `origin_node_id`, `origin_seq`, `op_type`, `schema_version`, `payload` (BLOB), `causal_metadata` (JSON), `created_at`, `checksum`.
- `applied_operations`: deduplication by operation ID.
- `replication_checkpoints`: `(peer_id, dataset_id)`, `last_acked_seq`, `last_applied_seq`, `updated_at`.
- `peer_authorizations`: peer ID, dataset ID, permission bitmask, validity/revocation fields.
- `conflicts`: local/remote operation IDs, entity, reason, resolution, timestamps.

Important semantics and limitations:

- `dataset_id` and `entity_id` are application-defined strings. There is no table/row mapping, robot ID convention, or schema validation of `payload` beyond storage.
- `table_allowlist` is recorded and displayed but is not used to materialize or filter operations into application tables. Remote application writes only journal/dedup/checkpoint/conflict metadata (`src/storage/mod.rs:418-650`; allowlist handling `:975-1042`). Applications must replay operations themselves.
- Operation `payload` is an opaque BLOB at the storage layer; the CLI's `dataset apply --data` accepts a JSON object, but consumers must know each dataset's schema.
- Per-operation `causal_metadata` is a version vector, but locally created operations store only `{origin_node_id: 1}` rather than accumulated history (`src/storage/mod.rs:269-292`). Conflict detection is therefore a coarse concurrency check, not full causal history.
- `last_acked_seq` is initialized to `0` and no production code path was found that advances it. `update_checkpoint` appears only in tests. This affects status fidelity and compaction safety (`src/storage/mod.rs:432-471`; `plan_compaction` `:713-765`).
- Compaction correctness is not established. Checkpoints are written under the operation's `origin_node_id` (`src/storage/mod.rs:463`, `:583`, `:645`), but `plan_compaction` treats `(peer, dataset)` rows as coverage acknowledgments from that peer, skipping the origin itself. The data keyed by a peer therefore represents operations originating at that peer, not that peer's acknowledgment of another origin's operations. The code comment claims all active peers must acknowledge past an entry; this should be tested before relying on multi-hop relay or reclamation (`src/storage/mod.rs:709-765`).
- All persistent timestamps are UTC RFC3339 (`chrono::Utc`). Conflict resolution uses operation timestamps and policies such as `last_write_wins`; there is no clock synchronization, monotonic global order, or HLC (`docs/KNOWN_ISSUES.md:78-82`; `src/storage/mod.rs` conflict logic around `:624-650`).
- Peer authorization bits are read=1 and write=2 (`src/replication/mod.rs:53-56`). No separate admin bit is enforced.

### Mapping implications for PyRoboStudio

If SyncFleet were used, PyRoboStudio would need to define a dataset per logical domain (for example `robot_state`), use `entity_id` as the robot/component key, and encode all domain fields in `payload`. It would then need its own reducer/materializer to turn the operation journal into current robot/fleet state. SyncFleet does not provide the reducer, queries, or domain constraints.

## 6. Existing fleet/robot/visualization capability

**None found.**

- No fleet, robot, device, telemetry, mission, pose, battery, or sensor tables in migrations.
- No current-state snapshot API. `sync status` reports dataset/peer counts; `sync now` reports pulled/pushed totals.
- No browser-consumable API.
- No UI package or frontend assets.
- No server-side query/filter/pagination API.
- No Python data model or ORM.
- No real-time telemetry stream; synchronization is periodic/invoked operation exchange, not a pub/sub feed.

Therefore, a PyRoboStudio visualization would need to be built above an adapter; nothing in SyncFleet can be pointed at by a browser.

## 7. Security and daemon management

Positive controls:

- Mutual TLS with certificate pinning; peer identity is bound to certificate SAN (`src/net/mod.rs:342-346`, `:401-405`).
- Per-dataset read/write authorization checks on replication (`src/replication/mod.rs:32-34`, `:53-56`).
- Private key files are written with mode `0600` (`src/tls/cert.rs:198-239`; `src/identity/mod.rs:132-150`).
- Identity private keys can be encrypted with PBKDF2-HMAC-SHA256 at 600,000 iterations (`src/identity/mod.rs:20-22`, `:76-97`).

Risks / audit concerns:

- **PID file trust:** `stop` reads a plain PID file, checks only `kill(pid, 0)`, then sends SIGTERM. It does not verify process ownership, executable name, start time, or PID-file ownership. A forged or stale PID file can target an unrelated process; PID reuse is possible (`src/cli/mod.rs:1261-1272`, `:1361-1404`).
- **No PID-file lock:** start checks liveness then writes the file; two starts can race, and the file is not created with restrictive permissions (`src/cli/mod.rs:1280-1286`, `:1433-1446`).
- **Background startup:** `start --background` uses `setsid`, redirects output to a log, and waits 500 ms for a PID file; it does not verify that the child is healthy or still running (`src/cli/mod.rs:1302-1352`).
- **No privilege dropping:** daemon config has `user`/`group`, but no code applies them; running the daemon as root would preserve root privileges (`src/config/mod.rs:192-211`; no source use found).
- **Default network exposure:** default bind is all interfaces on port 8443; mTLS limits access, but firewall/interface policy is outside the app (`src/config/mod.rs:54-75`).
- **Enrollment token single-use gap:** token hashes are stored on the issuer, and `storage::enrollment::claim` exists, but no production caller was found; the redeem path does not enforce single-use on the issuer (`src/storage/mod.rs:1330-1400`; `src/cli/mod.rs:809-864`). The token is signed and expiring, but replay to multiple nodes may still work.
- **Local database/trust boundary:** SQLite access is filesystem-trusted; no local authentication or encryption of payload data was found.
- **Revocation is local-only:** known issue DEF-003 (`docs/KNOWN_ISSUES.md:72-76`).

## 8. Integration options

| Option | Fit | Risks / constraints |
|---|---|---|
| Spawn CLI from a PyRoboStudio backend | Simplest for admin/status; wrapper already proves subprocess pattern | Text/JSON output is limited; no operation stream; process lifecycle overhead; CLI can mutate data |
| Read `syncfleet.db` read-only | Gives access to full journal/state for visualization | Schema is internal and pre-1.0; WAL/read concurrency; no read-only API contract; DB must be local |
| Link Rust crate as path/git dependency | Best long-term for typed access and custom projection | No Python binding; adds Rust build/toolchain to deployment; no published crate usage found; must own schema mapping |
| Implement the TLS protocol in another service | Full peer participation | High effort: mTLS, certificate pinning, JSON framing, protocol versioning, authorization, sync loop |
| Use the Python package as-is for data access | Not possible | It only executes the native CLI; no data API |

Practical path: a server-side adapter owned by PyRoboStudio should expose HTTP/WebSocket to the UI, read SyncFleet's journal through a narrow Rust or read-only SQLite integration, and materialize robot state itself. Do not expose SyncFleet's raw SQLite file or TLS listener to browser clients.

## 9. Tests, examples, and documentation

### Tests

- Integration suites: `tests/cli.rs`, `tests/identity.rs`, `tests/net.rs`, `tests/replication.rs`, `tests/storage.rs`, `tests/tls.rs`.
- Tests use temporary directories and loopback addresses (`tests/net.rs:66`, `tests/replication.rs:64`, `tests/storage.rs:14`).
- CLI tests use `assert_cmd` and temp dirs, exercising command behavior including env overrides (`tests/cli.rs:1-40`, `:290-310`).
- Python tests exercise binary discovery and wrapper exec behavior (`python/tests/test_wrapper.py`).
- No hardware, serial port, robotics driver, or external service is required by the test suite.
- CI runs Rust format, Clippy, workspace tests, doc tests, audit/deny on **Ubuntu** only (`.github/workflows/ci.yml:13-70`). There is no macOS Rust CI job.
- Python wheel workflow builds Ubuntu, macOS Intel, macOS ARM, and Windows wheels (`.github/workflows/pypi.yml:40-72`), but that is packaging, not runtime verification.

**No test or build was executed during this audit.** The suite appears structurally runnable on macOS (Unix APIs, loopback sockets, temp dirs), but macOS execution and actual pass status remain unverified.

### Examples / fixtures

- Configuration example exists: `config/syncfleet.example.toml`.
- No `examples/` directory or robotics sample application was found.
- Test helpers create certificate/database fixtures inline; there is no reusable public fixture package.

### Documentation consistency

- `README.md` and `docs/KNOWN_ISSUES.md` contain stale claims that conflict with implementation. For example, README says daemon stop/restart is unavailable (`README.md:252-256`) while the CLI implements it (`src/cli/mod.rs:1361-1613`; `docs/STATUS.md:32`).
- `docs/KNOWN_ISSUES.md:28-32` claims metrics are exposed at `/metrics`; no metrics server was found.
- `docs/KNOWN_ISSUES.md:7` claims disk-backed spooling as implemented; the spool module was not found in a production call path.
- `docs/STATUS.md:10-21` claims single-use enrollment tokens and per-peer authorization as working; single-use redemption enforcement is questionable (see section 7).

## 10. Risks and open questions

1. **Schema coupling:** journal/schema is internal; alpha status means migration churn. Any direct DB read is an unsupported integration.
2. **No projection layer:** visualization must replay operations and define domain semantics; this is substantial application work.
3. **No HTTP/UI surface:** a new adapter/service is mandatory.
4. **Clock semantics:** LWW/conflicts rely on wall clocks and per-origin operation timestamps; skewed robot clocks can produce surprising winners.
5. **Causal metadata is minimal:** local operations carry only their origin's increment, so "concurrent" detection is coarse.
6. **Checkpoint/compaction uncertainty:** `last_acked_seq` not advancing and origin-skip protection may lead to incorrect compaction/relay behavior; needs dedicated tests before multi-hop use.
7. **Daemon control security:** untrusted PID file can signal an unrelated process; no process identity verification or privilege dropping.
8. **Enrollment replay:** single-use claim path appears unwired.
9. **Stale docs:** do not use documentation claims as implementation evidence without checking source.
10. **Distribution:** status says PyPI currently publishes only a macOS universal2 wheel; Linux/Windows require building the CLI (`docs/STATUS.md:27`).

## 11. Unverified / not present

### Not found in source

- HTTP/REST/GraphQL/WebSocket/gRPC server or API.
- Web UI, dashboard, frontend assets, or visualization code.
- Fleet/robot/device/telemetry/mission schema or domain model.
- Materialized current-state tables, snapshot export/import, or query API.
- Python data API, ORM models, or native Python bindings.
- Prometheus `/metrics` HTTP exporter despite `[metrics]` config and dependencies.
- Implemented snapshot bootstrap despite `snapshot_bootstrap_enabled` config; known open issue DEF-002 (`docs/KNOWN_ISSUES.md:66-70`).
- Automatic schema migration; manual dataset schema handling is required (`docs/STATUS.md:33`).
- Relay/NAT traversal (`docs/STATUS.md:34`).
- GUI/admin UI.

### Unverified by execution

- Whether all tests pass on macOS, Linux, or Windows at this commit.
- Real multi-machine mTLS pairing and mDNS discovery behavior.
- Actual PyPI publication status/version availability (no network check performed).
- Runtime behavior under clock skew, high concurrency, or large journals.
- Whether compaction/relay concerns manifest in practice; source inspection only.
- Security posture of a production deployment, including filesystem permissions, firewall exposure, and service supervision.

## 12. Suggested next research steps

1. Build a disposable fixture node outside SyncFleet and create two datasets/entities with representative robot-state payloads.
2. Run the existing test suite on macOS (with explicit approval, since this audit was research-only) and record exact results.
3. Prototype a read-only adapter that replays `operation_journal` into a robot-state projection and exposes a minimal HTTP/WS endpoint.
4. Test multi-hop relay plus compaction to confirm whether acknowledged operations are retained for all peers.
5. Verify enrollment-token replay and daemon PID-file attacks in an isolated environment.
6. Decide whether to depend on SyncFleet at all, or use its design as a reference for a PyRoboStudio-owned sync layer.

## Primary evidence map

- Product/version/license: `Cargo.toml:1-9`; `python/syncfleet/__init__.py:9-13`; `pyproject.toml:5-26`.
- CLI surface: `src/cli/mod.rs:15-63`, `:65-859`.
- Daemon/PID: `src/cli/mod.rs:1261-1613`.
- Config defaults/env: `src/config/mod.rs:192-238`, `:284-319`; `config/syncfleet.example.toml:1-68`.
- Data model: `migrations/001_initial.sql:13-85`, `002_phase2.sql`, `003_peering.sql`; `src/storage/mod.rs:418-650`, `:713-765`, `:975-1072`.
- Network/protocol: `src/net/mod.rs:17-35`, `:275-346`, `:401-405`; `src/replication/mod.rs:1-110`.
- Identity/TLS: `src/identity/mod.rs:20-97`, `:132-150`; `src/tls/cert.rs:40-67`, `:198-239`.
- Python wrapper: `python/syncfleet/cli.py:1-136`; `pyproject.toml:34-50`.
- Tests/CI: `tests/*.rs`; `python/tests/test_wrapper.py`; `.github/workflows/ci.yml:13-70`; `.github/workflows/pypi.yml:40-72`.
- Stale/conflicting docs: `README.md:252-256`; `docs/KNOWN_ISSUES.md:7`, `:28-32`, `:66-82`; `docs/STATUS.md:3-35`.
