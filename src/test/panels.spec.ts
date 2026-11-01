import { describe, expect, it } from "vitest";
import type { GraphSnapshot, TerrainRegion } from "../sdk/contracts";
import { buildGraphModel, topicBadgeFor } from "../panels/graph-explorer";
import { eventPosPercent, labelFor, sessionSpanNs } from "../panels/replay";
import { confidenceColor, regionEnvironmentToCells } from "../panels/terrain";
import { normalizeBigints } from "../sources/sidecar";

const sn: GraphSnapshot = {
  nodes: [
    { id: "n1", ns: "/ros1", name: "talker", kind: "node" },
    { id: "n2", ns: "/ros1", name: "listener", kind: "node" },
    { id: "n3", ns: "/ros2", name: "other", kind: "node" },
  ],
  topics: [
    { id: "t1", name: "/chatter", msgType: "std_msgs/String", pubCount: 1, subCount: 1 },
    { id: "t2", name: "/ros2/quiet", msgType: "std_msgs/msg/Empty", pubCount: 0, subCount: 1 },
  ],
  edges: [
    { id: "e1", nodeId: "n1", topicId: "t1", direction: "pub", qosCompat: "ok" },
    { id: "e2", nodeId: "n2", topicId: "t1", direction: "sub", qosCompat: "ok" },
    { id: "e3", nodeId: "n3", topicId: "t2", direction: "sub", qosCompat: "unknown" },
  ],
  activity: [
    { topicId: "t1", hz: 10, reliability: "observed" },
    { topicId: "t2", reliability: "unmeasured" },
  ],
};

describe("topicBadgeFor", () => {
  it("shows hz for observed flow", () => {
    expect(topicBadgeFor(sn, "t1")).toBe("10Hz");
  });
  it("shows unmeasured/no-flow badges", () => {
    expect(topicBadgeFor(sn, "t2")).toBe("unmeasured");
    expect(topicBadgeFor(sn, "missing")).toBe("no flow");
  });
});

const base = { selected: null, filter: "", collapsed: false };

describe("buildGraphModel expanded", () => {
  it("creates node+topic nodes and directed edges", () => {
    const m = buildGraphModel(sn, base);
    expect(m.nodes.map((n) => n.id).sort()).toEqual(["n1", "n2", "n3", "t1", "t2"]);
    const e1 = m.edges.find((e) => e.id === "e1");
    expect(e1).toMatchObject({ source: "n1", target: "t1" });
    const e2 = m.edges.find((e) => e.id === "e2");
    expect(e2).toMatchObject({ source: "t1", target: "n2" });
  });

  it("filters to matching topics and connected nodes", () => {
    const m = buildGraphModel(sn, { ...base, filter: "chatter" });
    expect(m.nodes.map((n) => n.id).sort()).toEqual(["n1", "n2", "t1"]);
    expect(m.edges.map((e) => e.id)).toEqual(["e1", "e2"]);
  });
});

describe("buildGraphModel collapsed", () => {
  it("collapses same-namespace nodes into clusters and drops orphans", () => {
    const m = buildGraphModel(sn, { ...base, collapsed: true });
    const ids = m.nodes.map((n) => n.id);
    expect(ids).toContain("ns:/ros1");
    expect(ids).toContain("ns:/ros2");
    expect(ids).toContain("t1");
    expect(ids).toContain("t2");
    expect(ids.filter((id) => id === "n1")).toHaveLength(0);
    const up = m.edges.find((e) => e.data && (e.data as { direction?: string }).direction === "pub");
    expect(up && ("source" in up)).toBe(true);
  });
});

describe("replay helpers", () => {
  const session = {
    id: "s1",
    format: "mcap",
    origin: "recorded" as const,
    span: { startNs: 0n, endNs: 10_000n, clockDomain: "session_ns" as const },
    topicCount: 1,
    eventCount: 1,
    degraded: [],
  };
  it("eventPosPercent spans 0..100", () => {
    expect(
      eventPosPercent(
        { id: "e", sessionId: "s1", timestampNs: 2500n, kind: "x", label: "", severity: "info" },
        session,
      ),
    ).toBe(25);
  });
  it("sessionSpanNs and labelFor", () => {
    expect(sessionSpanNs(session)).toBe(10_000n);
    expect(
      labelFor({ id: "e", sessionId: "s1", timestampNs: 1n, kind: "tx_drop", label: "", severity: "warn" }),
    ).toBe("!");
  });
});

describe("terrain helpers", () => {
  it("confidenceColor: no conflict red ramp, conflict qualitatively different", () => {
    const [hi] = confidenceColor(1, false);
    const [mid] = confidenceColor(0.5, false);
    const [conflict] = confidenceColor(0.5, true);
    expect(hi).toBeGreaterThan(mid);
    expect(conflict).not.toBe(mid);
  });

  it("regionEnvironmentToCells preserves real H3 cell ids and numeric ages", () => {
    const region: TerrainRegion = {
      cellId: "882a1072d7fffff",
      confidence: 0.9,
      ageNs: 3600n * 1_000_000_000n,
      sourceRobot: "robot1",
      conflict: false,
      centroid: [-74.0, 40.7],
    };
    const [cell] = regionEnvironmentToCells([region]);
    expect(cell?.h3Index).toBe("882a1072d7fffff");
    expect(cell?.ageNs).toBe(3_600_000_000_000);
    expect(cell?.confidence).toBe(0.9);
  });
});

describe("normalizeBigints", () => {
  it("converts known *Ns number fields to BigInt recursively", () => {
    const out = normalizeBigints({
      timestampNs: 10,
      nested: [{ startNs: 1.5, endNs: 20, other: 5 }, { ageNs: "12" }],
    });
    expect(out).toEqual({
      timestampNs: 10n,
      nested: [{ startNs: 2n, endNs: 20n, other: 5 }, { ageNs: "12" }],
    });
  });
});
