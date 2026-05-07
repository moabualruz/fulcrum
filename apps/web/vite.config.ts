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
          experimentalDecorators: false,
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
      "@": new URL("../../src", import.meta.url).pathname,
      "@fulcrum/cli": new URL("../cli/src", import.meta.url).pathname,
      "@fulcrum/server": new URL("../server/src", import.meta.url).pathname,
      "@fulcrum/tui": new URL("../tui/src", import.meta.url).pathname,
      "@fulcrum/web": new URL("./src", import.meta.url).pathname,
    },
  },
});
