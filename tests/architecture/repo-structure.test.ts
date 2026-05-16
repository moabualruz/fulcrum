import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, test } from "bun:test";

const ROOT = process.cwd();

const EMPTY_DIR_ALLOWLIST = new Set([
  "tests/architecture/license-audit.fixtures/invalid-json",
  "tests/architecture/license-audit.fixtures/missing-license",
  "tests/architecture/license-audit.fixtures/multi-license",
  "tests/architecture/license-audit.fixtures/pretend-agpl",
  "tests/architecture/license-audit.fixtures/pretend-mit",
]);

const GENERATED_OR_VENDOR_DIRS = new Set([
  ".git",
  ".svelte-kit",
  "dist",
  "graphify-out",
  "node_modules",
  "target",
  "vendor",
]);

const RUNNABLE_SURFACE_DIRS = ["cli", "tui", "web", "api", "router", "server", "trpc"];

type PackageJson = {
  name?: string;
  workspaces?: string[];
  scripts?: Record<string, string>;
};

async function readPackageJson(path: string): Promise<PackageJson> {
  return JSON.parse(await readFile(join(ROOT, path), "utf8")) as PackageJson;
}

async function walkDirs(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const dirs: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (GENERATED_OR_VENDOR_DIRS.has(entry.name)) continue;

    const path = join(dir, entry.name);
    dirs.push(path);
    dirs.push(...await walkDirs(path));
  }

  return dirs;
}

async function visibleEntries(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries
    .map((entry) => entry.name)
    .filter((name) => !GENERATED_OR_VENDOR_DIRS.has(name) && name !== ".DS_Store");
}

async function collectFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];

  for (const entry of entries) {
    if (GENERATED_OR_VENDOR_DIRS.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }

  return files;
}

