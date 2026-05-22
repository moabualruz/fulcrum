import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, test } from "bun:test";

const ROOT = process.cwd();

const TYPESCRIPT_SERVICES = [
  "agent-client-protocol",
  "execution-orchestration",
  "feature-flags",
  "identity-access",
  "integration-hub",
  "knowledge-workspace",
  "notification-center",
  "planning-review",
  "platform-core",
  "work-management",
  "workflow-coordination",
] as const;

const CANONICAL_SERVICE_DIRS = ["domain", "application", "infrastructure", "interface"] as const;
const APP_SURFACE_ROOTS = ["apps/web/src", "apps/cli/src", "apps/tui/src"] as const;

const SERVICE_INTERFACE_PERSISTENCE_RESIDUALS = [
  "services/execution-orchestration/src/interface/http/agent-profile-public-api.controller.ts",
  "services/execution-orchestration/src/interface/http/agent-run-public-api.controller.ts",
  "services/execution-orchestration/src/interface/http/routing-public-api.controller.ts",
  "services/feature-flags/src/interface/http/controllers/feature-flag-public-api.controller.ts",
  "services/identity-access/src/interface/http/auth-public-api.controller.ts",
  "services/identity-access/src/interface/http/invitation-public-api.controller.ts",
  "services/identity-access/src/interface/http/organization-public-api.controller.ts",
  "services/integration-hub/src/interface/http/connector-public-api.controller.ts",
  "services/integration-hub/src/interface/http/data-portability-public-api.controller.ts",
  "services/integration-hub/src/interface/http/repository-public-api.controller.ts",
  "services/integration-hub/src/interface/http/webhook-public-api.controller.ts",
  "services/knowledge-workspace/src/interface/http/document-public-api.controller.ts",
  "services/knowledge-workspace/src/interface/http/memory-public-api.controller.ts",
  "services/knowledge-workspace/src/interface/http/search-public-api.controller.ts",
  "services/notification-center/src/interface/http/notification-public-api.controller.ts",
  "services/platform-core/src/interface/http/credential-public-api.controller.ts",
  "services/platform-core/src/interface/http/error-log-public-api.controller.ts",
  "services/platform-core/src/interface/http/settings-public-api.controller.ts",
  "services/platform-core/src/interface/http/telemetry-public-api.controller.ts",
  "services/platform-core/src/interface/http/theme-settings.controller.ts",
  "services/work-management/src/interface/http/automation-public-api.controller.ts",
  "services/work-management/src/interface/http/custom-field-public-api.controller.ts",
  "services/work-management/src/interface/http/field-dependency-public-api.controller.ts",
  "services/work-management/src/interface/http/planning-structure-public-api.controller.ts",
  "services/work-management/src/interface/http/project-public-api.controller.ts",
  "services/work-management/src/interface/http/project-status-public-api.controller.ts",
  "services/work-management/src/interface/http/relationship-public-api.controller.ts",
  "services/work-management/src/interface/http/report-public-api.controller.ts",
  "services/work-management/src/interface/http/saved-view-public-api.controller.ts",
  "services/work-management/src/interface/http/sprint-public-api.controller.ts",
  "services/work-management/src/interface/http/task-comment-public-api.controller.ts",
  "services/work-management/src/interface/http/task-public-api.controller.ts",
  "services/work-management/src/interface/http/task-recurrence-public-api.controller.ts",
  "services/work-management/src/interface/http/template-public-api.controller.ts",
  "services/work-management/src/interface/http/workflow-settings-public-api.controller.ts",
  "services/workflow-coordination/src/interface/http/artifact-public-api.controller.ts",
  "services/workflow-coordination/src/interface/http/audit-public-api.controller.ts",
  "services/workflow-coordination/src/interface/http/workflow-cycle.module.ts",
] as const;

