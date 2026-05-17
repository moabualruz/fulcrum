import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const INTERFACE_PARITY_TEST_FILES = [
  "services/work-management/src/application/tasks/interface-parity.test.ts",
  "services/work-management/src/application/sprints/interface-parity.test.ts",
  "services/execution-orchestration/src/application/runs/interface-parity.test.ts",
  "services/workflow-coordination/src/application/artifacts/interface-parity.test.ts",
  "services/platform-core/src/application/settings/interface-parity.test.ts",
  "services/knowledge-workspace/src/application/search/interface-parity.test.ts",
  "apps/server/src/api/__tests__/interface-parity.test.ts",
  "apps/cli/src/application-parity.test.ts",
  "apps/tui/src/__tests__/interface-parity.test.ts",
  "apps/web/tests/e2e/cross-interface-parity.spec.ts",
] as const;

describe("interface aggregate interface parity proof", () => {
  test("every owned parity proof asserts application-created or indexed data by stable id", () => {
    for (const file of INTERFACE_PARITY_TEST_FILES) {
      const source = readFileSync(file, "utf8");
      expect(source, `${file} must assert stable IDs`).toMatch(/created\.id|entityId|project\.id|seed[A-Za-z]+\(/);
      expect(source, `${file} must not accept empty-array stubs`).not.toMatch(/toEqual\(\[\]\)|return\s+\[\]/);
    }
  });

  test("web parity spec has no skip helper or skipped critical checks", () => {
    const source = readFileSync("apps/web/tests/e2e/cross-interface-parity.spec.ts", "utf8");
    expect(source).not.toContain("gotoOrSkip");
    expect(source).not.toMatch(/\btest\.skip\b|\.skip\(/);
    expect(source).toMatch(/response\?\.ok\(\)/);
  });
});

const WORKFLOW_CLIENT_ROOTS = ["apps/web/src", "apps/cli/src", "apps/tui/src"];
const WORKFLOW_DIRECT_PERSISTENCE = new RegExp(
  [
    `@mikro-${"orm"}`,
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
const WORKFLOW_ALLOWED_COMPOSITION_ROOTS = new Map([
  ["apps/cli/src/index.ts", "CLI composition root wires app database bindings"],
  ["apps/cli/src/commands/db.ts", "CLI db command delegates to application db/reset services"],
  ["apps/web/src/hooks.server.ts", "SvelteKit hook passes request-scoped EntityManager into server context"],
  ["apps/web/src/app.d.ts", "SvelteKit Locals type declaration for request-scoped EntityManager"],
  ["apps/web/src/lib/server/db.ts", "Web DB composition root opens/forks app database"],
  ["apps/web/src/lib/server/application-scope.ts", "Web application scope adapter receives request EntityManager"],
]);

async function collectWorkflowContractSource(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return collectWorkflowContractSource(path);
    if (!entry.isFile()) return [];
    if (!/\.(ts|svelte)$/.test(path)) return [];
    if (path.endsWith(".test.ts") || path.endsWith(".spec.ts") || path.includes("/__tests__/")) return [];
    return [path];
  }));
  return nested.flat();
}

describe("workflow client interface boundary", () => {
  test("Web, CLI, and TUI client surfaces avoid direct runtime persistence outside composition roots", async () => {
    const files = (await Promise.all(WORKFLOW_CLIENT_ROOTS.map(collectWorkflowContractSource))).flat();
    const violations: string[] = [];

    for (const file of files) {
      const rel = relative(process.cwd(), file);
      if (WORKFLOW_ALLOWED_COMPOSITION_ROOTS.has(rel)) continue;
      const source = await readFile(file, "utf8");
      if (WORKFLOW_DIRECT_PERSISTENCE.test(source)) violations.push(rel);
    }

    expect(violations.sort()).toEqual([]);
  });
});
