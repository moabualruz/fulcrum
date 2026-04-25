import { defineConfig } from "@playwright/test";

delete process.env.NO_COLOR;

export default defineConfig({
  testDir: "tests/e2e",
  retries: 0,
  webServer: [
    {
      command:
        "FULCRUM_STATE_ROOT=.tmp/e2e-state FULCRUM_PORT=4173 pnpm --filter @fulcrum/server dev",
      url: "http://127.0.0.1:4173/api/v1/projects",
      reuseExistingServer: true
    },
    {
      command: "pnpm --filter @fulcrum/cockpit exec vite --host 127.0.0.1 --port 4174",
      url: "http://127.0.0.1:4174",
      reuseExistingServer: true
    }
  ],
  use: {
    baseURL: "http://127.0.0.1:4174",
    trace: "on-first-retry"
  }
});
