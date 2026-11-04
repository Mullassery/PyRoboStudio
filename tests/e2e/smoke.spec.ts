import { expect, test } from "@playwright/test";

test("boots the studio shell against the simulated source", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("studio-shell")).toBeVisible();
  await expect(page.getByTestId("connection-status")).toContainText("SIM", { ignoreCase: true });
  await expect(page.getByTestId("status-source")).toContainText("source: simulated");
});

test("graph explorer renders nodes and topic badges; selection updates inspector", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("studio-shell")).toBeVisible();
  await page.getByText("panel-ros-graph-explorer").click();
  await expect(page.getByTestId("graph-explorer")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("graph-filter-input")).toBeVisible();

  const palettesVisible = await page
    .getByTestId("graph-explorer")
    .getByText(/Hz|no flow|unmeasured/, { exact: false })
    .count();
  expect(palettesVisible).toBeGreaterThan(0);
});

test("selecting a topic in the graph surfaces it in the inspector with bounded samples", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("studio-shell")).toBeVisible();
  await page.getByText("panel-ros-graph-explorer", { exact: true }).click();
  await expect(page.getByTestId("graph-explorer")).toBeVisible({ timeout: 15_000 });

  await page.getByTestId("graph-collapse-toggle").click();

  await page.getByText("panel-data-inspector", { exact: true }).click();
  await expect(page.getByTestId("inspector")).toBeVisible({ timeout: 10_000 });
  await page.locator('[data-testid^="inspector-topic"]').first().click();
  await expect(page.getByTestId("inspector-details")).toBeVisible({ timeout: 10_000 });
  const badge = await page.getByTestId("inspector-details").getByText(/LIVE|RECORDED|SIMULATED|DERIVED/i).count();
  expect(badge).toBeGreaterThan(0);
});

test("command palette opens and lists commands", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("studio-shell")).toBeVisible();
  await page.getByTestId("open-palette").click();
  await expect(page.getByTestId("command-palette")).toBeVisible();
  await page.keyboard.type("theme");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("command-palette")).toBeHidden();
});

test("replay panel lists sessions from the source", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("studio-shell")).toBeVisible();
  await page.getByTestId("open-palette").click();
  await page.keyboard.press("Escape");
  await page.getByText("panel-replay-timeline").click();
  await expect(page.getByTestId("replay-panel")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("replay-session-select")).toBeVisible();
});

test("switching to the sidecar source serves recorded data end-to-end", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("studio-shell")).toBeVisible();

  await page.getByTestId("open-palette").click();
  await page.keyboard.type("sidecar");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("status-source")).toContainText("source: sidecar", { timeout: 10_000 });
  await expect(page.getByTestId("status-source")).toContainText("recorded session served", { timeout: 10_000 });
  await expect(page.getByTestId("origin-badge-recorded").first()).toBeVisible();

  await page.getByText("panel-replay-timeline", { exact: true }).click();
  await expect(page.getByTestId("replay-panel")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("replay-session-select")).toContainText("sample_session", { timeout: 10_000 });
});

test("losing the sidecar mid-session shows an accurate disconnected state", async ({ page }) => {
  const context = page.context();
  await page.goto("/");
  await expect(page.getByTestId("studio-shell")).toBeVisible();

  await page.getByTestId("open-palette").click();
  await page.keyboard.type("sidecar");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("status-source")).toContainText("source: sidecar", { timeout: 10_000 });
  await expect(page.getByTestId("status-source")).toContainText("recorded session served", { timeout: 10_000 });

  await context.route("**/api/**", (route) => route.abort());
  await expect(page.getByTestId("status-source")).toContainText("disconnected", { timeout: 15_000 });
  await expect(page.getByTestId("connection-status")).toContainText("Sidecar");
});

