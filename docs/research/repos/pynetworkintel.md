# PyNetworkIntel — Integration Research

Research date: 2026-10-30  
Source: `/Users/georgimullassery/Desktop/Projects/PyNetworkIntel`  
Mode: read-only static audit. No build, install, test run, scan, or code modification.

## Bottom line

PyNetworkIntel is a Python network discovery and vulnerability-triage tool built around `nmap`, SSH configuration collection, rule/CVE checks, and graph export. It is not a robotics/ROS project, does not ship a web API or UI, and has no native PyRoboStudio adapter.

The safest integration path is **artifact-first**: consume already-produced scan JSON or topology node-link JSON/GraphML, normalize it in a PyRoboStudio adapter, and never expose PyNetworkIntel's active scanning, SSH, Nuclei, scheduler, or alerting paths to the application UI.

Important: the `scan` CLI path appears broken by a constructor mismatch, so do not rely on it without fixing or verifying it.

## What it does

- Discovers hosts/services with an `nmap -sV` wrapper and validates targets before subprocess use (`pynetworkintel/discovery/scanner.py:25`, `pynetworkintel/discovery/scanner.py:103`).
- Optionally grabs Linux configuration files over SSH using `paramiko` (`pynetworkintel/discovery/ssh_config.py:13`).
- Runs configuration rules and CVE checks; CVE lookups call the live NVD API with disk caching and optional offline mode (`pynetworkintel/analysis/cve.py:19`, `pynetworkintel/analysis/cve.py:91`).
- Optionally calls Anthropic for an LLM summary (`README.md:139`).
- Builds a heuristic subnet/gateway topology graph (`pynetworkintel/topology.py:86`).
- Exports topology as D3/vis node-link JSON or GraphML (`pynetworkintel/topology_export.py:37`, `pynetworkintel/topology_export.py:76`).
- Stores scan history, devices, services, findings, and changes in SQLAlchemy tables when the scheduler path is used (`pynetworkintel/db.py:24`, `pynetworkintel/scheduler.py:127`).
- Supports optional external Nuclei verification and NetBox CSV export (`pynetworkintel/discovery/nuclei.py:84`, `pynetworkintel/integrations/netbox.py:19`).
- Provides an MCP-style tool/handler layer over scan history; it is not a working MCP server (`pynetworkintel/_mcp_tools.py:39`, `pynetworkintel/_mcp_connector.py:844`).

It actively probes hosts. The README requires authorization via `--i-am-authorized`, `PYNETWORKINTEL_I_AM_AUTHORIZED=1`, or interactive confirmation (`README.md:10-14`).

## Stack, version, license

| Item | Finding | Evidence |
|---|---|---|
| Language | Python, package name `pynetworkintel` | `pyproject.toml:6` |
| Version | `1.9.0` | `pyproject.toml:7`, `pynetworkintel/__init__.py:3` |
| Python | `>=3.10` | `pyproject.toml:36` |
| License | Apache-2.0 | `pyproject.toml:10`, `LICENSE` |
| Status | Beta | `pyproject.toml:24`, `README.md:148` |
| Main deps | `paramiko`, `netaddr`, `pyyaml`, `requests`, `anthropic`, `rich`, `sqlalchemy`, `apscheduler` | `pyproject.toml:37-45` |
| CLI entry | `pynetworkintel = pynetworkintel.cli:main` | `pyproject.toml:87-88` |
| Shipped packages | Core plus discovery, analysis, cloud, kubernetes, iot, ml, devops, integrations | `pyproject.toml:98-107` |
| Excluded source | `enterprise` and `architect` are not in the wheel/sdist package list | `pyproject.toml:98-107`, `README.md:129-132` |

Documentation version drift is real: README says “Beta (v1.5.0)” (`README.md:148`), the changelog tops out at 1.8.0 (`CHANGELOG.md:12`), while code/metadata say 1.9.0. Internal docs cite 168/171 tests (`docs/internal/ROADMAP_HONEST.md:18`, `docs/internal/ROADMAP_HONEST.md:103`); the current test tree contains more test functions than that. Treat docs as hints, not authoritative interface contracts.

