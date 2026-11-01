# ADR-0006: Read-only first release; no publishing or control path from the studio

**Status:** Accepted · **Date:** 2026-10-31

## Context
Master prompt §6: treat browser-to-robot control as a separate security-sensitive capability; §11: no unrestricted ROS publishing through the plugin API. Evidence base: PyTerrainMap audit showed unsafe API defaults; SyncFleet is explicitly not internet-hardened; ROSboard's unauthenticated pattern rejected in the competitive analysis. The foxglove-sdk protocol supports `ClientPublish`, but capabilities are opt-in server-side.

## Decision
- v1 ships no publish, command, parameter-write, or robot-control path. The sidecar does not enable `ClientPublish`. A grep-able negative test asserts this (Security Model §7).
- Plugins cannot declare privileged backend access as part of their SDK contract.
- If control is ever added, it will be its own ADR with an explicit authn/authz/auditing design and product-level consent flow, not an incremental capability.

## Consequences
- Replay/analysis ceilings: some workflows need param tuning — those revert to CLI/ROS-native tools, which remain independently usable (ecosystem principle).
- The mission-timeline differentiator is unaffected (it is a read/join problem).
