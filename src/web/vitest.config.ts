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
      $lib: new URL("./src/lib", import.meta.url).pathname,
    },
  },
  test: {
    environment: "happy-dom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/vitest/**/*.test.ts"],
  },
});
