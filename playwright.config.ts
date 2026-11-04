import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  // workers:1 — sidecar-kill.spec.ts kills the real sidecar process; it must
  // not race the other specs' HTTP calls (files run alphabetically, kill test
  // first, respawn before smoke runs)
  workers: 1,
  use: {
    baseURL: "http://localhost:5173",
    trace: "off",
  },
  retries: 1,
  timeout: 30_000,
  webServer: [
    {
      command: "uv run uvicorn pyrobostudio_sidecar.server:app --host 127.0.0.1 --port 8787",
      url: "http://127.0.0.1:8787/capabilities",
      reuseExistingServer: true,
      timeout: 60_000,
      cwd: "sidecar",
    },
    {
      command: "npx vite --port 5173 --strictPort",
      url: "http://localhost:5173",
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