## Verified public interfaces

| Interface | What it provides | Evidence |
|---|---|---|
| `Scanner.scan(target, grab_configs=True)` | Active nmap scan, optional SSH config grab, returns `ScanResult` | `pynetworkintel/core.py:20-32`, `pynetworkintel/core.py:56` |
| `Analyzer.analyze(scan_result)` | Rule/CVE/LLM analysis of an existing `ScanResult` | `pynetworkintel/core.py:114` |
| `Pipeline.run(target, ...)` | Active scan + analysis + optional Nuclei, returns a JSON-friendly dict | `pynetworkintel/core.py:159-240` |
| `Device`, `Service`, `SecurityFinding`, `ScanResult` | Dataclasses with `to_dict()`; `ScanResult.topology()` and `.summary()` | `pynetworkintel/models.py:25-34`, `pynetworkintel/models.py:47-82`, `pynetworkintel/models.py:86-140` |
| `TopologyMapper.build(devices)` | Infers subnets and gateway nodes/edges | `pynetworkintel/topology.py:86` |
| `to_node_link_json(topology)` | D3/vis shape: nodes have `id`, edges are under `links` | `pynetworkintel/topology_export.py:37-68` |
| `to_graphml(topology)` | GraphML XML export | `pynetworkintel/topology_export.py:76` |
| `Database` / `NetworkIntelligence` | SQLAlchemy access and read-only analysis over populated scan history | `pynetworkintel/db.py:185`, `pynetworkintel/_mcp_connector.py:34` |
| CLI | `scan`, `analyze`, `collect`, `dashboard` subcommands | `pynetworkintel/cli.py:91-258` |

Useful callable examples exist in the README, including `ScanResult.topology().to_dict()` and JSON output (`README.md:193`, `README.md:213-217`).

## Data model for visualization

- `Device`: `ip`, `hostname`, `os`, `device_type` (default `linux`), `services`, `configs`, `last_seen`, `is_online` (`pynetworkintel/models.py:47-66`).
- `Service`: `port`, `name`, `version`, `protocol`, `state` (`pynetworkintel/models.py:25-30`).
- `ConfigFile`: `path`, `content`, `device_type` (`pynetworkintel/models.py:37-40`).
- `SecurityFinding`: device, type, severity, title, description, evidence, recommendation, impact, CVE/CVSS fields, timestamp (`pynetworkintel/models.py:86-106`).
- `ScanResult`: devices, findings, scan time/duration; `to_dict()` embeds `topology` (`pynetworkintel/models.py:109-130`).
- `NetworkTopology`: nodes, edges, subnets; nodes are `ip`, `hostname`, `node_type` (`device` or `gateway`), `subnet`; edges are `source`, `target`, `relationship` (`pynetworkintel/topology.py:40-79`).
- Node-link export adds `id = ip` for D3/vis consumers; links use `source`, `target`, `relationship` (`pynetworkintel/topology_export.py:37-68`).
- Identity is IP/hostname plus database integer IDs. There is no stable device UUID, robot ID, ROS frame, fleet/robot concept, coordinates, link bandwidth, latency, or per-link telemetry.
- Topology is inferred by grouping addresses into /24 (IPv4) or /64 (IPv6) and adding heuristic gateway edges (`pynetworkintel/topology.py:1-27`, `pynetworkintel/topology.py:86`). It is not traceroute-, LLDP-, ARP-table-, or VLAN-derived.
- SQLAlchemy duplicates the model in scan-scoped tables: `ScanSession`, `Device`, `Service`, `DeviceConfig`, `Finding`, `DeviceChange`, `VulnerabilityChange`, `Alert` (`pynetworkintel/db.py:24-183`). `Device` is keyed by DB ID and scoped by `scan_id`, not a global asset identity (`pynetworkintel/db.py:44-63`).

For PyRoboStudio, expect an adapter that maps IP/hostname to the app's asset or robot identity. Do not assume the graph nodes are robots or that edge relationships mean physical links.

