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
import { readFileSync } from "node:fs";

plugin({
  name: "svelte-ssr-loader",
  setup(build) {
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