const DOMAIN_FORBIDDEN_IMPORT = /from\s+["'][^"']*\/(?:application|infrastructure|interface)\//;
const ROOT_INDEX_FORBIDDEN_EXPORT = /from\s+["']\.\/(?:infrastructure|.*\.test|.*\.spec)/;
const APP_SURFACE_PERSISTENCE_IMPORT = /from\s+["'][^"']*(?:typeorm|infrastructure\/database|application-database|entities\/|repositories\/|db\.module)[^"']*["']/;
const SERVICE_INTERFACE_PERSISTENCE_IMPORT = /from\s+["'][^"']*(?:typeorm|infrastructure\/database|application-database|entities\/|repositories\/|db\.module)[^"']*["']/;

// App-surface routes that still reach into service infrastructure directly.
// These predate the current architecture-readiness gate and need a focused
// refactor pass to route them through a service interface helper before the
// allow-list can shrink. New routes MUST NOT be added here.
const APP_SURFACE_PERSISTENCE_RESIDUALS = [
  "apps/cli/src/commands/session.ts",
] as const;

async function exists(path: string): Promise<boolean> {
  return stat(join(ROOT, path)).then(() => true, () => false);
}

async function sourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(join(ROOT, root), { withFileTypes: true }).catch(() => []);
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!entry.isFile()) return [];
    if (!path.endsWith(".ts") && !path.endsWith(".svelte")) return [];
    if (path.endsWith(".test.ts") || path.endsWith(".spec.ts") || path.includes("/__tests__/")) return [];
    return [path];
  }));
  return files.flat();
}

function runtimeText(text: string): string {
  return text
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("import type "))
    .join("\n");
}

async function matchingFiles(roots: readonly string[], pattern: RegExp): Promise<string[]> {
  const files = (await Promise.all(roots.map(sourceFiles))).flat();
  const found: string[] = [];
  for (const file of files) {
    const text = runtimeText(await readFile(join(ROOT, file), "utf8"));
    if (pattern.test(text)) found.push(relative(ROOT, join(ROOT, file)));
  }
  return found.sort();
}

describe("service module extraction readiness", () => {
  test("typescript services keep canonical split-ready roots and public service entrypoints", async () => {
    const missing: string[] = [];

    for (const service of TYPESCRIPT_SERVICES) {
      for (const dir of CANONICAL_SERVICE_DIRS) {
        if (!await exists(`services/${service}/src/${dir}`)) missing.push(`services/${service}/src/${dir}`);
      }
      if (!await exists(`services/${service}/CONTEXT.md`)) missing.push(`services/${service}/CONTEXT.md`);
      if (!await exists(`services/${service}/src/index.ts`)) missing.push(`services/${service}/src/index.ts`);
    }

    expect(missing).toEqual([]);
  });

  test("service root entrypoints expose public roots without infrastructure exports", async () => {
    const violations: string[] = [];

    for (const service of TYPESCRIPT_SERVICES) {
      const file = `services/${service}/src/index.ts`;
      const text = await readFile(join(ROOT, file), "utf8");
      if (!text.includes("serviceExtractionReadiness")) violations.push(`${file}:missing-readiness-manifest`);
      if (ROOT_INDEX_FORBIDDEN_EXPORT.test(text)) violations.push(`${file}:exports-private-root`);
    }

    expect(violations).toEqual([]);
  });

  test("domain layers stay independent from application, interface, and infrastructure layers", async () => {
    const roots = TYPESCRIPT_SERVICES.map((service) => `services/${service}/src/domain`);
    expect(await matchingFiles(roots, DOMAIN_FORBIDDEN_IMPORT)).toEqual([]);
  });

  test("web CLI and TUI surfaces do not import persistence implementation directly", async () => {
    expect(await matchingFiles(APP_SURFACE_ROOTS, APP_SURFACE_PERSISTENCE_IMPORT)).toEqual(
      [...APP_SURFACE_PERSISTENCE_RESIDUALS].sort(),
    );
  });

  test("service interface persistence residuals are explicit until application providers absorb them", async () => {
    const roots = TYPESCRIPT_SERVICES.map((service) => `services/${service}/src/interface/http`);
    expect(await matchingFiles(roots, SERVICE_INTERFACE_PERSISTENCE_IMPORT)).toEqual([...SERVICE_INTERFACE_PERSISTENCE_RESIDUALS].sort());
  });
});
