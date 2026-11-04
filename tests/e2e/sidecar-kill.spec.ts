import { expect, test } from "@playwright/test";
import { spawn } from "node:child_process";
import { execSync } from "node:child_process";

/**
 * Phase 6 hardening: real process-kill disconnect (the smoke.spec.ts variant
 * uses route interception). Kills the sidecar uvicorn process mid-session,
 * asserts the footer flips to an accurate disconnected state, then respawns
 * the sidecar and asserts recovery. Runs its own file so a failure here
 * cannot poison the smoke suite; the respawn keeps the shared webServer
 * healthy for subsequent runs.
 */

function sidecarPid(): string {
  try {
    return execSync("lsof -ti :8787 -sTCP:LISTEN").toString().trim();
  } catch {
    return "";
  }
}

test("killing the sidecar process shows an accurate disconnected state and recovers", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/");
  await expect(page.getByTestId("studio-shell")).toBeVisible();

  await page.getByTestId("open-palette").click();
  await page.keyboard.type("sidecar");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("status-source")).toContainText("source: sidecar", { timeout: 10_000 });
  await expect(page.getByTestId("status-source")).toContainText("recorded session served", { timeout: 10_000 });

  const pid = sidecarPid();
  expect(pid, "sidecar process listening on 8787").not.toBe("");
  execSync(`kill ${pid}`);

  // health poll (4s) notices the dead process
  await expect(page.getByTestId("status-source")).toContainText("disconnected", { timeout: 20_000 });
  await expect(page.getByTestId("connection-status")).toContainText("Sidecar");

  // respawn the sidecar so the shared webServer and later runs stay healthy
  const child = spawn(
    "uv",
    ["run", "uvicorn", "pyrobostudio_sidecar.server:app", "--port", "8787"],
    { cwd: "sidecar", detached: true, stdio: "ignore" },
  );
  child.unref();
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && !sidecarPid()) {
    await page.waitForTimeout(500);
  }
  expect(sidecarPid(), "respawned sidecar listening on 8787").not.toBe("");

  // the shell recovers automatically via the health poll
  await expect(page.getByTestId("status-source")).toContainText("recorded session served", { timeout: 20_000 });
});
