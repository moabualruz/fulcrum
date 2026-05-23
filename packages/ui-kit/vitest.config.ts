import { svelte } from "@sveltejs/vite-plugin-svelte";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig, mergeConfig } from "vitest/config";

import commonConfig from "../../vitest.config.ts";

const uiKitConfig = defineConfig({
  root: new URL(".", import.meta.url).pathname,
  plugins: [svelte()],
  test: {
    include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: "chromium" }],
    },
  },
});

export default mergeConfig(commonConfig, uiKitConfig);
