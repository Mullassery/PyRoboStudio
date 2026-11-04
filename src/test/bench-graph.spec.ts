/**
 * Phase 6 performance benchmark: graph model build + ELK layout scaling.
 * Run explicitly (not part of the default suite):
 *   BENCH=1 npx vitest run src/test/bench-graph.spec.ts
 * Produces the real numbers recorded in docs/benchmarks.md.
 */
import { describe, expect, it } from "vitest";
import type { GraphSnapshot } from "../sdk/contracts";
import { buildGraphModel, layoutGraph } from "../panels/graph-explorer";

const run = process.env.BENCH === "1";

export function syntheticSnapshot(nodeCount: number): GraphSnapshot {
  const nodes = Array.from({ length: nodeCount }, (_, i) => ({
    id: `n${i}`,
    ns: i % 5 === 0 ? "/sim" : `/robot${i % 4}`,
    name: `node_${i}`,
    kind: "node" as const,
  }));
  const topics = Array.from({ length: nodeCount }, (_, i) => ({
    id: `t${i}`,
    name: `/robot${i % 4}/topic_${i}`,
    msgType: "std_msgs/msg/Float32",
    pubCount: 1,
    subCount: 1,
  }));
  const edges = nodes.flatMap((n, i) => {
    const t = topics[i]!;
    return [
      { id: `e${i}p`, nodeId: n.id, topicId: t.id, direction: "pub" as const, qosCompat: "ok" as const },
      { id: `e${i}s`, nodeId: nodes[(i + 1) % nodeCount]!.id, topicId: t.id, direction: "sub" as const, qosCompat: "ok" as const },
    ];
  });
  const activity = topics.map((t) => ({ topicId: t.id, hz: 10, reliability: "observed" as const }));
  return { nodes, topics, edges, activity };
}

describe("graph layout benchmark (BENCH=1)", () => {
  it("measures model build + ELK layout at increasing graph sizes", async () => {
    if (!run) return;
    const rows: string[] = [];
    for (const n of [50, 100, 250, 500, 1000, 2000]) {
      const sn = syntheticSnapshot(n);
      const t0 = performance.now();
      const model = buildGraphModel(sn, { collapsed: false, filter: "", selected: null });
      const t1 = performance.now();
      const positioned = await layoutGraph(model.nodes, model.edges);
      const t2 = performance.now();
      rows.push(
        `nodes=${n} topics=${n} edges=${model.edges.length} modelMs=${(t1 - t0).toFixed(1)} elkMs=${(t2 - t1).toFixed(1)}`,
      );
      expect(positioned).toHaveLength(model.nodes.length);
    }
    console.log("BENCH-GRAPH\n" + rows.join("\n"));
  });
});