## How PyRoboStudio can consume it safely

### Preferred: offline artifact adapter

1. Obtain a trusted scan artifact upstream, outside PyRoboStudio, from an authorized operator.
2. Accept either:
   - `ScanResult.to_dict()`/`Pipeline.run()` JSON: `devices`, `findings`, `summary`, `topology` (`pynetworkintel/models.py:115-130`, `pynetworkintel/core.py:221-229`).
   - D3/vis node-link JSON: `{nodes: [{id, hostname, node_type, subnet}], links: [{source, target, relationship}]}` (`pynetworkintel/topology_export.py:37-68`).
   - GraphML for graph viewers (`pynetworkintel/topology_export.py:76`).
3. Normalize in a PyRoboStudio-owned adapter. Preserve `ip`/`id`, `hostname`, `node_type`, `subnet`, and link `relationship`; add your own stable asset IDs and layout.
4. Parse the artifact without invoking scanners or subprocesses. If you want to avoid importing PyNetworkIntel's full dependency tree, parse the JSON directly with the standard library.

### Library-assisted transformation, still read-only

- Rehydrate a graph with `NetworkTopology.from_dict(...)`, then call `to_node_link_json()` (`pynetworkintel/topology.py:73`, `pynetworkintel/topology_export.py:37`).
- Build `Device`/`Service` objects from trusted inventory records, then call `TopologyMapper().build(devices)` (`pynetworkintel/topology.py:86`).
- Caveat: `Device`, `Service`, `SecurityFinding`, and `ScanResult` have `to_dict()` but no `from_dict()`; PyRoboStudio must supply deserialization (verified by absence of `from_dict` except on `NetworkTopology`, `pynetworkintel/topology.py:73`).

### Database snapshot, optional

- If a SQLite database was populated by `MonitoringScheduler`, it can be opened read-only with SQLAlchemy (`pynetworkintel/db.py:185`, `pynetworkintel/scheduler.py:127`).
- The CLI `scan` and `analyze` commands do **not** save scan results. There is no public result-ingestion API; `_save_scan_results` is private (`pynetworkintel/scheduler.py:127`).
- Do not let PyRoboStudio write to a production scan DB. Use a copied/snapshot DB if needed.

### Do not do

- Do not call `Scanner.scan()` or `Pipeline.run()` from a web request or UI action: both actively probe the network and can invoke SSH/Nuclei.
- Do not shell out to `pynetworkintel scan`: the CLI call is currently inconsistent with `Scanner.__init__` (see Risks).
- Do not expose SSH passwords/keys, nmap arguments, target input, Nuclei, alert webhooks, or scheduler controls.
- Do not import unshipped `enterprise`/`architect` modules as a stable API; they are explicitly unsupported (`pynetworkintel/enterprise/__init__.py:1-14`).

## Web/UI/server component?

**No shipped web UI, HTTP REST API, or WebSocket API was found.**

- `dashboard.py` is a terminal/Rich stats dashboard, not a browser UI (`pynetworkintel/dashboard.py:1`). It communicates over a local Unix socket or Windows named pipe (`pynetworkintel/dashboard.py:80`, `pynetworkintel/dashboard.py:161`).
- `pynetworkintel.toml` declares MCP on port `8773` with `require_auth = false` (`pynetworkintel.toml:1-21`), but the connector explicitly raises `NotImplementedError` for an MCP gateway/server (`pynetworkintel/_mcp_connector.py:844-856`).
- `enterprise/api.py` defines a `RESTAPIServer`, but its `start()` only logs and returns; a comment says to use FastAPI/Flask/aiohttp in production (`pynetworkintel/enterprise/api.py:59-65`). The entire `enterprise` package is excluded from distributed packages (`pynetworkintel/enterprise/__init__.py:1-14`, `pyproject.toml:98-107`).
- No FastAPI/Flask/Django/uvicorn/aiohttp web application or frontend was found in the shipped package.

Therefore PyRoboStudio must own the UI and HTTP/WS layer. PyNetworkIntel can be a data producer, not a service endpoint.

