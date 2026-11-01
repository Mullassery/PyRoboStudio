import type { DataSource, Origin, SelectionRef } from "../sdk/contracts";

const originLabel: Record<Origin, string> = {
  live: "LIVE",
  recorded: "RECORDED",
  simulated: "SIMULATED",
  derived: "DERIVED",
};

const originClass: Record<Origin, string> = {
  live: "bg-ok/20 text-ok",
  recorded: "bg-accent/20 text-accent",
  simulated: "bg-warn/20 text-warn",
  derived: "bg-muted/20 text-muted",
};

export function OriginBadge({ origin }: { origin: Origin }) {
  return (
    <span data-testid={`origin-badge-${origin}`} className={`badge ${originClass[origin]}`}>
      {originLabel[origin]}
    </span>
  );
}

const statusColor: Record<DataSource["status"], string> = {
  connected: "bg-ok",
  connecting: "bg-warn",
  disconnected: "bg-muted",
  error: "bg-err",
  degraded: "bg-warn",
};

export function SourceStatus({ source }: { source: DataSource }) {
  return (
    <div className="flex items-center gap-2" data-testid={`source-status-${source.id}`}>
      <span className={`studio-status-dot ${statusColor[source.status]}`} />
      <span className="text-xs text-muted">{source.label}</span>
      <OriginBadge origin={source.origin} />
    </div>
  );
}

export function DisconnectedState({ detail }: { detail?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-muted" data-testid="panel-disconnected">
      <div className="text-sm font-medium">No connection</div>
      <div className="text-xs">{detail ?? "This panel has no data source available."}</div>
    </div>
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center text-xs text-muted" data-testid="panel-empty">
      {label}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 text-err" data-testid="panel-error">
      <div className="text-sm font-semibold">Panel error</div>
      <div className="max-w-[80%] text-center text-xs" style={{ overscrollBehavior: "contain" }}>
        {message}
      </div>
    </div>
  );
}

export function SelectionSummary({ ref: sel }: { ref: SelectionRef | null }) {
  if (!sel) return <span className="text-xs text-muted">No selection</span>;
  return (
    <span className="font-mono text-xs" data-testid="selection-summary">
      {sel.kind}: {sel.label}
    </span>
  );
}
