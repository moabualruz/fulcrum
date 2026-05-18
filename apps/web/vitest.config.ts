import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, mergeConfig } from "vitest/config";

import commonConfig from "../../vitest.config.ts";

const webConfig = defineConfig({
  root: new URL(".", import.meta.url).pathname,
  plugins: [tailwindcss(), svelte()],
  resolve: {
    conditions: ["browser"],
    alias: {
      "$app/environment": new URL("./tests/mocks/app-environment.ts", import.meta.url).pathname,
      "$app/forms": new URL("./tests/mocks/app-forms.ts", import.meta.url).pathname,
      "$app/navigation": new URL("./tests/mocks/app-navigation.ts", import.meta.url).pathname,
      "$app/state": new URL("./tests/mocks/app-state.ts", import.meta.url).pathname,
      $lib: new URL("./src/lib", import.meta.url).pathname,
      "@fulcrum/cli": new URL("../cli/src", import.meta.url).pathname,
      "@fulcrum/server": new URL("../server/src", import.meta.url).pathname,
      "@fulcrum/tui": new URL("../tui/src", import.meta.url).pathname,
      "@fulcrum/web": new URL("./src", import.meta.url).pathname,
      "@agent-client-protocol": new URL("../../services/agent-client-protocol/src", import.meta.url)
        .pathname,
      "@execution-orchestration": new URL(
        "../../services/execution-orchestration/src",
        import.meta.url,
      ).pathname,
      "@feature-flags": new URL("../../services/feature-flags/src", import.meta.url).pathname,
      "@identity-access": new URL("../../services/identity-access/src", import.meta.url).pathname,
      "@integration-hub": new URL("../../services/integration-hub/src", import.meta.url).pathname,
      "@knowledge-workspace": new URL("../../services/knowledge-workspace/src", import.meta.url)
        .pathname,
      "@notification-center": new URL("../../services/notification-center/src", import.meta.url)
        .pathname,
      "@planning-review": new URL("../../services/planning-review/src", import.meta.url)
        .pathname,
      "@platform-core": new URL("../../services/platform-core/src", import.meta.url).pathname,
      "@workflow-coordination": new URL(
        "../../services/workflow-coordination/src",
        import.meta.url,
      ).pathname,
      "@work-management": new URL("../../services/work-management/src", import.meta.url).pathname,
    },
  },
  test: {
    name: "web-node",
    environment: "happy-dom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/vitest/**/*.test.ts"],
    exclude: ["tests/vitest/**/*.browser.test.ts"],
    coverage: {
      provider: "v8",
      include: [
        "src/routes/settings/errors/+page.server.ts",
        "src/routes/settings/errors/+page.svelte",
        "src/routes/settings/i18n/+page.server.ts",
        "src/routes/settings/telemetry/+page.server.ts",
        "src/routes/settings/telemetry/+page.svelte",
        "src/lib/components/tasks/CriticalPath.ts",
        "src/lib/components/tasks/TaskDescriptionEditor.svelte",
        "src/lib/components/tasks/task-description.ts",
        "src/lib/components/tasks/task-timeline.ts",
      ],
      thresholds: {
        lines: 80,
      },
    },
  },
});

export default mergeConfig(commonConfig, webConfig);
