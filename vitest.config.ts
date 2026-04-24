import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["tests/setup/test-env.ts"],
    include: ["tests/**/*.test.ts"]
  },
  resolve: {
    alias: {
      "@fulcrum/shared": "/packages/shared/src/index.ts",
      "@fulcrum/code-tools": "/packages/code-tools/src/index.ts",
      "@fulcrum/core": "/packages/core/src/index.ts",
      "@fulcrum/db": "/packages/db/src/index.ts",
      "@fulcrum/agents": "/packages/agents/src/index.ts",
      "@fulcrum/memory": "/packages/memory/src/index.ts",
      "@fulcrum/mcp": "/packages/mcp/src/index.ts",
      "@fulcrum/plane": "/packages/plane/src/index.ts",
      "@fulcrum/policy": "/packages/policy/src/index.ts"
    }
  }
});
