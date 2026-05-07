import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, test } from "bun:test";

const INTERFACE_ROOTS = [
  "src/cli",
  "src/tui",
  "src/router",
];

const RUNTIME_ADAPTER_ROOTS = [
  "src/web/src/routes",
  "src/web/src/lib/server",
  "src/api/routes",
  "src/trpc",
];

const RESIDUAL_INTERFACE_ROOTS = [
  "src/web/src/routes",
  "src/web/src/lib",
  "src/cli",
  "src/tui",
  "src/api",
  "src/router",
  "src/trpc",
  "src/server/trpc",
];

const TEST_FIXTURE_ROOTS = ["src", "src/web/tests"];

const EXPECTED_RUNTIME_DIRECT_ACCESS_FILES = [
  "src/web/src/routes/orchestration/+page.server.ts",
  "src/web/src/lib/server/db.ts",
  "src/trpc/context.ts",
];

const NON_WEB_INVENTORY_ROOTS = [
  "src/config",
  "src/db",
  "src/search",
  "src/docs",
  "src/collab",
  "src/connectors",
  "src/doctor/checks",
  "src/orchestration/symphony",
  "src/services",
  "src/infrastructure/doctor",
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
    "src/web/src/lib/server/db.ts",
    "web composition root owns current database singleton until route/helper callers move behind application services",
  ],
  [
    "src/trpc/context.ts",
    "tRPC context composition root still carries EntityManager during staged router migration",
  ],
  [
    "src/cli/index.ts",
    "CLI composition root may wire database bindings while command files migrate to caller/application adapters",
  ],
  [
    "src/cli/commands/init.ts",
    "CLI init is the exact bootstrap exception that opens PGlite/MikroORM, runs migrations, and seeds the local org before application callers exist",
  ],
]);

const EXPECTED_RESIDUAL_DIRECT_ACCESS_FILES: string[] = [];

const PLAN21_ROUTER_FILES = [
  "src/server/trpc/routers/comments.ts",
  "src/server/trpc/routers/doc-templates.ts",
  "src/server/trpc/routers/docs.ts",
  "src/server/trpc/routers/skills.ts",
  "src/server/trpc/routers/sprints.ts",
  "src/server/trpc/routers/templates.ts",
];

const PLAN44_CLI_FILES = [
  "src/cli/docs-templates.ts",
  "src/cli/commands/export.ts",
  "src/cli/commands/import.ts",
  "src/cli/commands/auth.ts",
  "src/cli/commands/flags.ts",
  "src/cli/commands/project-config.ts",
  "src/cli/commands/report.ts",
  "src/cli/commands/task-hierarchy.ts",
  "src/cli/commands/task-relate.ts",
  "src/cli/commands/symphony.ts",
  "src/cli/commands/pillar14-generated.ts",
];

const PLAN45_CLI_FILES = [
  "src/cli/commands/comment.ts",
  "src/cli/commands/context.ts",
  "src/cli/commands/my-work.ts",
  "src/cli/commands/repos.ts",
];

const FORBIDDEN_PLAN44_CLI_DIRECT_ACCESS = new RegExp(
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
    if (path.endsWith(".test.ts") || path.endsWith(".spec.ts") || path.includes("src/web/tests/")) {
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
    const text = await readFile(file, "utf8");
    if (pattern.test(text)) found.push(relative(process.cwd(), file));
  }
  return found.sort();
}

describe("Phase 9.5 interface boundary", () => {
  test("interfaces do not import product-kernel or open legacy database handles directly", async () => {
    expect(await violations(INTERFACE_ROOTS, FORBIDDEN_INTERFACE_ACCESS)).toEqual([]);
  });

  test("web API tRPC runtime adapters do not import product-kernel or open legacy database handles directly", async () => {
    const found = await violations(RUNTIME_ADAPTER_ROOTS, FORBIDDEN_INTERFACE_ACCESS);
    expect(EXPECTED_RUNTIME_DIRECT_ACCESS_FILES.length).toBeGreaterThan(0);
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

  test("R-11 subscriptions do not import or depend on PGlite/pglite directly", async () => {
    expect(await violations(["src/subscriptions"], /\bPGlite\b|\bpglite\b/)).toEqual([
      "src/subscriptions/index.ts",
    ]);
  });

  test("interface adapters do not use ORM/entity/repository access outside exact composition roots", async () => {
    const found = await residualDirectAccessViolations();
    expect(RESIDUAL_DIRECT_ACCESS_COMPOSITION_ROOTS.size).toBe(4);
    expect(found).toEqual(EXPECTED_RESIDUAL_DIRECT_ACCESS_FILES);
  });

  test("web routes do not own stub data providers or fake persistence stores", async () => {
    expect(await violations(["src/web/src/routes"], FORBIDDEN_INTERFACE_STUB_DATA_PROVIDERS)).toEqual([]);
  });

  test("Plan 21 docs comments templates skills and sprints tRPC routers delegate persistence to application modules", async () => {
    expect(await directAccessInExactFiles(PLAN21_ROUTER_FILES)).toEqual([]);
  });

  test("Plan 44 residual CLI commands use caller/application boundaries for runtime domain work", async () => {
    expect(await patternInExactFiles(PLAN44_CLI_FILES, FORBIDDEN_PLAN44_CLI_DIRECT_ACCESS)).toEqual([]);
  });

  test("Plan 45 residual CLI commands use caller/application boundaries for runtime domain work", async () => {
    expect(await patternInExactFiles(PLAN45_CLI_FILES, FORBIDDEN_PLAN44_CLI_DIRECT_ACCESS)).toEqual([]);
  });
});