## Security-sensitive operations not to expose

| Area | Why it matters | Evidence |
|---|---|---|
| Active nmap/ARP scanning | Sends probes; legal/authorization risk; can disrupt networks | `pynetworkintel/discovery/scanner.py:56-121`, `README.md:10-14` |
| SSH config grabbing | Uses credentials and runs remote commands; SSH host keys use `WarningPolicy` (accepts unknown keys with a warning) | `pynetworkintel/discovery/ssh_config.py:13-71`, `pynetworkintel/discovery/ssh_config.py:112-120` |
| Nuclei verification | Active HTTP verification via separate external binary | `pynetworkintel/discovery/nuclei.py:146-182` |
| NVD lookups | Outbound network requests reveal service/version data to NVD | `pynetworkintel/analysis/cve.py:19`, `pynetworkintel/analysis/cve.py:150` |
| Anthropic summaries | Sends findings/context to Anthropic; requires API key | `README.md:139`, `pyproject.toml:42` |
| Alerts | Slack/email/generic webhook egress | `pynetworkintel/alerts.py:23-160` |
| Scheduler | Recurring active scans in the background | `pynetworkintel/scheduler.py:29`, `pynetworkintel/scheduler.py:286-293` |
| Docker profile | Host networking and read-only `~/.ssh` mount | `docker-compose.yml:7-15` |
| MCP defaults | Declared with authentication disabled | `pynetworkintel.toml:21` |
| Enterprise auth | Explicitly unaudited/unsupported | `pynetworkintel/enterprise/__init__.py:1-14` |

If PyRoboStudio needs only visualization, the read-only artifact path avoids all of the above except parsing potentially sensitive device data.

## Tests and examples

- 22 files under `tests/`, with fixtures including a hand-built nmap XML file (`tests/test_scanner.py:1-6`, `tests/fixtures/nmap_scan_sample.xml`).
- Unit coverage is largely mocked/hermetic: nmap XML parsing, mocked `requests.get` for NVD (`tests/test_cve.py:1-5`), mocked Paramiko for SSH config (`tests/test_security.py`), fake Nuclei executable (`tests/test_nuclei_adapter.py:1-2`), in-memory SQLite for MCP history (`tests/test_mcp.py:89-92`), and topology/export tests.
- Examples use mock devices rather than live scans (`examples/phase1_2_demo.py`, `examples/dashboard_demo.py`).
- Most tests should run on macOS without hardware or nmap installed.

Caveat: `tests/test_integration.py:8-29` instantiates `Analyzer()` with versioned services and does not patch HTTP, so a full suite run may attempt live NVD queries unless offline/cache settings prevent it. I did not run the suite in this audit, so test counts and pass status are not asserted.

## Risks and unknowns

1. **CLI `scan` is broken (high confidence, static).** `handle_scan` passes `nuclei_path` and `nuclei_severity` to `Scanner(...)` (`pynetworkintel/cli.py:381-390`), but `Scanner.__init__` accepts neither and has no `**kwargs` (`pynetworkintel/core.py:20-32`). Every `pynetworkintel scan ...` invocation should fail with `TypeError: Scanner.__init__() got an unexpected keyword argument 'nuclei_path'`. Do not depend on the scan CLI until fixed/tested.
2. **SARIF CLI is inconsistent.** `scan --output sarif` is accepted by argparse but has no scan output branch; `analyze -o sarif` has a branch, yet the analyze parser does not list `sarif` as a choice (`pynetworkintel/cli.py:125`, `pynetworkintel/cli.py:211`, `pynetworkintel/cli.py:524`). README claims `analyze ... -o sarif` works (`README.md:133`).
3. **No persistence from CLI.** CLI scan/analyze do not write to the database; only the scheduler’s private path does (`pynetworkintel/scheduler.py:105-127`). A DB-backed consumer may see stale/empty data.
4. **Topology is heuristic.** /24-/64 grouping and a gateway heuristic; no physical connectivity, VLANs, LLDP, traceroute, or confidence scores (`pynetworkintel/topology.py:1-27`).
5. **No stable asset identity.** IPs/hostnames and scan-scoped DB IDs only; repeated scans do not provide a durable robot/asset UUID (`pynetworkintel/models.py:47`, `pynetworkintel/db.py:44-63`).
6. **Docs/version drift.** README 1.5.0, changelog 1.8.0, metadata 1.9.0 (`README.md:148`, `CHANGELOG.md:12`, `pyproject.toml:7`).
7. **Test hermeticity caveat.** Some integration tests may reach NVD; tests were not executed here.
8. **Optional modules not fully audited.** Cloud/Kubernetes/IoT/ML/DevOps modules exist and ship, but this audit focused on the core scan/analysis/topology path.

