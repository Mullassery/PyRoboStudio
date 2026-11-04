import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

/**
 * Phase 6 hardening: Content-Security-Policy on the production build only.
 * Dev is exempt (vite HMR/react-refresh need inline scripts). The policy
 * matches docs/architecture/security-model.md §2: everything self, localhost
 * connections for the sidecar + foxglove WS, style-attr allowed (panels use
 * inline style attributes, no inline <script> in the built output).
 */
const cspMeta = (): import("vite").Plugin => ({
  name: "csp-meta-prod-only",
  apply: "build",
  transformIndexHtml(html) {
    const csp = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self' http://127.0.0.1:8787 ws://127.0.0.1:9887 ws://localhost:*",
      // frame-ancestors is header-only (ignored in meta) — clickjacking
      // hardening needs server headers, tracked in security-model §7
      "base-uri 'self'",
      "form-action 'none'",
    ].join("; ");
    return html.replace(
      /<head>/,
      `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
    );
  },
});

export default defineConfig({
  plugins: [react(), tailwindcss(), cspMeta()],
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["src/test/setup.ts"],
    exclude: [
      "**/node_modules/**",
      "tests/e2e/**",
    ],
  },
});
