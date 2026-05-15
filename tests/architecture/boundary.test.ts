import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, test } from "bun:test";

const INTERFACE_ROOTS = [
  "apps/cli/src",
  "apps/tui/src",
  "apps/server/src/router",
];

const RUNTIME_ADAPTER_ROOTS = [
  "apps/web/src/routes",
  "apps/web/src/lib/server",
  "apps/server/src/api/routes",
  "apps/server/src/trpc",
];

const RESIDUAL_INTERFACE_ROOTS = [
  "apps/web/src/routes",
  "apps/web/src/lib",
  "apps/cli/src",
  "apps/tui/src",
  "apps/server/src/api",
  "apps/server/src/router",
  "apps/server/src/trpc",
  "apps/server/src/trpc",
];

const TEST_FIXTURE_ROOTS = ["tests/support", "apps/web/tests"];

const NON_WEB_INVENTORY_ROOTS = [
  "services/platform-core/src/application/db",
  "services/platform-core/src/infrastructure/application-database",
  "services/knowledge-workspace/src/application/search",
  "services/knowledge-workspace/src/application/docs",
  "services/knowledge-workspace/src/application/collaboration",
  "services/integration-hub/src/application/external-connectors",
  "services/platform-core/src/application/health-checks/checks",
  "services/execution-orchestration/src/infrastructure/agent-runtime/symphony",
  "services/platform-core/src/infrastructure/doctor",
];

const SERVICE_DOMAIN_ROOTS = [
  "services/agent-client-protocol/src/domain",
  "services/execution-orchestration/src/domain",
  "services/identity-access/src/domain",
  "services/integration-hub/src/domain",
  "services/knowledge-workspace/src/domain",
  "services/notification-center/src/domain",
  "services/planning-review/src/domain",
  "services/platform-core/src/domain",
  "services/work-management/src/domain",
  "services/workflow-coordination/src/domain",
];

const LEGACY_DB_TERMS = [
  `open${"Pglite"}`,
  `open${"Product"}${"Db"}`,
  `get${"Product"}${"Db"}`,
  `${"Product"}${"Db"}`,
] as const;

const FORBIDDEN_INTERFACE_ACCESS = new RegExp(
  [
    String.raw`\b(${LEGACY_DB_TERMS.join("|")})\b`,
    String.raw`from\s+["'][^"']*product-${"kernel"}[^"']*["']`,
  ].join("|"),
);

const FORBIDDEN_TEST_FIXTURE_ACCESS = new RegExp(
  [
    String.raw`\b(${LEGACY_DB_TERMS.join("|")})\b`,
    String.raw`from\s+["'][^"']*product-${"kernel"}[^"']*["']`,
  ].join("|"),
);

const FORBIDDEN_RESIDUAL_DIRECT_ACCESS = new RegExp(
  [
    String.raw`\bctx\.em\b`,
    String.raw`\bem\.(find|findOne|create|persist|flush|transactional)\b`,
    String.raw`\bgetRepository\(`,
    String.raw`from\s+["'][^"']*(db/entities|db/repositories|db\.module|mikro-orm\.config)[^"']*["']`,
  ].join("|"),
);

const FORBIDDEN_INTERFACE_STUB_DATA_PROVIDERS = new RegExp(
  [
    String.raw`\bIn-memory stub store`,
    String.raw`\bIn-memory stub stores`,
    String.raw`\bconst\s+_[A-Za-z0-9_]+\s*:\s*Map\b`,
    String.raw`\bconst\s+_[A-Za-z0-9_]+\s*:\s*[^=]*\[\]\s*=`,
    String.raw`\bconst\s+_[A-Za-z0-9_]+\s*=\s*\[\]`,
    String.raw`\bnew\s+Map(?:<.*>)?\(\)`,
    String.raw`\bpretend we fetched\b`,
  ].join("|"),
);

const RESIDUAL_DIRECT_ACCESS_COMPOSITION_ROOTS = new Map([
  [
    "apps/server/src/trpc/context.ts",
    "tRPC context composition root still carries EntityManager during staged router migration",
  ],
]);

const EXPECTED_RESIDUAL_DIRECT_ACCESS_FILES: string[] = [];

const SERVICE_ROUTER_FILES = [
  "apps/server/src/trpc/routers/comments.ts",
  "apps/server/src/trpc/routers/doc-templates.ts",
  "apps/server/src/trpc/routers/docs.ts",
  "apps/server/src/trpc/routers/skills.ts",
  "apps/server/src/trpc/routers/sprints.ts",
  "apps/server/src/trpc/routers/templates.ts",
];

