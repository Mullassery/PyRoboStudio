import type { DataSource } from "../sdk/contracts";
import { registerSource, sources } from "../state/sources";
import { createSimulatedSource } from "./simulated";
import { createSidecarSource } from "./sidecar";

export function registerSimulatedSource(): void {
  registerSource(createSimulatedSource());
}

export async function refreshSidecarSource(): Promise<void> {
  const created = await createSidecarSource();
  if (!("offline" in created)) {
    registerSource(created);
  }
}

export async function initializeDataSources(): Promise<void> {
  registerSimulatedSource();
  await refreshSidecarSource();
}

export type { DataSource };
export { sources };
