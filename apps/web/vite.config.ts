import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import ts from "typescript";
import { defineConfig, type Plugin } from "vite";

function transformRepoDecorators(): Plugin {
  return {
    name: "fulcrum:repo-decorators",
    enforce: "pre",
    async transform(code, id) {
      const path = id.split("?", 1)[0] ?? id;

      if (!path.endsWith(".ts") || path.includes("/apps/web/") || !path.includes("/src/")) {
        return null;
      }

      const output = ts.transpileModule(code, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          experimentalDecorators: true,
          useDefineForClassFields: true,
          verbatimModuleSyntax: true,
          sourceMap: true,
        },
        fileName: path,
      });

      return {
        code: output.outputText,
        map: output.sourceMapText ? JSON.parse(output.sourceMapText) : null,
      };
    },
  };
}

export default defineConfig({
  plugins: [transformRepoDecorators(), tailwindcss(), sveltekit()],
  resolve: {
    alias: {
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
      "@identity-access": new URL("../../services/identity-access/src", import.meta.url).pathname,
      "@integration-hub": new URL("../../services/integration-hub/src", import.meta.url).pathname,
      "@knowledge-workspace": new URL("../../services/knowledge-workspace/src", import.meta.url)
        .pathname,
      "@notification-center": new URL("../../services/notification-center/src", import.meta.url)
        .pathname,
      "@planning-review": new URL("../../services/planning-review/src", import.meta.url)
        .pathname,
      "@platform-core": new URL("../../services/platform-core/src", import.meta.url).pathname,
      "@test-support": new URL("../../tests/support", import.meta.url).pathname,
      "@workflow-coordination": new URL(
        "../../services/workflow-coordination/src",
        import.meta.url,
      ).pathname,
      "@work-management": new URL("../../services/work-management/src", import.meta.url).pathname,
    },
  },
});