describe("repository structure hygiene", () => {
  test("source tree does not contain empty directories outside explicit fixture allowlist", async () => {
    const dirs = await walkDirs(ROOT);
    const emptyDirs: string[] = [];

    for (const dir of dirs) {
      const rel = relative(ROOT, dir);
      if (EMPTY_DIR_ALLOWLIST.has(rel)) continue;
      if (!rel.startsWith("apps/") && !rel.startsWith("services/") && !rel.startsWith("tests/")) continue;
      if ((await visibleEntries(dir)).length === 0) emptyDirs.push(rel);
    }

    expect(emptyDirs.sort()).toEqual([]);
  });

  test("context ADR directories are created lazily instead of carrying duplicate template-only copies", async () => {
    const canonicalTemplate = await readFile(join(ROOT, "docs/adr/0000-template.md"), "utf8");
    const files = await collectFiles(join(ROOT, "src"));
    const duplicateTemplates: string[] = [];

    for (const file of files) {
      const rel = relative(ROOT, file);
      if (!rel.endsWith("/docs/adr/0000-template.md")) continue;
      if (await readFile(file, "utf8") === canonicalTemplate) duplicateTemplates.push(rel);
    }

    expect(duplicateTemplates.sort()).toEqual([]);
  });

  test("runnable surfaces live under apps instead of root src", async () => {
    const srcEntries = await visibleEntries(join(ROOT, "src"));
    const misplaced = RUNNABLE_SURFACE_DIRS.filter((dir) => srcEntries.includes(dir));

    expect(misplaced).toEqual([]);
  });

  test("repository root keeps runtime code under apps and services", async () => {
    const rootEntries = await visibleEntries(ROOT);
    const misplaced = ["src", "inference", "src-tauri", "vendor-src", "upstream-derived"]
      .filter((entry) => rootEntries.includes(entry));

    expect(misplaced).toEqual([]);
  });

  test("sidecar inference runtime is owned by a split-ready service", async () => {
    const serviceEntries = await visibleEntries(join(ROOT, "services"));
    const misplaced = [];
    if (!serviceEntries.includes("inference-runtime")) misplaced.push("services/inference-runtime");
    if ((await visibleEntries(join(ROOT, "services/inference-runtime"))).includes("target")) misplaced.push("services/inference-runtime/target");

    expect(misplaced).toEqual([]);
  });

  test("desktop app shell lives under apps", async () => {
    const misplaced = [];
    if ((await visibleEntries(ROOT)).includes("src-tauri")) misplaced.push("src-tauri");
    if (!(await visibleEntries(join(ROOT, "apps/desktop"))).includes("src-tauri")) {
      misplaced.push("apps/desktop/src-tauri");
    }

    expect(misplaced).toEqual([]);
  });

  test("server app composes persistence without owning database implementation", async () => {
    const misplaced = [];
    if ((await visibleEntries(join(ROOT, "apps/server/src"))).includes("database")) {
      misplaced.push("apps/server/src/database");
    }

    expect(misplaced).toEqual([]);
  });

  test("product store implementation is owned by platform service infrastructure", async () => {
    const misplacedRoots = [];
    if ((await visibleEntries(join(ROOT, "src"))).includes("product-kernel")) misplacedRoots.push("src/product-kernel");
    if ((await visibleEntries(join(ROOT, "tests"))).includes("product-kernel")) misplacedRoots.push("tests/product-kernel");

    expect(misplacedRoots).toEqual([]);
  });

  test("external connector and importer implementation is owned by integration service", async () => {
    const misplacedRoots = [];
    if ((await visibleEntries(join(ROOT, "src"))).includes("connectors")) misplacedRoots.push("src/connectors");
    if ((await visibleEntries(join(ROOT, "src"))).includes("importers")) misplacedRoots.push("src/importers");
    if ((await visibleEntries(join(ROOT, "src/data"))).includes("importers")) misplacedRoots.push("src/data/importers");
    if ((await visibleEntries(join(ROOT, "tests"))).includes("connectors")) misplacedRoots.push("tests/connectors");

    expect(misplacedRoots).toEqual([]);
  });

  test("artifact storage and harvest implementation is owned by workflow coordination service", async () => {
    const misplacedRoots = [];
    if ((await visibleEntries(join(ROOT, "src"))).includes("artifacts")) misplacedRoots.push("src/artifacts");
    if ((await visibleEntries(join(ROOT, "tests"))).includes("artifacts")) misplacedRoots.push("tests/artifacts");

    expect(misplacedRoots).toEqual([]);
  });

  test("notification delivery and fanout implementation is owned by notification service", async () => {
    const misplacedRoots = [];
    if ((await visibleEntries(join(ROOT, "src"))).includes("notifications")) misplacedRoots.push("src/notifications");
    if ((await visibleEntries(join(ROOT, "tests"))).includes("notifications")) misplacedRoots.push("tests/notifications");

    expect(misplacedRoots).toEqual([]);
  });

  test("webhook delivery implementation is owned by integration service", async () => {
    const misplacedRoots = [];
    if ((await visibleEntries(join(ROOT, "src"))).includes("webhooks")) misplacedRoots.push("src/webhooks");
    if ((await visibleEntries(join(ROOT, "tests"))).includes("webhooks")) misplacedRoots.push("tests/webhooks");

    expect(misplacedRoots).toEqual([]);
  });

  test("repository supervision implementation is owned by integration service", async () => {
    const misplacedRoots = [];
    if ((await visibleEntries(join(ROOT, "src"))).includes("repo")) misplacedRoots.push("src/repo");
    if ((await visibleEntries(join(ROOT, "src"))).includes("repos")) misplacedRoots.push("src/repos");
    if ((await visibleEntries(join(ROOT, "tests"))).includes("repos")) misplacedRoots.push("tests/repos");

    expect(misplacedRoots).toEqual([]);
  });

  test("backup runtime implementation is owned by platform service", async () => {
    const misplacedRoots = [];
    if ((await visibleEntries(join(ROOT, "src"))).includes("backup")) misplacedRoots.push("src/backup");

    expect(misplacedRoots).toEqual([]);
  });

  test("secrets and vault runtime implementation is owned by platform service", async () => {
    const misplacedRoots = [];
    if ((await visibleEntries(join(ROOT, "src"))).includes("secrets")) misplacedRoots.push("src/secrets");
    if ((await visibleEntries(join(ROOT, "tests"))).includes("secrets")) misplacedRoots.push("tests/secrets");

    expect(misplacedRoots).toEqual([]);
  });

  test("feature flag runtime implementation is owned by platform service", async () => {
    const misplacedRoots = [];
    if ((await visibleEntries(join(ROOT, "src"))).includes("flags")) misplacedRoots.push("src/flags");
    if ((await visibleEntries(join(ROOT, "tests"))).includes("flags")) misplacedRoots.push("tests/flags");

    expect(misplacedRoots).toEqual([]);
  });

  test("data import export implementation is owned by integration service", async () => {
    const misplacedRoots = [];
    if ((await visibleEntries(join(ROOT, "src"))).includes("data")) misplacedRoots.push("src/data");

    expect(misplacedRoots).toEqual([]);
  });

  test("authorization policy implementation is owned by identity access service", async () => {
    const misplacedRoots = [];
    if ((await visibleEntries(join(ROOT, "src"))).includes("permissions")) misplacedRoots.push("src/permissions");
    if ((await visibleEntries(join(ROOT, "tests"))).includes("permissions")) misplacedRoots.push("tests/permissions");

    expect(misplacedRoots).toEqual([]);
  });

  test("authentication runtime implementation is owned by identity access service", async () => {
    const misplacedRoots = [];
    if ((await visibleEntries(join(ROOT, "src"))).includes("auth")) misplacedRoots.push("src/auth");
    if ((await visibleEntries(join(ROOT, "tests"))).includes("auth")) misplacedRoots.push("tests/auth");

    expect(misplacedRoots).toEqual([]);
  });

  test("job queue and worker registry implementation is owned by platform service", async () => {
    const misplacedRoots = [];
    if ((await visibleEntries(join(ROOT, "src"))).includes("queue")) misplacedRoots.push("src/queue");
    if ((await visibleEntries(join(ROOT, "src"))).includes("workers")) misplacedRoots.push("src/workers");
    if ((await visibleEntries(join(ROOT, "tests"))).includes("workers")) misplacedRoots.push("tests/workers");

    expect(misplacedRoots).toEqual([]);
  });

  test("cross-domain event handlers are owned by workflow coordination service", async () => {
    const misplacedRoots = [];
    if ((await visibleEntries(join(ROOT, "src"))).includes("events")) misplacedRoots.push("src/events");

    expect(misplacedRoots).toEqual([]);
  });

  test("error reporting implementation is owned by platform service", async () => {
    const misplacedRoots = [];
    if ((await visibleEntries(join(ROOT, "src"))).includes("errors")) misplacedRoots.push("src/errors");

    expect(misplacedRoots).toEqual([]);
  });

  test("saved-view filter query implementation is owned by work-management service", async () => {
    const misplacedRoots = [];
    if ((await visibleEntries(join(ROOT, "src"))).includes("filters")) misplacedRoots.push("src/filters");

    expect(misplacedRoots).toEqual([]);
  });

  test("database runtime configuration is owned by platform service", async () => {
    const misplacedRoots = [];
    if ((await visibleEntries(join(ROOT, "src"))).includes("config")) misplacedRoots.push("src/config");

    expect(misplacedRoots).toEqual([]);
  });

  test("collaboration runtime implementation is owned by knowledge workspace service", async () => {
    const misplacedRoots = [];
    if ((await visibleEntries(join(ROOT, "src"))).includes("collab")) misplacedRoots.push("src/collab");

    expect(misplacedRoots).toEqual([]);
  });

  test("document workspace implementation is owned by knowledge workspace service", async () => {
    const misplacedRoots = [];
    if ((await visibleEntries(join(ROOT, "src"))).includes("docs")) misplacedRoots.push("src/docs");

    expect(misplacedRoots).toEqual([]);
  });

  test("memory runtime implementation is owned by knowledge workspace service", async () => {
    const misplacedRoots = [];
    if ((await visibleEntries(join(ROOT, "src"))).includes("memory")) misplacedRoots.push("src/memory");
    if ((await visibleEntries(join(ROOT, "tests"))).includes("memory")) misplacedRoots.push("tests/memory");

    expect(misplacedRoots).toEqual([]);
  });

  test("context assembly runtime is owned by knowledge workspace service", async () => {
    const misplacedRoots = [];
    if ((await visibleEntries(join(ROOT, "src"))).includes("context")) misplacedRoots.push("src/context");

    expect(misplacedRoots).toEqual([]);
  });

  test("search runtime implementation is owned by knowledge workspace service", async () => {
    const misplacedRoots = [];
    if ((await visibleEntries(join(ROOT, "src"))).includes("search")) misplacedRoots.push("src/search");
    if ((await visibleEntries(join(ROOT, "tests"))).includes("search")) misplacedRoots.push("tests/search");

    expect(misplacedRoots).toEqual([]);
  });

  test("inference runtime implementation is owned by platform service", async () => {
    const misplacedRoots = [];
    if ((await visibleEntries(join(ROOT, "src"))).includes("inference")) misplacedRoots.push("src/inference");
    if ((await visibleEntries(join(ROOT, "tests"))).includes("inference")) misplacedRoots.push("tests/inference");

    expect(misplacedRoots).toEqual([]);
  });

  test("subscription transport implementation is owned by platform service", async () => {
    const misplacedRoots = [];
    if ((await visibleEntries(join(ROOT, "src"))).includes("subscriptions")) misplacedRoots.push("src/subscriptions");

    expect(misplacedRoots).toEqual([]);
  });

  test("agent execution runtime implementation is owned by execution orchestration service", async () => {
    const misplacedRoots = [];
    if ((await visibleEntries(join(ROOT, "src"))).includes("orchestration")) misplacedRoots.push("src/orchestration");
    if ((await visibleEntries(join(ROOT, "tests"))).includes("orchestration")) misplacedRoots.push("tests/orchestration");
    if ((await visibleEntries(join(ROOT, "tests"))).includes("symphony")) misplacedRoots.push("tests/symphony");

    expect(misplacedRoots).toEqual([]);
  });

  test("agent profile catalog implementation is owned by execution orchestration service", async () => {
    const misplacedRoots = [];
    if ((await visibleEntries(join(ROOT, "src"))).includes("agents")) misplacedRoots.push("src/agents");

    expect(misplacedRoots).toEqual([]);
  });

  test("component lifecycle implementation is owned by platform service", async () => {
    const misplacedRoots = [];
    if ((await visibleEntries(join(ROOT, "src"))).includes("components")) misplacedRoots.push("src/components");

    expect(misplacedRoots).toEqual([]);
  });

  test("agent hook runtime implementation is owned by platform service", async () => {
    const misplacedRoots = [];
    if ((await visibleEntries(join(ROOT, "src"))).includes("hooks")) misplacedRoots.push("src/hooks");

    expect(misplacedRoots).toEqual([]);
  });

  test("health check implementation is owned by platform service", async () => {
    const misplacedRoots = [];
    if ((await visibleEntries(join(ROOT, "src"))).includes("doctor")) misplacedRoots.push("src/doctor");

    expect(misplacedRoots).toEqual([]);
  });

  test("platform operation implementation is owned by platform service", async () => {
    const misplacedRoots = [];
    if ((await visibleEntries(join(ROOT, "src"))).includes("platform")) misplacedRoots.push("src/platform");

    expect(misplacedRoots).toEqual([]);
  });

  test("localization implementation is owned by platform service", async () => {
    const misplacedRoots = [];
    if ((await visibleEntries(join(ROOT, "src"))).includes("i18n")) misplacedRoots.push("src/i18n");

    expect(misplacedRoots).toEqual([]);
  });

  test("input binding implementation is owned by platform service", async () => {
    const misplacedRoots = [];
    if ((await visibleEntries(join(ROOT, "src"))).includes("keybindings")) misplacedRoots.push("src/keybindings");

    expect(misplacedRoots).toEqual([]);
  });

  test("skill supply implementation is owned by platform service", async () => {
    const misplacedRoots = [];
    if ((await visibleEntries(join(ROOT, "src"))).includes("skills")) misplacedRoots.push("src/skills");
    if ((await visibleEntries(join(ROOT, "src"))).includes("marketplace")) misplacedRoots.push("src/marketplace");

    expect(misplacedRoots).toEqual([]);
  });

  test("runtime support helpers are owned by platform service", async () => {
    const misplacedRoots = [];
    if ((await visibleEntries(join(ROOT, "src"))).includes("utils")) misplacedRoots.push("src/utils");
    if ((await visibleEntries(join(ROOT, "src"))).includes("types.ts")) misplacedRoots.push("src/types.ts");

    expect(misplacedRoots).toEqual([]);
  });

  test("optional dependency declarations are owned by platform service", async () => {
    const misplacedRoots = [];
    if ((await visibleEntries(join(ROOT, "src"))).includes("types")) misplacedRoots.push("src/types");

    expect(misplacedRoots).toEqual([]);
  });

  test("standalone test buckets live under tests or service-owned suites", async () => {
    const misplacedRoots = [];
    if ((await visibleEntries(join(ROOT, "src"))).includes("tests")) misplacedRoots.push("src/tests");

    expect(misplacedRoots).toEqual([]);
  });

  test("test harness helpers live under tests support", async () => {
    const misplacedRoots = [];
    if ((await visibleEntries(join(ROOT, "src"))).includes("test-support")) misplacedRoots.push("src/test-support");
    if ((await visibleEntries(join(ROOT, "src"))).includes("test-utils")) misplacedRoots.push("src/test-utils");

    expect(misplacedRoots).toEqual([]);
  });

  test("architecture verification suites live under tests architecture", async () => {
    const misplacedRoots = [];
    if ((await visibleEntries(join(ROOT, "src"))).includes("architecture")) misplacedRoots.push("src/architecture");

    expect(misplacedRoots).toEqual([]);
  });

  test("application database infrastructure is owned by platform service", async () => {
    const misplacedRoots = [];
    if ((await visibleEntries(join(ROOT, "src"))).includes("db")) misplacedRoots.push("src/db");

    expect(misplacedRoots).toEqual([]);
  });

  test("shared platform primitives are owned by platform service", async () => {
    const misplacedRoots = [];
    if ((await visibleEntries(join(ROOT, "src"))).includes("shared")) misplacedRoots.push("src/shared");

    expect(misplacedRoots).toEqual([]);
  });

  test("interface parity inventory is owned by platform service", async () => {
    const misplacedRoots = [];
    if ((await visibleEntries(join(ROOT, "src"))).includes("surfaces")) misplacedRoots.push("src/surfaces");

    expect(misplacedRoots).toEqual([]);
  });

  test("local client and server apps have first-class package manifests", async () => {
    const expectedPackages = new Map([
      ["apps/cli/package.json", "@fulcrum/cli"],
      ["apps/server/package.json", "@fulcrum/server"],
      ["apps/tui/package.json", "@fulcrum/tui"],
      ["apps/web/package.json", "@fulcrum/web"],
    ]);

    const missingOrMisnamed: string[] = [];
    for (const [path, name] of expectedPackages) {
      const raw = await readFile(join(ROOT, path), "utf8").catch(() => "");
      if (!raw.includes(`"name": "${name}"`)) missingOrMisnamed.push(path);
    }

    expect(missingOrMisnamed).toEqual([]);
  });

  test("app packages are part of the root workspace and expose standard local scripts", async () => {
    const rootPackage = await readPackageJson("package.json");
    expect(rootPackage.workspaces).toEqual(["apps/*"]);

    const expectedScripts = new Map<string, string[]>([
      ["apps/cli/package.json", ["dev", "test", "typecheck"]],
      ["apps/server/package.json", ["dev", "test", "typecheck"]],
      ["apps/tui/package.json", ["dev", "test", "typecheck"]],
      ["apps/web/package.json", ["dev", "build", "check", "test", "web:test"]],
    ]);

    const missingScripts: string[] = [];
    for (const [path, scripts] of expectedScripts) {
      const pkg = await readPackageJson(path);
      for (const script of scripts) {
        if (!pkg.scripts?.[script]) missingScripts.push(`${path}:${script}`);
      }
    }

    expect(missingScripts.sort()).toEqual([]);
  });
});
