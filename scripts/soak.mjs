/**
 * Phase 6 memory soak + dockview multi-panel measurement.
 * Requires dev servers running (vite :5173, sidecar :8787):
 *   node scripts/soak.mjs [soakSeconds]
 * Samples JS heap via CDP, opens all panels, then switches tabs for the
 * soak duration. Prints real numbers for docs/benchmarks.md.
 */
import { chromium } from "@playwright/test";

const soakS = Number(process.argv[2] ?? 60);

const PANELS = [
  "ros-graph-explorer",
  "data-inspector",
  "world-3d-viewer",
  "terrain-viewer",
  "replay-timeline",
  "charts",
  "network-topology",
  "mission-timeline",
  "track-debugger",
];

function mb(bytes) {
  return (bytes / 1024 / 1024).toFixed(1);
}

async function heap(client) {
  const { result } = await client.send("Runtime.evaluate", {
    expression: "performance.memory ? performance.memory.usedJSHeapSize : 0",
    returnByValue: true,
  });
  return result.value;
}

const browser = await chromium.launch({ args: ["--enable-precise-memory-info"] });
const page = await browser.newPage();
const client = await page.context().newCDPSession(page);
await page.goto("http://localhost:5173/");
await page.getByTestId("studio-shell").waitFor({ timeout: 15000 });
await page.waitForTimeout(2000);
const baseline = await heap(client);
console.log(`baseline heap (shell, 1 panel): ${mb(baseline)} MB`);

for (const p of PANELS.slice(1)) {
  await page.getByTestId("open-palette").click();
  await page.keyboard.type(p.replace(/-/g, " ").slice(0, 12));
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
}
await page.waitForTimeout(3000);
const allPanels = await heap(client);
console.log(`heap after opening all ${PANELS.length} panels: ${mb(allPanels)} MB`);

// soak: cycle through tabs, sampling heap
const stopAt = Date.now() + soakS * 1000;
const samples = [];
let i = 0;
while (Date.now() < stopAt) {
  const tab = PANELS[i % PANELS.length];
  await page.getByText(`panel-${tab}`, { exact: true }).click().catch(() => {});
  await page.waitForTimeout(1500);
  i += 1;
  if (i % 4 === 0) samples.push(await heap(client));
}
const final = await heap(client);
const min = Math.min(...samples);
const max = Math.max(...samples);
console.log(`soak ${soakS}s: ${i} tab switches, heap samples ${samples.length}`);
console.log(`heap start=${mb(baseline)} afterPanels=${mb(allPanels)} soakMin=${mb(min)} soakMax=${mb(max)} final=${mb(final)} MB`);
console.log(`growth over soak (max-min): ${mb(max - min)} MB`);

await browser.close();
