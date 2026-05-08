import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const PLAN_39_TEST_FILES = [
  "src/application/tasks/interface-parity.test.ts",
  "src/application/sprints/interface-parity.test.ts",
  "src/application/runs/interface-parity.test.ts",
  "src/application/artifacts/interface-parity.test.ts",
  "src/application/settings/interface-parity.test.ts",
  "src/application/search/interface-parity.test.ts",
  "apps/server/src/api/__tests__/phase95-interface-parity.test.ts",
  "apps/cli/src/application-parity.test.ts",
  "apps/tui/src/__tests__/phase95-interface-parity.test.ts",
  "apps/web/tests/e2e/phase95-cross-interface-parity.spec.ts",
] as const;

describe("Phase 09.5 aggregate interface parity proof", () => {
  test("every owned parity proof asserts application-created or indexed data by stable id", () => {
    for (const file of PLAN_39_TEST_FILES) {
      const source = readFileSync(file, "utf8");
      expect(source, `${file} must assert stable IDs`).toMatch(/created\.id|entityId|project\.id|seed[A-Za-z]+\(/);
      expect(source, `${file} must not accept empty-array stubs`).not.toMatch(/toEqual\(\[\]\)|return\s+\[\]/);
    }
  });

  test("web parity spec has no skip helper or skipped critical checks", () => {
    const source = readFileSync("apps/web/tests/e2e/phase95-cross-interface-parity.spec.ts", "utf8");
    expect(source).not.toContain("gotoOrSkip");
    expect(source).not.toMatch(/\btest\.skip\b|\.skip\(/);
    expect(source).toMatch(/response\?\.ok\(\)/);
  });
});

const PHASE96_CLIENT_ROOTS = ["apps/web/src", "apps/cli/src", "apps/tui/src"];
const PHASE96_DIRECT_PERSISTENCE = new RegExp(
  [
    "@mikro-orm",
    `Product${"Db"}`,
    `product-${"kernel"}/db`,
    "db/entities",
    "db/repositories",
    "ENTITY_MANAGER_TOKEN",
    "registerDbBindings",
    String.raw`\.persist\(`,
    String.raw`\.flush\(`,
  ].join("|"),
);
const PHASE96_ALLOWED_COMPOSITION_ROOTS = new Map([
  ["apps/cli/src/index.ts", "CLI composition root wires app database bindings"],
  ["apps/cli/src/commands/db.ts", "CLI db command delegates to application db/reset services"],
  ["apps/web/src/hooks.server.ts", "SvelteKit hook passes request-scoped EntityManager into server context"],
  ["apps/web/src/app.d.ts", "SvelteKit Locals type declaration for request-scoped EntityManager"],
  ["apps/web/src/lib/server/db.ts", "Web DB composition root opens/forks app database"],
  ["apps/web/src/lib/server/application-scope.ts", "Web application scope adapter receives request EntityManager"],
]);

async function collectPhase96Source(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return collectPhase96Source(path);
    if (!entry.isFile()) return [];
    if (!/\.(ts|svelte)$/.test(path)) return [];
    if (path.endsWith(".test.ts") || path.endsWith(".spec.ts") || path.includes("/__tests__/")) return [];
    return [path];
  }));
  return nested.flat();
}

describe("Phase 09.6 client interface boundary", () => {
  test("Web, CLI, and TUI client surfaces avoid direct runtime persistence outside composition roots", async () => {
    const files = (await Promise.all(PHASE96_CLIENT_ROOTS.map(collectPhase96Source))).flat();
    const violations: string[] = [];

    for (const file of files) {
      const rel = relative(process.cwd(), file);
      if (PHASE96_ALLOWED_COMPOSITION_ROOTS.has(rel)) continue;
      const source = await readFile(file, "utf8");
      if (PHASE96_DIRECT_PERSISTENCE.test(source)) violations.push(rel);
    }

    expect(violations.sort()).toEqual([]);
  });
});
