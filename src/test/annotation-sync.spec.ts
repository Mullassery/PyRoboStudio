import { describe, expect, it } from "vitest";
import {
  ANNOTATION_SYNC_FLAG,
  annotationsEnabled,
  mergeAnnotations,
  type Annotation,
} from "../sdk/annotation-sync";

const ann = (id: string, originNodeId: string, originSeq: number, note = "n"): Annotation => ({
  id,
  target: { kind: "topic", id: "t/x" },
  note,
  originNodeId,
  originSeq,
  createdAt: "2026-11-04T00:00:00Z",
});

describe("annotation sync spike (behind flag)", () => {
  it("is disabled by default", () => {
    expect(annotationsEnabled({})).toBe(false);
    expect(annotationsEnabled({ [ANNOTATION_SYNC_FLAG]: true })).toBe(true);
  });

  it("adds remote annotations not present locally", () => {
    const { merged, conflicts } = mergeAnnotations([ann("a", "nodeA", 1)], [ann("b", "nodeB", 1)]);
    expect(merged.map((m) => m.id).sort()).toEqual(["a", "b"]);
    expect(conflicts).toEqual([]);
  });

  it("applies last-write-wins by originSeq", () => {
    const { merged, conflicts } = mergeAnnotations(
      [ann("a", "nodeA", 1, "old")],
      [ann("a", "nodeB", 2, "new")],
    );
    expect(merged[0]?.note).toBe("new");
    expect(conflicts).toEqual([]);
  });

  it("keeps local when remote seq is older", () => {
    const { merged } = mergeAnnotations([ann("a", "nodeA", 3, "keep")], [ann("a", "nodeB", 2, "stale")]);
    expect(merged[0]?.note).toBe("keep");
  });

  it("surfaces equal-seq cross-origin writes as conflicts without dropping either", () => {
    const { merged, conflicts } = mergeAnnotations(
      [ann("a", "nodeA", 5, "local-note")],
      [ann("a", "nodeB", 5, "remote-note")],
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.local.note).toBe("local-note");
    expect(conflicts[0]?.remote.note).toBe("remote-note");
    expect(merged.find((m) => m.id === "a")?.note).toBe("local-note");
  });
});
