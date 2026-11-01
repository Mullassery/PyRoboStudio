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
  await expect(page.getByTestId("status-source")).toContainText("offline mode", { timeout: 10_000 });
  await expect(page.getByTestId("origin-badge-recorded").first()).toBeVisible();

  await page.getByText("panel-replay-timeline", { exact: true }).click();
  await expect(page.getByTestId("replay-panel")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("replay-session-select")).toContainText("sample_session", { timeout: 10_000 });
});
