import { act, cleanup, render, waitFor } from "@testing-library/react";
import {
  DockviewReact,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
} from "dockview-react";
import { afterEach, describe, expect, it } from "vitest";
import "dockview-react/dist/styles/dockview.css";

function Panel({ params }: IDockviewPanelProps) {
  return <div data-testid={`panel-${String(params.id)}`} />;
}

afterEach(cleanup);

/**
 * Spike test for ADR-0003: prove dockview-react 8.8.3 works under
 * React 19 + Vite 8 + Vitest 5 with layout JSON round-trip.
 * Loading is async (issue #1); fromJSON needs a second act/waitFor cycle.
 */
describe("dockview-react + React 19 + Vite 8 validation spike (ADR-0003)", () => {
  it("mounts, adds panels, and round-trips layout through toJSON/fromJSON", async () => {
    let ready: DockviewReadyEvent | undefined;

    const { container } = render(
      <DockviewReact
        components={{ panel: Panel }}
        onReady={(event) => {
          ready = event;
        }}
      />,
    );

    expect(ready).toBeDefined();
    const api = ready!.api;

    await act(async () => {
      api.addPanel({ id: "p1", component: "panel", params: { id: "p1" } });
      api.addPanel({ id: "p2", component: "panel", params: { id: "p2" } });
    });
    expect(api.panels).toHaveLength(2);
    await waitFor(() => {
      const live = container.querySelectorAll('[data-testid^="panel-"]');
      expect(live.length).toBeGreaterThan(0);
    });

    const serialized = structuredClone(api.toJSON());
    expect(serialized.panels).toBeDefined();
    expect(Object.keys(serialized.panels)).toHaveLength(2);

    await act(async () => {
      api.clear();
      api.fromJSON(serialized);
    });
    expect(api.panels).toHaveLength(2);
    expect(api.groups.length).toBeGreaterThan(0);
    await waitFor(() => {
      // Content components mount only for the active tab; at least one must be live.
      const live = container.querySelectorAll(
        '[data-testid^="panel-"]',
      );
      expect(live.length).toBeGreaterThan(0);
    });
  });
});
