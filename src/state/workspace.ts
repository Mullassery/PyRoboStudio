import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { SelectionRef, TimeDomain, ClockDomain } from "../sdk/contracts";

interface Listener<T> {
  (value: T): void;
}

class EventBus<T> {
  private listeners = new Set<Listener<T>>();
  constructor(private value: T) {}
  get(): T {
    return this.value;
  }
  set(value: T): void {
    this.value = value;
    for (const l of [...this.listeners]) l(value);
  }
  subscribe(l: Listener<T>): () => void {
    this.listeners.add(l);
    l(this.value);
    return () => {
      this.listeners.delete(l);
    };
  }
}

export class SelectionBus extends EventBus<SelectionRef | null> {}
export class TimeBus {
  private domainBus: EventBus<TimeDomain | null>;
  private cursorBus: EventBus<bigint | null>;
  private domains = new Map<string, TimeDomain>();

  constructor() {
    this.domainBus = new EventBus<TimeDomain | null>(null);
    this.cursorBus = new EventBus<bigint | null>(null);
  }

  declareDomain(id: string, domain: TimeDomain | null): void {
    if (domain === null) {
      this.domains.delete(id);
    } else {
      this.domains.set(id, domain);
    }
    this.domainBus.set(this.sharedDomain());
  }

  sharedDomain(): TimeDomain | null {
    if (this.domains.size === 0) return null;
    const domains = [...this.domains.values()];
    const first = domains[0]!;
    const sameClock = domains.every((d) => d.clockDomain === first.clockDomain);
    if (!sameClock) {
      return {
        startNs: domains.reduce((m, d) => (d.startNs < m ? d.startNs : m), first.startNs),
        endNs: domains.reduce((m, d) => (d.endNs > m ? d.endNs : m), first.endNs),
        clockDomain: first.clockDomain,
      };
    }
    const start = domains.reduce((m, d) => (d.startNs < m ? d.startNs : m), first.startNs);
    const end = domains.reduce((m, d) => (d.endNs > m ? d.endNs : m), first.endNs);
    return { startNs: start, endNs: end, clockDomain: first.clockDomain };
  }

  seek(t: bigint, clockDomain: ClockDomain): void {
    const shared = this.sharedDomain();
    if (!shared) return;
    if (shared.clockDomain !== clockDomain) {
      this.cursorBus.set(null);
      return;
    }
    const clamped = t < shared.startNs ? shared.startNs : t > shared.endNs ? shared.endNs : t;
    this.cursorBus.set(clamped);
  }

  domainSubscribe(l: Listener<TimeDomain | null>): () => void {
    return this.domainBus.subscribe(l);
  }

  cursorSubscribe(l: Listener<bigint | null>): () => void {
    return this.cursorBus.subscribe(l);
  }

  cursor(): bigint | null {
    return this.cursorBus.get();
  }

  domain(): TimeDomain | null {
    return this.domainBus.get();
  }
}

export const selectionBus = new SelectionBus(null);
export const timeBus = new TimeBus();

export interface AppError {
  level: "info" | "warn" | "error";
  message: string;
  at: number;
}

interface WorkspaceState {
  theme: "dark" | "light";
  sourceId: "simulated" | "sidecar";
  layoutJson: string | null;
  panelConfigs: Record<string, Record<string, unknown>>;
}

interface WorkspaceStore extends WorkspaceState {
  sourceRev: number;
  bumpSourceRev(): void;
  setTheme(t: "dark" | "light"): void;
  setSourceId(s: "simulated" | "sidecar"): void;
  setLayoutJson(j: string | null): void;
  setPanelConfig(panelId: string, values: Record<string, unknown>): void;
}

export const useWorkspace = create<WorkspaceStore>()(
  persist(
    (set) => ({
      theme: "dark",
      sourceId: "simulated",
      sourceRev: 0,
      layoutJson: null,
      panelConfigs: {},
      bumpSourceRev: () => set((s) => ({ sourceRev: s.sourceRev + 1 })),
      setTheme: (theme) => set({ theme }),
      setSourceId: (sourceId) => set({ sourceId }),
      setLayoutJson: (layoutJson) => set({ layoutJson }),
      setPanelConfig: (panelId, values) =>
        set((s) => ({
          panelConfigs: { ...s.panelConfigs, [panelId]: { ...s.panelConfigs[panelId], ...values } },
        })),
    }),
    { name: "pyrobostudio-workspace", storage: createJSONStorage(() => localStorage) },
  ),
);
