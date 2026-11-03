import type { DataSource } from "../sdk/contracts";
import { registerSource, sources } from "../state/sources";
import { useWorkspace } from "../state/workspace";
import { createSimulatedSource } from "./simulated";
import { createSidecarSource, createOfflineSidecarSource } from "./sidecar";

export function registerSimulatedSource(): void {
  registerSource(createSimulatedSource());
}

export async function refreshSidecarSource(): Promise<void> {
  const created = await createSidecarSource();
  if ("offline" in created) {
    if (sources.has("sidecar")) registerSource(createOfflineSidecarSource());
  } else {
    registerSource(created);
  }
  useWorkspace.getState().bumpSourceRev();
}

export function startSidecarHealthPolling(intervalMs = 4000): () => void {
  const tick = setInterval(() => {
    void refreshSidecarSource();
  }, intervalMs);
  return () => clearInterval(tick);
}

export async function initializeDataSources(): Promise<void> {
  registerSimulatedSource();
  await refreshSidecarSource();
  startSidecarHealthPolling();
}

export type { DataSource };
export { sources };
