import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const browserConfig = defineConfig({
  root: new URL(".", import.meta.url).pathname,
  test: {
    name: "web-browser",
    include: ["src/**/*.svelte.browser.test.ts", "tests/vitest/**/*.browser.test.ts"],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: "chromium" }],
    },
  },
});

export default browserConfig;