const LEGACY_CLI_FILES = [
  "apps/cli/src/docs-templates.ts",
  "apps/cli/src/commands/export.ts",
  "apps/cli/src/commands/import.ts",
  "apps/cli/src/commands/auth.ts",
  "apps/cli/src/commands/flags.ts",
  "apps/cli/src/commands/project-config.ts",
  "apps/cli/src/commands/report.ts",
  "apps/cli/src/commands/task-hierarchy.ts",
  "apps/cli/src/commands/task-relate.ts",
  "apps/cli/src/commands/symphony.ts",
  "apps/cli/src/commands/pillar14-generated.ts",
];

const RUNTIME_CLI_FILES = [
  "apps/cli/src/commands/comment.ts",
  "apps/cli/src/commands/context.ts",
  "apps/cli/src/commands/my-work.ts",
  "apps/cli/src/commands/repos.ts",
];

const FORBIDDEN_CLI_DIRECT_ACCESS = new RegExp(
  [
    String.raw`from\s+["'][^"']*(@mikro-orm/postgresql|db/entities|db/repositories|db\.module|mikro-orm\.config)[^"']*["']`,
    String.raw`import\(["'][^"']*(@mikro-orm/postgresql|db/entities|db/repositories|db\.module|mikro-orm\.config)[^"']*["']\)`,
    String.raw`\bENTITY_MANAGER_TOKEN\b`,
    String.raw`\bregisterDbBindings\b`,
    String.raw`\bnew\s+MikroORM\b`,
    String.raw`\bem\.(find|findOne|create|persist|flush|transactional|getRepository)\b`,
    String.raw`\borm\.em\b`,
    String.raw`\bcontainer\.get\(ENTITY_MANAGER_TOKEN\)`,
  ].join("|"),
);

const FORBIDDEN_SERVICE_LEGACY_REPORT_CONTRACTS = new RegExp(
  String.raw`from\s+["'][^"']*src/application/reports/types\.ts["']`,
);

const FORBIDDEN_DOMAIN_APPLICATION_IMPORT = new RegExp(
  String.raw`from\s+["'][^"']*/application/[^"']*["']`,
);

const FORBIDDEN_WEB_TRPC_RUNTIME_IMPORT = new RegExp(
  String.raw`(?:from|import\()\s*["'][^"']*(?:@trpc/server|@fulcrum/server/trpc)[^"']*["']`,
);

async function collectSourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(path);
    if (!entry.isFile()) return [];
    if (!path.endsWith(".ts") && !path.endsWith(".svelte")) return [];
    if (path.endsWith(".test.ts") || path.endsWith(".spec.ts") || path.includes("/__tests__/")) return [];
    if (path.includes("/node_modules/") || path.includes("/.svelte-kit/")) return [];
    return [path];
  }));
  return files.flat();
}

async function collectTestFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return collectTestFiles(path);
    if (!entry.isFile()) return [];
    if (path.includes("/node_modules/") || path.includes("/.svelte-kit/")) return [];
    if (path.endsWith(".test.ts") || path.endsWith(".spec.ts") || path.includes("apps/web/tests/")) {
      return [path];
    }
    return [];
  }));
  return files.flat();
}

async function violations(roots: readonly string[], pattern: RegExp): Promise<string[]> {
  const files = (await Promise.all(roots.map(collectSourceFiles))).flat();
  const found: string[] = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    if (pattern.test(text)) found.push(relative(process.cwd(), file));
  }
  return found.sort();
}

async function residualDirectAccessViolations(): Promise<string[]> {
  const files = (await Promise.all(RESIDUAL_INTERFACE_ROOTS.map(collectSourceFiles))).flat();
  const found: string[] = [];
  for (const file of files) {
    const relativePath = relative(process.cwd(), file);
    if (RESIDUAL_DIRECT_ACCESS_COMPOSITION_ROOTS.has(relativePath)) continue;
    const text = await readFile(file, "utf8");
    if (FORBIDDEN_RESIDUAL_DIRECT_ACCESS.test(text)) found.push(relativePath);
  }
  return Array.from(new Set(found)).sort();
}

async function directAccessInExactFiles(files: readonly string[]): Promise<string[]> {
  const found: string[] = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    if (FORBIDDEN_RESIDUAL_DIRECT_ACCESS.test(text)) found.push(file);
  }
  return found.sort();
}

