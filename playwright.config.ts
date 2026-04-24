import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry"
  }
});
