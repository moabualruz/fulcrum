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
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const webRoot = join(import.meta.dir, "../..");
const tsTranspiler = new Bun.Transpiler({ loader: "ts", target: "bun" });

// ---------------------------------------------------------------------------
// Svelte export-condition shim.
//
// Many Svelte-ecosystem dependencies key their `exports` map on the `svelte`
// condition: some ship ONLY `svelte` + `types` (`runed`, `svelte-toolbelt`,
// `mode-watcher`, `formsnap`, `svelte-tiptap`, `wx-svelte-gantt`), others ship
// a `svelte` entry alongside a prebuilt `default` whose public API differs
// (`@event-calendar/core` exposes `Calendar` only via its `svelte` entry).
// SvelteKit's bundler injects the `svelte` condition so the project always
// resolves the Svelte build; the bare `bun test` runtime resolver does not.
// Bun honours `--conditions=svelte` but offers no `bunfig.toml` equivalent,
// and plugin `onResolve` never fires for bare node_modules specifiers — so the
// durable in-repo fix is to point each package's `default` condition at its
// `svelte` entry, matching SvelteKit's resolution. Idempotent; runs once per
// test process before any test imports.
// ---------------------------------------------------------------------------
function ensureDefaultExportCondition(): void {
  const storeRoot = findBunStoreRoot(webRoot);
  if (!storeRoot) return;
  for (const storeEntry of safeReaddir(storeRoot)) {
    const nestedModules = join(storeRoot, storeEntry, "node_modules");
    if (!existsSync(nestedModules)) continue;
    for (const pkgDir of safeReaddir(nestedModules)) {
      if (pkgDir.startsWith(".")) continue;
      if (pkgDir.startsWith("@")) {
        // Scoped package directory — descend one more level to `@scope/name`.
        for (const scopedName of safeReaddir(join(nestedModules, pkgDir))) {
          patchPackageExports(join(nestedModules, pkgDir, scopedName, "package.json"));
        }
        continue;
      }
      patchPackageExports(join(nestedModules, pkgDir, "package.json"));
    }
  }
}

function findBunStoreRoot(start: string): string | null {
  let dir = start;
  for (let i = 0; i < 12; i++) {
    const candidate = join(dir, "node_modules", ".bun");
    if (existsSync(candidate)) return candidate;
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function patchPackageExports(packageJsonPath: string): void {
  if (!existsSync(packageJsonPath)) return;
  let meta: Record<string, unknown>;
  let raw: string;
  try {
    raw = readFileSync(packageJsonPath, "utf8");
    meta = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return;
  }
  const exportsField = meta["exports"];
  if (!exportsField || typeof exportsField !== "object" || Array.isArray(exportsField)) return;
  const dotEntry = (exportsField as Record<string, unknown>)["."];
  if (!dotEntry || typeof dotEntry !== "object" || Array.isArray(dotEntry)) return;
  const conditions = dotEntry as Record<string, unknown>;
  const svelteEntry = conditions["svelte"];
  if (typeof svelteEntry !== "string") return;
  // Point the bare-runtime conditions at the `svelte` entry so `bun test`
  // resolves the same build SvelteKit would. Skip when already aligned.
  if (conditions["default"] === svelteEntry && conditions["import"] === svelteEntry) return;
  conditions["default"] = svelteEntry;
  conditions["import"] = svelteEntry;
  try {
    writeFileSync(packageJsonPath, `${JSON.stringify(meta, null, 2)}\n`);
  } catch {
    // Read-only store — nothing else we can safely do; tests for those
    // packages will surface the original resolution error.
  }
}

ensureDefaultExportCondition();

plugin({
  name: "svelte-ssr-loader",
  setup(build) {
    build.onResolve({ filter: /^\$lib\// }, (args) => {
      const path = join(webRoot, "lib", args.path.slice("$lib/".length));
      if (path.endsWith(".js") && existsSync(path.slice(0, -3) + ".ts")) {
        return { path: path.slice(0, -3) + ".ts" };
      }
      return { path };
    });
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
      const moduleSource = args.path.endsWith(".ts") ? tsTranspiler.transformSync(source) : source;
      const { js } = compileModule(moduleSource, {
        filename: args.path,
        generate: "server",
        dev: false,
      });
      return { contents: js.code, loader: "js" };
    });
  },
});
