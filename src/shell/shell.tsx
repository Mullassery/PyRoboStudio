import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DockviewApi, DockviewReadyEvent, IDockviewPanelProps } from "dockview-react";
import { DockviewReact } from "dockview-react";
import "dockview-react/dist/styles/dockview.css";
import "@xyflow/react/dist/style.css";
import { useWorkspace } from "../state/workspace";
import { ErrorState, SourceStatus } from "../components/status";
import { CommandPalette, buildCommands } from "./palette";
import { panelRegistry } from "../panels";
import type { PanelMountContextBase, PanelPlugin } from "../sdk/contracts";
import { makePanelContext } from "../state/sources";
import { sources } from "../sources";

interface PanelProps extends IDockviewPanelProps<{ pluginId: string }> {}

function PanelChrome(props: PanelProps) {
  const plugin = panelRegistry.get(props.params.pluginId);
  const panelKey = `panel-${props.params.pluginId}`;
  const rawConfig = useWorkspace((s) => s.panelConfigs[panelKey]);
  const setPanelConfig = useWorkspace((s) => s.setPanelConfig);
  const [error, setError] = useState<Error | undefined>(undefined);
  void props;
  if (!plugin) {
    return <ErrorState message={`Unknown panel: ${props.params.pluginId}`} />;
  }
  if (error) {
    return <ErrorState message={error.message} />;
  }
  const ctx: PanelMountContextBase = makePanelContext(panelKey, rawConfig ?? {}, (values) =>
    setPanelConfig(panelKey, values),
  );
  let rendered: React.ReactNode;
  try {
    const Comp = plugin.component;
    rendered = <Comp ctx={ctx} />;
  } catch (e) {
    setError(e as Error);
    return <ErrorState message={(e as Error).message} />;
  }
  return <div className="h-full overflow-auto">{rendered}</div>;
}

const panelComponents: Record<string, React.FunctionComponent<PanelProps>> = { studio: PanelChrome };

function builtinPanelId(p: PanelPlugin): string {
  return `panel-${p.id}`;
}

function buildDefaultLayout(api: DockviewApi): void {
  const panels = panelRegistry.list();
  panels.forEach((p, i) => {
    api.addPanel({
      id: builtinPanelId(p),
      component: "studio",
      params: { pluginId: p.id },
      position: i === 0 ? undefined : { referencePanel: builtinPanelId(panels[i - 1]!) },
    });
  });
}

export function StudioShell() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const theme = useWorkspace((s) => s.theme);
  const sourceId = useWorkspace((s) => s.sourceId);
  const sourceRev = useWorkspace((s) => s.sourceRev);
  void sourceRev;

  const setSourceId = useWorkspace((s) => s.setSourceId);
  const setTheme = useWorkspace((s) => s.setTheme);
  const setLayoutJson = useWorkspace((s) => s.setLayoutJson);
  const apiRef = useRef<DockviewApi | null>(null);
  const source = sources.get(sourceId);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (e.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const applyLayout = useCallback(
    (event: DockviewReadyEvent) => {
      apiRef.current = event.api;
      const saved = useWorkspace.getState().layoutJson;
      if (saved) {
        try {
          event.api.fromJSON(JSON.parse(saved));
          apiRef.current = event.api;
          return;
        } catch {
          buildDefaultLayout(event.api);
        }
      } else {
        buildDefaultLayout(event.api);
      }
      event.api.onDidLayoutChange(() => {
        useWorkspace.getState().setLayoutJson(JSON.stringify(event.api.toJSON()));
      });
    },
    [],
  );

  const openPanel = useCallback((plugin: PanelPlugin) => {
    const api = apiRef.current;
    if (!api) return;
    const id = builtinPanelId(plugin);
    const panel = api.getPanel(id);
    if (panel) {
      panel.api.setActive();
      return;
    }
    api.addPanel({ id, component: "studio", params: { pluginId: plugin.id } });
  }, []);

  const commands = useMemo(
    () => buildCommands(openPanel, setSourceId, setTheme),
    [openPanel, setSourceId, setTheme],
  );

  const missing = sourceId === "sidecar" && !source;

  return (
    <div className="studio-shell" data-theme={theme} data-testid="studio-shell">
      <header className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold tracking-tight">PyRoboStudio</span>
          <button
            className="rounded border border-border px-2 py-0.5 text-xs text-muted"
            onClick={() => setPaletteOpen(true)}
            data-testid="open-palette"
          >
            ⌘K Commands
          </button>
        </div>
        <div className="flex items-center gap-4" data-testid="connection-status">
          {source ? <SourceStatus source={source} /> : null}
        </div>
      </header>
      <div className="min-h-0 flex-1">{missing ? <ErrorState message="Sidecar source selected but not available." /> : <DockviewReact components={panelComponents} onReady={applyLayout} />}</div>
      <footer className="flex items-center justify-between border-t border-border px-3 py-1 text-[11px] text-muted">
        <span data-testid="status-source">
          source: {sourceId}
          {source?.statusDetail ? ` · ${source.statusDetail}` : ""}
        </span>
        <span data-testid="shell-hint">⌘K command palette</span>
      </footer>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
    </div>
  );
}
