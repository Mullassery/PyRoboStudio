import { useEffect, useState } from "react";
import { initializeDataSources } from "./sources";
import { StudioShell } from "./shell/shell";
import { ErrorState } from "./components/status";

export function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void initializeDataSources()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  if (error) {
    return <ErrorState message={error} />;
  }
  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted" data-testid="boot-loading">
        Starting data sources…
      </div>
    );
  }
  return <StudioShell />;
}
