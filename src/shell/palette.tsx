import { useMemo, useState } from "react";
import { Command } from "cmdk";
import { useWorkspace } from "../state/workspace";
import { panelRegistry } from "../panels";
import { sources } from "../state/sources";
import type { PanelPlugin } from "../sdk/contracts";

export interface PaletteCommand {
  id: string;
  label: string;
  hint?: string;
  run(): void;
}

export function buildCommands(
  openPanel: (plugin: PanelPlugin) => void,
  setSourceId: (id: "simulated" | "sidecar") => void,
  setTheme: (t: "dark" | "light") => void,
): PaletteCommand[] {
  const cmds: PaletteCommand[] = panelRegistry.list().map((p) => ({
    id: `panel:${p.id}`,
    label: `Open panel: ${p.displayName}`,
    hint: p.requiredCapabilities?.join(", "),
    run: () => openPanel(p),
  }));
  for (const [id, src] of sources) {
    cmds.push({
      id: `source:${id}`,
      label: `Data source: ${src.label}`,
      hint: src.origin,
      run: () => setSourceId(id as "simulated" | "sidecar"),
    });
  }
  cmds.push(
    { id: "theme:dark", label: "Theme: dark", run: () => setTheme("dark") },
    { id: "theme:light", label: "Theme: light", run: () => setTheme("light") },
  );
  return cmds;
}

export function CommandPalette(props: { open: boolean; onClose(): void; commands: PaletteCommand[] }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () => props.commands.filter((c) => c.label.toLowerCase().includes(q.toLowerCase())),
    [props.commands, q],
  );
  if (!props.open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/30"
      role="dialog"
      aria-label="Command palette"
      data-testid="command-palette"
      onClick={props.onClose}
    >
      <div className="w-[480px] rounded-lg border border-border bg-panel p-2 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <Command label="Command palette" shouldFilter={false}>
          <Command.Input
            value={q}
            onValueChange={setQ}
            placeholder="Type a command…"
            className="w-full bg-transparent px-2 py-1.5 text-sm outline-none"
            autoFocus
          />
          <Command.List className="max-h-64 overflow-auto">
            {filtered.length === 0 && <div className="px-2 py-3 text-xs text-muted">No matching commands</div>}
            {filtered.map((c) => (
              <Command.Item
                key={c.id}
                value={c.id}
                data-testid={`palette-item-${c.id.replace(/[^a-z0-9]+/gi, "-")}`}
                onSelect={() => {
                  c.run();
                  props.onClose();
                }}
                className="flex cursor-pointer items-center justify-between rounded px-2 py-1.5 text-sm text-fg data-[selected=true]:bg-accent/20"
              >
                <span>{c.label}</span>
                {c.hint && <span className="text-[10px] text-muted">{c.hint}</span>}
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