async function patternInExactFiles(files: readonly string[], pattern: RegExp): Promise<string[]> {
  const found: string[] = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    if (pattern.test(text)) found.push(file);
  }
  return found.sort();
}

async function testFixtureViolations(roots: readonly string[], pattern: RegExp): Promise<string[]> {
  const files = Array.from(new Set((await Promise.all(roots.map(collectTestFiles))).flat()));
  const found: string[] = [];
  for (const file of files) {
    if (relative(process.cwd(), file).startsWith("services/platform-core/src/infrastructure/product-store/")) continue;
    const text = await readFile(file, "utf8");
    if (pattern.test(text)) found.push(relative(process.cwd(), file));
  }
  return found.sort();
}

async function testImportViolations(roots: readonly string[], pattern: RegExp): Promise<string[]> {
  const files = Array.from(new Set((await Promise.all(roots.map(collectTestFiles))).flat()));
  const found: string[] = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    if (pattern.test(text)) found.push(relative(process.cwd(), file));
  }
  return found.sort();
}

describe("interface interface boundary", () => {
  test("interfaces do not import product-kernel or open legacy database handles directly", async () => {
    expect(await violations(INTERFACE_ROOTS, FORBIDDEN_INTERFACE_ACCESS)).toEqual([]);
  });

  test("web API tRPC runtime adapters do not import product-kernel or open legacy database handles directly", async () => {
    const found = await violations(RUNTIME_ADAPTER_ROOTS, FORBIDDEN_INTERFACE_ACCESS);
    expect(found).toEqual([]);
  });

  test("non-web code does not import product-kernel or expose legacy database names", async () => {
    const found = await violations(NON_WEB_INVENTORY_ROOTS, FORBIDDEN_INTERFACE_ACCESS);
    expect(found).toEqual([]);
  });

  test("test fixtures do not import product-kernel or open database handles directly", async () => {
    const found = await testFixtureViolations(TEST_FIXTURE_ROOTS, FORBIDDEN_TEST_FIXTURE_ACCESS);
    expect(found).toEqual([]);
  });

  test("subscription transport does not import or depend on embedded database internals directly", async () => {
    expect(await violations(["services/platform-core/src/application/subscriptions"], /\bPGlite\b|\bpglite\b/)).toEqual([]);
  });

  test("interface adapters do not use ORM/entity/repository access outside exact composition roots", async () => {
    const found = await residualDirectAccessViolations();
    expect(RESIDUAL_DIRECT_ACCESS_COMPOSITION_ROOTS.size).toBe(1);
    expect(found).toEqual(EXPECTED_RESIDUAL_DIRECT_ACCESS_FILES);
  });

  test("web routes do not own stub data providers or fake persistence stores", async () => {
    expect(await violations(["apps/web/src/routes"], FORBIDDEN_INTERFACE_STUB_DATA_PROVIDERS)).toEqual([]);
  });

  test("workflow milestone docs comments templates skills and sprints tRPC routers delegate persistence to application modules", async () => {
    expect(await directAccessInExactFiles(SERVICE_ROUTER_FILES)).toEqual([]);
  });

  test("workflow milestone residual CLI commands use caller/application boundaries for runtime domain work", async () => {
    expect(await patternInExactFiles(LEGACY_CLI_FILES, FORBIDDEN_CLI_DIRECT_ACCESS)).toEqual([]);
  });

  test("workflow milestone residual CLI commands use caller/application boundaries for runtime domain work", async () => {
    expect(await patternInExactFiles(RUNTIME_CLI_FILES, FORBIDDEN_CLI_DIRECT_ACCESS)).toEqual([]);
  });

  test("services do not import deprecated report workflow contracts", async () => {
    expect(await violations(["services"], FORBIDDEN_SERVICE_LEGACY_REPORT_CONTRACTS)).toEqual([]);
  });

  test("service domain layers do not depend on application layers", async () => {
    expect(await violations(SERVICE_DOMAIN_ROOTS, FORBIDDEN_DOMAIN_APPLICATION_IMPORT)).toEqual([]);
  });

  test("web production code does not import tRPC runtime internals directly", async () => {
    expect(await violations(["apps/web/src"], FORBIDDEN_WEB_TRPC_RUNTIME_IMPORT)).toEqual([]);
  });

  test("web tests use public API contracts instead of tRPC runtime internals", async () => {
    expect(await testImportViolations(["apps/web/src", "apps/web/tests"], FORBIDDEN_WEB_TRPC_RUNTIME_IMPORT)).toEqual([]);
  });
});
