import { beforeEach, describe, expect, it } from "vitest";
import { useWorkspace, type WorkspaceExport } from "../state/workspace";

describe("workspace export/import", () => {
  beforeEach(() => {
    useWorkspace.setState({
      theme: "dark",
      sourceId: "simulated",
      layoutJson: null,
      panelConfigs: {},
      sourceRev: 0,
    });
  });

  it("exports current state with schema_version and timestamp", () => {
    useWorkspace.getState().setTheme("light");
    useWorkspace.getState().setLayoutJson('{"a":1}');
    useWorkspace.getState().setPanelConfig("panel-charts", { topic: "t/x" });
    const ex = useWorkspace.getState().exportWorkspace();
    expect(ex.schema_version).toBe("1");
    expect(ex.theme).toBe("light");
    expect(ex.layoutJson).toBe('{"a":1}');
    expect(ex.panelConfigs["panel-charts"]).toEqual({ topic: "t/x" });
    expect(ex.exported_at).toBeTruthy();
  });

  it("imports restores layout, configs, theme, and bumps sourceRev", () => {
    const ex = {
      schema_version: "1" as const,
      exported_at: "2026-11-04T00:00:00Z",
      theme: "light" as const,
      sourceId: "sidecar" as const,
      layoutJson: '{"b":2}',
      panelConfigs: { "panel-charts": { topic: "t/y" } },
    };
    useWorkspace.getState().importWorkspace(ex);
    const s = useWorkspace.getState();
    expect(s.theme).toBe("light");
    expect(s.sourceId).toBe("sidecar");
    expect(s.layoutJson).toBe('{"b":2}');
    expect(s.panelConfigs["panel-charts"]).toEqual({ topic: "t/y" });
    expect(s.sourceRev).toBe(1);
  });

  it("rejects unknown schema versions honestly", () => {
    const bad = { schema_version: "9" } as unknown as WorkspaceExport;
    expect(() => useWorkspace.getState().importWorkspace(bad)).toThrow(/unsupported workspace export/);
  });
});
