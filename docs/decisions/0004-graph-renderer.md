# ADR-0004: Graph rendering — @xyflow/react primary, graphology data model, elkjs/dagre layouts; sigma v4 as scale escape hatch

**Status:** Accepted · **Date:** 2026-10-31

## Context
Two graph surfaces: ROS computation graph (typically tens–hundreds of nodes; needs QoS/activity badges, namespace grouping ✓subflows, search/highlight) and PyNetworkIntel topology (distinct semantics, potentially larger). Master prompt §8.7 requires shared infrastructure but distinct data models.

Verified facts (2026-10-31): React Flow v12 is MIT (the "license changed" rumor is false); sigma v4 has WebGL2 + SDF edge labels but no compound/grouping nodes; cytoscape has compound nodes but Canvas rendering with no official React wrapper; `deck.gl-community/graph-layers` is officially "semi-maintained"; gephi-lite is a GPL app, not a library.

## Decision
1. Data model lives in **graphology**; renderers consume from it. ROS graph and network graph stay distinct typed models.
2. ROS Graph Explorer renders with **@xyflow/react 12.x**: DOM/SVG gives best-in-class edge badges and cheap selection/search affordances; namespace grouping maps onto built-in subflow nodes. Hierarchical layouts via **elkjs** (EPL-2.0/GPL dual — verify distribution mode before bundling) or MIT `@dagrejs/dagre` as the zero-license-risk option; force mode via graphology/d3-force.
3. If measured graph size exceeds xyflow's comfortable regime (est. ~1–2k nodes, **to be measured in Phase 6**, not claimed), the network panel switches renderer to **sigma v4 + @react-sigma/core** on the same graphology model, accepting manual grouping logic.

## Consequences
- Edge "health" is never drawn from topology alone: activity is a separate observed/measured field (contracts doc §3.1) — graph panels must render unmeasured edges distinctly.
- elkjs licensing verification owed; dagre fallback removes the blocker if unsettled.
- Large-graph LOD/threshold work scheduled in Phase 6, driven by measurement.

## Rejected alternatives
- cytoscape (Canvas + no official React wrapper; badges cruder).
- deck.gl graph layers (semi-maintained status conflicts with a production base layer).
- d3-force as primary (dormant, fine only as a force-precompute option).
