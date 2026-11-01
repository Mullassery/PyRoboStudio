import { describe, expect, it, vi } from "vitest";
import { SelectionBus, TimeBus } from "../state/workspace";
import type { SelectionRef, TimeDomain } from "../sdk/contracts";

describe("SelectionBus", () => {
  it("publishes and notifies subscribers", () => {
    const bus = new SelectionBus(null);
    const seen: Array<SelectionRef | null> = [];
    bus.subscribe((s) => seen.push(s));
    const ref: SelectionRef = { kind: "topic", sourceId: "simulated", id: "/cmd_vel", label: "/cmd_vel" };
    bus.set(ref);
    expect(seen).toEqual([null, ref]);
    expect(bus.get()).toEqual(ref);
  });

  it("unsubscribes", () => {
    const bus = new SelectionBus(null);
    const fn = vi.fn();
    const off = bus.subscribe(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    bus.set({ kind: "node", sourceId: "simulated", id: "n1", label: "n1" });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("TimeBus", () => {
  const d: TimeDomain = { startNs: 0n, endNs: 1000n, clockDomain: "session_ns" };

  it("declares per-panel domains and merges them", () => {
    const bus = new TimeBus();
    bus.declareDomain("replay", d);
    expect(bus.domain()).toEqual({
      startNs: 0n,
      endNs: 1000n,
      clockDomain: "session_ns",
    });
    bus.declareDomain("richer", { startNs: 100n, endNs: 5000n, clockDomain: "session_ns" });
    const merged = bus.sharedDomain();
    expect(merged?.startNs).toBe(0n);
    expect(merged?.endNs).toBe(5000n);
  });

  it("drops panel domain on null and clears them all", () => {
    const bus = new TimeBus();
    bus.declareDomain("a", d);
    bus.declareDomain("a", null);
    expect(bus.domain()).toBeNull();
  });

  it("clamps seeks to the shared domain and rejects cross-clock seeks", () => {
    const bus = new TimeBus();
    bus.declareDomain("a", d);
    bus.seek(5000n, "session_ns");
    expect(bus.cursor()).toBe(1000n);
    bus.seek(1n, "ros_time");
    expect(bus.cursor()).toBeNull();
  });

  it("notifies domain subscribers", () => {
    const bus = new TimeBus();
    const fn = vi.fn();
    bus.domainSubscribe(fn);
    bus.declareDomain("a", d);
    expect(fn).toHaveBeenCalledWith(d);
  });
});