## Unverified / not present

Not verified or not present in this audit:

- No runtime execution of tests, CLI, scanner, pipeline, or dashboard.
- No build/install or wheel content inspection; package exclusion statements come from `pyproject.toml`.
- No live nmap, SSH, NVD, Anthropic, Nuclei, NetBox, Docker, MCP, or web-server exercise.
- No HTTP/REST/WS server, web frontend, or native MCP gateway in shipped code.
- No ROS/ROS 2, robot, URDF, TF, DDS, fleet-management, or robotics-specific concepts in the core code. “Fleet” appears only as generic IoT/ML/cloud wording, not ROS fleet management.
- No native PyRoboStudio schema, adapter, ingestion endpoint, or stable external data contract beyond the Python dataclasses and export formats.
- No guaranteed offline/normal-macOS test run.
- No bundled real scan dataset; examples use mock devices.
- No assertion about PyPI content or current upstream repository state.

## Evidence index

Key files reviewed:

- `README.md:1-14`, `README.md:129-148`, `README.md:193-235`
- `pyproject.toml:6-10`, `pyproject.toml:36-45`, `pyproject.toml:87-107`
- `pynetworkintel/__init__.py:3`
- `pynetworkintel/core.py:20-56`, `pynetworkintel/core.py:114`, `pynetworkintel/core.py:159-240`
- `pynetworkintel/cli.py:125`, `pynetworkintel/cli.py:211`, `pynetworkintel/cli.py:362-390`, `pynetworkintel/cli.py:445`, `pynetworkintel/cli.py:524`
- `pynetworkintel/models.py:25-140`
- `pynetworkintel/topology.py:40-79`, `pynetworkintel/topology.py:86`
- `pynetworkintel/topology_export.py:37-76`, `pynetworkintel/topology_export.py:164`
- `pynetworkintel/db.py:24-63`, `pynetworkintel/db.py:185`
- `pynetworkintel/scheduler.py:29`, `pynetworkintel/scheduler.py:105-127`
- `pynetworkintel/discovery/scanner.py:25-121`
- `pynetworkintel/discovery/ssh_config.py:13-71`, `pynetworkintel/discovery/ssh_config.py:112-120`
- `pynetworkintel/discovery/nuclei.py:84-182`
- `pynetworkintel/analysis/cve.py:19`, `pynetworkintel/analysis/cve.py:91-150`
- `pynetworkintel/dashboard.py:1`, `pynetworkintel/dashboard.py:80`, `pynetworkintel/dashboard.py:161`
- `pynetworkintel/_mcp_connector.py:34`, `pynetworkintel/_mcp_connector.py:844-856`
- `pynetworkintel/_mcp_tools.py:39`
- `pynetworkintel/enterprise/__init__.py:1-14`, `pynetworkintel/enterprise/api.py:21-65`
- `pynetworkintel.toml:1-21`
- `docker-compose.yml:7-15`
- `CHANGELOG.md:12`
- `docs/internal/ROADMAP_HONEST.md:18-27`, `docs/internal/ROADMAP_HONEST.md:103`
- `tests/test_scanner.py:1-6`, `tests/test_cve.py:1-5`, `tests/test_nuclei_adapter.py:1-2`, `tests/test_mcp.py:89-92`, `tests/test_integration.py:8-29`
