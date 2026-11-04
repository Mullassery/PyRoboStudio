import { describe, expect, it } from "vitest";
import {
  SELECTION_MAPPINGS,
  isCorrelated,
  supportedKindsFor,
  uncorrelatedReason,
} from "../sdk/selection-mapping";
import type { SelectionRef } from "../sdk/contracts";

const ref = (kind: SelectionRef["kind"]): SelectionRef => ({
  kind,
  sourceId: "sim",
  id: "x",
  label: "x",
});

describe("selection mapping table", () => {
  it("covers every registered panel id", () => {
    expect(Object.keys(SELECTION_MAPPINGS)).toEqual(
      expect.arrayContaining([
        "ros-graph-explorer",
        "data-inspector",
        "world-3d-viewer",
        "terrain-viewer",
        "replay-timeline",
        "charts",
        "network-topology",
      ]),
    );
  });

  it("charts correlates only topics", () => {
    expect(isCorrelated("charts", ref("topic"))).toBe(true);
    expect(isCorrelated("charts", ref("frame"))).toBe(false);
    expect(uncorrelatedReason("charts", ref("frame"))).toContain("supported: topic");
  });

  it("network-topology correlates nothing yet and says so honestly", () => {
    expect(isCorrelated("network-topology", ref("topic"))).toBe(false);
    expect(uncorrelatedReason("network-topology", ref("topic"))).toContain("no mapping");
  });

  it("null selection is always correlated", () => {
    expect(isCorrelated("charts", null)).toBe(true);
  });

  it("unknown panels degrade to no mappings", () => {
    expect(supportedKindsFor("no-such-panel")).toEqual([]);
  });
});

describe("panelId normalization", () => {
  it("accepts dockview panel-<pluginId> keys", () => {
    expect(supportedKindsFor("panel-charts")).toEqual(supportedKindsFor("charts"));
    expect(isCorrelated("panel-charts", ref("topic"))).toBe(true);
    expect(isCorrelated("panel-network-topology", ref("topic"))).toBe(false);
  });
});
