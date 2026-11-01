import { describe, expect, it } from "vitest";
import { PanelRegistry, type PanelPlugin } from "../sdk/contracts";

function plugin(id: string): PanelPlugin {
  return {
    id,
    version: "1.0.0",
    contractVersion: 1,
    displayName: id,
    description: "",
    requiredCapabilities: [],
    component: () => <div />,
  };
}

describe("PanelRegistry", () => {
  it("rejects duplicate ids", () => {
    const r = new PanelRegistry();
    r.register(plugin("a"));
    expect(() => r.register(plugin("a"))).toThrow(/collision/);
  });

  it("lists registered plugins and finds by id", () => {
    const r = new PanelRegistry();
    r.register(plugin("a"));
    r.register(plugin("b"));
    expect(r.list().map((p) => p.id)).toEqual(["a", "b"]);
    expect(r.get("b")?.id).toBe("b");
    expect(r.get("nope")).toBeUndefined();
  });
});
