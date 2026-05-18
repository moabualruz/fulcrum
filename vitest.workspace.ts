import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "./apps/web/vitest.config.ts",
      "./apps/server/vitest.config.ts",
      "./packages/ui-kit/vitest.config.ts",
    ],
  },
});
