// Preload-only Bun plugin used by `bunfig.toml` so that this loader is
// registered before any test file's top-level imports. The sibling
// `ui-primitives.smoke.test.ts` registers a CLIENT-mode `.svelte` loader at
// its own top-level; without preload, whichever file Bun loads first wins
// the `onLoad({ filter: /\.svelte$/ })` slot. Preloading this SSR loader
// ensures `svelte/server`'s `render()` always sees server-compiled output —
// and the smoke test's "is component a function" check still passes since
// server-mode components are also plain functions.
import { plugin } from "bun";
import { compile, compileModule } from "svelte/compiler";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const cwd = process.cwd();
const webRoot = cwd.endsWith("/src/web") ? cwd : join(cwd, "src/web");
const webSrc = join(webRoot, "src");

function resolveModulePath(path: string): string {
  if (existsSync(path)) return path;
  for (const ext of [".ts", ".js", ".svelte"]) {
    if (existsSync(`${path}${ext}`)) return `${path}${ext}`;
  }
  return path;
}

plugin({
  name: "svelte-ssr-loader",
  setup(build) {
    build.onResolve({ filter: /^\$lib\// }, (args) => ({
      path: resolveModulePath(resolve(webSrc, args.path.replace(/^\$lib\//, "lib/"))),
    }));
    build.onLoad({ filter: /\.svelte$/ }, (args) => {
      const source = readFileSync(args.path, "utf8");
      const { js } = compile(source, {
        filename: args.path,
        generate: "server",
        dev: false,
      });
      return { contents: js.code, loader: "js" };
    });
    build.onLoad({ filter: /\.svelte\.(js|ts)$/ }, (args) => {
      const source = readFileSync(args.path, "utf8");
      const { js } = compileModule(source, {
        filename: args.path,
        generate: "server",
        dev: false,
      });
      return { contents: js.code, loader: "js" };
    });
  },
});
