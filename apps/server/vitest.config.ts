import { cpus } from "node:os";

import { defineConfig, mergeConfig } from "vitest/config";

import commonConfig from "../../vitest.config.ts";

const serverConfig = defineConfig({
  root: new URL(".", import.meta.url).pathname,
  resolve: {
    alias: {
      "@agent-client-protocol": new URL(
        "../../services/agent-client-protocol/src",
        import.meta.url,
      ).pathname,
      "@execution-orchestration": new URL(
        "../../services/execution-orchestration/src",
        import.meta.url,
      ).pathname,
      "@feature-flags": new URL("../../services/feature-flags/src", import.meta.url).pathname,
      "@identity-access": new URL("../../services/identity-access/src", import.meta.url).pathname,
      "@integration-hub": new URL("../../services/integration-hub/src", import.meta.url).pathname,
      "@knowledge-workspace": new URL(
        "../../services/knowledge-workspace/src",
        import.meta.url,
      ).pathname,
      "@notification-center": new URL(
        "../../services/notification-center/src",
        import.meta.url,
      ).pathname,
      "@planning-review": new URL("../../services/planning-review/src", import.meta.url).pathname,
      "@platform-core": new URL("../../services/platform-core/src", import.meta.url).pathname,
      "@workflow-coordination": new URL(
        "../../services/workflow-coordination/src",
        import.meta.url,
      ).pathname,
      "@work-management": new URL("../../services/work-management/src", import.meta.url).pathname,
    },
  },
  test: {
    include: ["test/**/*.vitest.test.ts", "src/**/*.vitest.test.ts"],
    setupFiles: ["./test/setup.ts"],
    pool: "threads",
    isolate: true,
    maxWorkers: Math.max(1, cpus().length - 1),
  },
});

export default mergeConfig(commonConfig, serverConfig);
