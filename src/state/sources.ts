import type {
  DataSource,
  PanelMountContextBase,
  SelectionRef,
  TimeDomain,
  ClockDomain,
  CapabilitySet,
} from "../sdk/contracts";
import { selectionBus, timeBus, useWorkspace } from "../state/workspace";

class CleanupList {
  private fns: Array<() => void> = [];
  add(fn: () => void): void {
    this.fns.push(fn);
  }
  dispose(): void {
    for (const fn of this.fns.splice(0)) {
      try {
        fn();
      } catch {
        void 0;
      }
    }
  }
}

const emptyCapabilities = (origin: CapabilitySet["origin"]): CapabilitySet => ({
  origin,
  rosConnected: false,
  capabilities: [],
  adapterStatus: [],
  limits: { maxSubscriptions: 32, maxBufferedMessages: 1000 },
});

export const sources = new Map<string, DataSource>();

export function registerSource(source: DataSource): void {
  sources.set(source.id, source);
}

export function activeSource(): DataSource {
  const id = useWorkspace.getState().sourceId;
  return sources.get(id) ?? sources.get("simulated")!;
}

export function makePanelContext(
  panelId: string,
  configValues: Record<string, unknown>,
  setConfig: (values: Record<string, unknown>) => void,
): PanelMountContextBase {
  const cleanups = new CleanupList();
  const ctx: PanelMountContextBase = {
    workspaceId: useWorkspace.getState().sourceId,
    panelId,
    source: activeSource(),
    config: {
      get: <T,>(key: string, fallback: T): T => {
        const v = (configValues as Record<string, unknown>)[key];
        return (v as T) ?? fallback;
      },
      set: (key, value) => setConfig({ ...configValues, [key]: value }),
      subscribe: () => () => undefined,
    },
    selection: {
      publish: (ref: SelectionRef | null) => selectionBus.set(ref),
      subscribe: (l) => selectionBus.subscribe(l),
      current: () => selectionBus.get(),
    },
    time: {
      declareDomain: (domain) => timeBus.declareDomain(panelId, domain),
      domain: () => timeBus.domain(),
      cursor: () => timeBus.cursor(),
      subscribe: (l) => {
        const off1 = timeBus.cursorSubscribe((t) => l(t, timeBus.domain()));
        const off2 = timeBus.domainSubscribe(() => l(timeBus.cursor(), timeBus.domain()));
        return () => {
          off1();
          off2();
        };
      },
      seek: (t: bigint, clockDomain: ClockDomain) => timeBus.seek(t, clockDomain),
    },
    notify: () => undefined,
    cleanup: cleanups,
    configValues,
  };
  Object.defineProperty(ctx, "source", {
    get: () => activeSource(),
    enumerable: true,
  });
  return ctx;
}

export { emptyCapabilities, CleanupList };
