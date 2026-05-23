import { cpus } from "node:os";

import { defineConfig } from "vitest/config";

const maxThreads = Math.max(1, cpus().length - 1);

export const commonTestConfig = {
  pool: "threads" as const,
  isolate: true,
  maxWorkers: maxThreads,
};

export default defineConfig({
  test: commonTestConfig,
});
