import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  retries: 0,
  webServer: {
    command: "pnpm --filter @fulcrum/cockpit exec vite --host 127.0.0.1 --port 4174",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: true
  },
  use: {
    baseURL: "http://127.0.0.1:4174",
    trace: "on-first-retry"
  }
});
