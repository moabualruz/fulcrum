import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  resolve: {
    conditions: ["browser"],
    alias: {
      "$app/environment": new URL("./tests/mocks/app-environment.ts", import.meta.url).pathname,
      "$app/forms": new URL("./tests/mocks/app-forms.ts", import.meta.url).pathname,
      "$app/navigation": new URL("./tests/mocks/app-navigation.ts", import.meta.url).pathname,
      "$app/state": new URL("./tests/mocks/app-state.ts", import.meta.url).pathname,
      $lib: new URL("./src/lib", import.meta.url).pathname,
      "@": new URL("../../src", import.meta.url).pathname,
      "@fulcrum/cli": new URL("../cli/src", import.meta.url).pathname,
      "@fulcrum/server": new URL("../server/src", import.meta.url).pathname,
      "@fulcrum/tui": new URL("../tui/src", import.meta.url).pathname,
      "@fulcrum/web": new URL("./src", import.meta.url).pathname,
    },
  },
  test: {
    environment: "happy-dom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/vitest/**/*.test.ts"],
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
