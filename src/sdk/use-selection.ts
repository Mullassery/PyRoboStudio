import { useEffect, useState } from "react";
import type { PanelMountContextBase, SelectionRef } from "./contracts";
import { isCorrelated, uncorrelatedReason } from "./selection-mapping";

export function usePanelSelection(ctx: PanelMountContextBase): SelectionRef | null {
  const [sel, setSel] = useState<SelectionRef | null>(ctx.selection.current());
  useEffect(() => ctx.selection.subscribe(setSel), [ctx]);
  return sel;
}

export function useCorrelationBanner(
  ctx: PanelMountContextBase,
): { ref: SelectionRef | null; banner: string | null } {
  const ref = usePanelSelection(ctx);
  const banner = ref && !isCorrelated(ctx.panelId, ref) ? uncorrelatedReason(ctx.panelId, ref) : null;
  return { ref, banner };
}
