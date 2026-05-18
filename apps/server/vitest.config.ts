import { cpus } from "node:os";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./test/setup.ts"],
    pool: "threads",
    poolOptions: {
      threads: {
        isolate: true,
        maxThreads: Math.max(1, cpus().length - 1),
      },
    },
  },
});