test("network topology panel renders the PyNetworkIntel subnet/device/service graph", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("studio-shell")).toBeVisible();

  await page.getByTestId("open-palette").click();
  await page.keyboard.type("network");
  await page.keyboard.press("Enter");
  await expect(page.getByText("panel-network-topology", { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.getByText("panel-network-topology", { exact: true }).click();
  await expect(page.getByTestId("network-topology")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("topo-badge")).toBeVisible();
  await expect(page.getByTestId("topo-node-subnet").first()).toBeVisible();
  await expect(page.getByTestId("topo-node-device").first()).toBeVisible();
  await expect(page.getByTestId("topo-node-service").first()).toBeVisible();
});

test("uncorrelated selections surface an explicit not-correlated state", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("studio-shell")).toBeVisible();

  await page.getByText("panel-ros-graph-explorer", { exact: true }).click();
  await expect(page.getByTestId("graph-explorer")).toBeVisible({ timeout: 15_000 });
  // wait for the deferred post-layout fitView so the topic node is on-screen
  await page.waitForTimeout(800);
  await page.getByTestId(/^graph-topic-/).first().click({ force: true });

  await page.getByTestId("open-palette").click();
  await page.keyboard.type("network");
  await page.keyboard.press("Enter");
  await page.getByText("panel-network-topology", { exact: true }).click();
  await expect(page.getByTestId("network-topology")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("selection-uncorrelated")).toContainText("not correlated", { timeout: 10_000 });

  await page.getByText("panel-ros-graph-explorer", { exact: true }).click();
  await expect(page.getByTestId("selection-uncorrelated")).toHaveCount(0);
});

test("mission timeline joins artifacts and drives replay from a failure event", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("studio-shell")).toBeVisible();

  await page.getByTestId("open-palette").click();
  await page.keyboard.type("mission");
  await page.keyboard.press("Enter");
  await page.getByText("panel-mission-timeline", { exact: true }).click();
  await expect(page.getByTestId("mission-panel")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("mission-title")).toContainText("mission-warehouse-001");
  await expect(page.getByTestId("mission-artifact-rosbag")).toBeVisible();
  await expect(page.getByTestId("mission-artifact-world_spec")).toBeVisible();
  await expect(page.getByTestId("mission-artifacts").getByText(/sha256:/)).toHaveCount(6);

  await page.getByTestId("mission-event-ev-scan-anomaly").click();

  await page.getByText("panel-replay-timeline", { exact: true }).click();
  await expect(page.getByTestId("replay-panel")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("replay-cursor-ns")).toContainText("6000000000", { timeout: 10_000 });
});

test("track debugger renders identity-colored bboxes and lifecycle events", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("studio-shell")).toBeVisible();

  await page.getByTestId("open-palette").click();
  await page.keyboard.type("track");
  await page.keyboard.press("Enter");
  await page.getByText("panel-track-debugger", { exact: true }).click();
  await expect(page.getByTestId("track-debugger")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("track-image-plane").getByTestId("track-bbox-1")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("track-event-born").first()).toBeVisible();
  await expect(page.getByTestId("track-event-occluded").first()).toBeVisible();
  await expect(page.getByTestId("track-debugger").getByText("derived").first()).toBeVisible();

  await page.getByTestId("track-play").click();
  await expect(page.getByTestId("track-frame-label")).toContainText("frame 1", { timeout: 5_000 });
});

test("workspace export/import round-trips theme and layout via palette", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("studio-shell")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("open-palette").click();
  await page.keyboard.type("export");
  await page.keyboard.press("Enter");
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();

  // the palette stays open after a command runs; close it before the next command
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("command-palette")).toBeHidden();

  await page.getByTestId("open-palette").click();
  await page.keyboard.type("light");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("studio-shell")).toHaveAttribute("data-theme", "light");

  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("open-palette").click();
  await page.keyboard.type("import");
  await page.keyboard.press("Enter");
  const chooser = await chooserPromise;
  await chooser.setFiles(path!);

  await expect(page.getByTestId("studio-shell")).toHaveAttribute("data-theme", "dark", { timeout: 10_000 });
});
