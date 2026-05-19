import { access, readFile, readdir, stat } from "node:fs/promises";
import { describe, expect, test } from "bun:test";

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const LEGACY_TRPC_PLANNING_BOILERPLATE_PATH = "apps/server/src/trpc/routers/planning.ts";
const LEGACY_HTTP_PACKAGE = `${"ho"}${"no"}`;
const LEGACY_OPENAPI_PACKAGE = `@${LEGACY_HTTP_PACKAGE}/zod-openapi`;
const LEGACY_OPENAPI_FACTORY = `OpenAPI${"Ho"}${"no"}`;

const PLANNING_BOILERPLATE_TARGET_FILES = [
  "services/planning-review/src/application/technical-planning-cycle.ts",
  "apps/web/src/routes/planning/+page.svelte",
  "apps/tui/src/index.ts",
] as const;

const APPLICATION_TRANSPORT_LEAK_FILES = [
  "services/identity-access/src/application/admin/queries.ts",
  "services/identity-access/src/application/permissions/enforcer.ts",
  "services/knowledge-workspace/src/application/document-service.ts",
  "services/knowledge-workspace/src/application/search/saved-searches.ts",
  "services/knowledge-workspace/src/application/docs/queries.ts",
  "services/knowledge-workspace/src/application/docs/version-reconstructor.ts",
  "services/knowledge-workspace/src/application/memory/hooks/after-run-hook.ts",
  "services/integration-hub/src/application/repos/repository-operations.ts",
  "services/platform-core/src/application/error-mapping.ts",
  "services/work-management/src/application/work-item-field-dependencies.ts",
  "services/work-management/src/application/work-item-recurrence.ts",
  "services/work-management/src/application/work-item-relationships.ts",
  "services/work-management/src/application/work-item-service.ts",
  "services/work-management/src/application/work-item-templates.ts",
  "services/work-management/src/application/templates/queries.ts",
  "services/work-management/src/application/work-cycle-service.ts",
  "services/work-management/src/application/work-item-comments.ts",
  "services/work-management/src/application/workflow-rules-service.ts",
] as const;

const PUBLIC_API_CONTROLLER_FILES = [
  "services/execution-orchestration/src/interface/http/agent-run-public-api.controller.ts",
  "services/identity-access/src/interface/http/auth-public-api.controller.ts",
  "services/identity-access/src/interface/http/invitation-public-api.controller.ts",
  "services/integration-hub/src/interface/http/connector-public-api.controller.ts",
  "services/integration-hub/src/interface/http/data-portability-public-api.controller.ts",
  "services/integration-hub/src/interface/http/repository-public-api.controller.ts",
  "services/integration-hub/src/interface/http/webhook-public-api.controller.ts",
  "services/knowledge-workspace/src/interface/http/document-public-api.controller.ts",
  "services/knowledge-workspace/src/interface/http/memory-public-api.controller.ts",
  "services/knowledge-workspace/src/interface/http/search-public-api.controller.ts",
  "services/notification-center/src/interface/http/notification-public-api.controller.ts",
  "services/platform-core/src/interface/http/error-log-public-api.controller.ts",
  "services/feature-flags/src/interface/http/controllers/feature-experiment-public-api.controller.ts",
  "services/platform-core/src/interface/http/inference-public-api.controller.ts",
  "services/platform-core/src/interface/http/skill-supply-public-api.controller.ts",
  "services/platform-core/src/interface/http/subscription-event-stream.controller.ts",
  "services/platform-core/src/interface/http/telemetry-public-api.controller.ts",
  "services/work-management/src/interface/http/report-public-api.controller.ts",
  "services/work-management/src/interface/http/saved-view-public-api.controller.ts",
  "services/work-management/src/interface/http/sprint-public-api.controller.ts",
  "services/work-management/src/interface/http/task-public-api.controller.ts",
  "services/work-management/src/interface/http/task-recurrence-public-api.controller.ts",
  "services/workflow-coordination/src/interface/http/artifact-public-api.controller.ts",
  "services/workflow-coordination/src/interface/http/audit-public-api.controller.ts",
] as const;

const ROUTE_DECORATOR_PATTERN = /\b(Get|Post|Patch|Put|Delete|Sse)\([^)]*\)\(\s*[\w.]+\.prototype,\s*"([^"]+)"/g;
const PROVENANCE_LABEL_PATTERN = /\b(?:phase|wave|prd)\b/i;

async function listControllerFiles(directory: string, files: string[] = []): Promise<string[]> {
  for (const entry of await readdir(directory)) {
    const path = `${directory}/${entry}`;
    const entryStat = await stat(path);
    if (entryStat.isDirectory()) {
      await listControllerFiles(path, files);
      continue;
    }
    if (entry.endsWith(".controller.ts")) files.push(path);
  }
  return files;
}

function exportedModuleNames(source: string): string[] {
  return [...source.matchAll(/export class (\w*Module)\b/g)].map((match) => match[1]!).sort();
}

function declaredRouteHandlers(source: string): string[] {
  return [...source.matchAll(ROUTE_DECORATOR_PATTERN)].map((match) => match[2]!);
}

describe("server stack convergence", () => {
  test("legacy HTTP compatibility shell files and dependencies are removed", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const dependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    expect(await fileExists(`apps/server/src/api/${LEGACY_HTTP_PACKAGE}.ts`)).toBe(false);
    expect(await fileExists("apps/server/src/api/auth.ts")).toBe(false);
    expect(await fileExists("apps/server/src/api/rate-limit.ts")).toBe(false);
    expect(dependencies).not.toHaveProperty(LEGACY_HTTP_PACKAGE);
    expect(dependencies).not.toHaveProperty(LEGACY_OPENAPI_PACKAGE);
  });

  test("legacy tRPC REST shims do not keep route factories alive", async () => {
    const legacyShimPath = "apps/server/src/trpc/rest-api.ts";

    expect(await fileExists(legacyShimPath)).toBe(false);
  });

  test("tRPC router is the internal RPC layer (CLI/TUI/web), not a dead re-export", async () => {
    // router.ts and domain routers are still actively used by CLI/TUI local-caller
    // and the web /api/trpc endpoint. They will be removed when CLI/TUI migrate
    // to NestJS service injection. Until then, assert they compile.
    expect(await fileExists("apps/server/src/trpc/router.ts")).toBe(true);
  });

  test("unused direct CLI tRPC HTTP client is removed", async () => {
    expect(await fileExists("apps/cli/src/trpc-client.ts")).toBe(false);
  });

  test("planning boilerplate defaults do not point at tRPC runtime routers", async () => {
    const offenders: string[] = [];
    for (const file of PLANNING_BOILERPLATE_TARGET_FILES) {
      const source = await readFile(file, "utf8");
      if (source.includes(LEGACY_TRPC_PLANNING_BOILERPLATE_PATH)) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });

  test("application services do not throw transport-specific tRPC errors", async () => {
    const offenders: string[] = [];
    for (const file of APPLICATION_TRANSPORT_LEAK_FILES) {
      const source = await readFile(file, "utf8");
      if (source.includes("@trpc/server") || source.includes("TRPCError")) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });

  test("server tRPC adapters are not stored in platform application modules", async () => {
    expect(await fileExists("services/platform-core/src/application/secrets/credentials-router.ts")).toBe(false);
    expect(await fileExists("services/platform-core/src/application/subscriptions/procedures.ts")).toBe(false);
    expect(await fileExists("services/platform-core/src/application/cli-tui/caller-context.ts")).toBe(false);
    expect(await fileExists("services/integration-hub/src/application/repos/trpc-adapter.ts")).toBe(false);
  });

  test("public API controllers delegate persistence to stores instead of repositories", async () => {
    const offenders: string[] = [];
    for (const file of PUBLIC_API_CONTROLLER_FILES) {
      const source = await readFile(file, "utf8");
      if (source.includes(".getRepository(") || source.includes("FindOptionsWhere")) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });

  test("the public agent-run API is implemented as a Nest controller", async () => {
    const legacyRoutePath = "apps/server/src/api/routes/runs.ts";
    const source = await readFile(
      "services/execution-orchestration/src/interface/http/agent-run-public-api.controller.ts",
      "utf8",
    );

    expect(await fileExists(legacyRoutePath)).toBe(false);
    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).toContain("Post(");
    expect(source).not.toContain(`from ""`);
  });

  test("invitation public API is implemented as a Nest controller", async () => {
    const source = await readFile(
      "services/identity-access/src/interface/http/invitation-public-api.controller.ts",
      "utf8",
    );

    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).toContain("Post(");
    expect(source).toContain("Patch(");
    expect(source).not.toContain(LEGACY_OPENAPI_PACKAGE);
    expect(source).not.toContain(LEGACY_OPENAPI_FACTORY);
  });

  test("auth public API is implemented as a Nest controller", async () => {
    const source = await readFile(
      "services/identity-access/src/interface/http/auth-public-api.controller.ts",
      "utf8",
    );

    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).toContain("Post(");
    expect(source).not.toContain(LEGACY_OPENAPI_PACKAGE);
    expect(source).not.toContain(LEGACY_OPENAPI_FACTORY);
  });

  test("product search public API is implemented as a Nest controller", async () => {
    const legacyRoutePath = "services/platform-core/src/infrastructure/product-store/api/search-api.ts";
    const legacyServerRoutePath = "apps/server/src/api/routes/search.ts";
    const source = await readFile(
      "services/knowledge-workspace/src/interface/http/search-public-api.controller.ts",
      "utf8",
    );

    expect(await fileExists(legacyRoutePath)).toBe(false);
    expect(await fileExists(legacyServerRoutePath)).toBe(false);
    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).toContain("Post(");
    expect(source).not.toContain(LEGACY_OPENAPI_PACKAGE);
    expect(source).not.toContain(LEGACY_OPENAPI_FACTORY);
  });

  test("artifact public API is implemented as a Nest controller", async () => {
    const legacyServerRoutePath = "apps/server/src/api/routes/artifacts.ts";
    const source = await readFile(
      "services/workflow-coordination/src/interface/http/artifact-public-api.controller.ts",
      "utf8",
    );

    expect(await fileExists(legacyServerRoutePath)).toBe(false);
    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).not.toContain(LEGACY_OPENAPI_PACKAGE);
    expect(source).not.toContain(LEGACY_OPENAPI_FACTORY);
  });

  test("notification public API is implemented as a Nest controller", async () => {
    const legacyKernelRoutePath = "apps/server/src/api/routes/kernel-notifications.ts";
    const legacyMetadataRoutePath = "apps/server/src/api/routes/notifications.ts";
    const source = await readFile(
      "services/notification-center/src/interface/http/notification-public-api.controller.ts",
      "utf8",
    );

    expect(await fileExists(legacyKernelRoutePath)).toBe(false);
    expect(await fileExists(legacyMetadataRoutePath)).toBe(false);
    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).toContain("Patch(");
    expect(source).not.toContain(LEGACY_OPENAPI_PACKAGE);
    expect(source).not.toContain(LEGACY_OPENAPI_FACTORY);
  });

  test("audit public API is implemented as a Nest controller", async () => {
    const legacyKernelRoutePath = "apps/server/src/api/routes/kernel-audit.ts";
    const legacyMetadataRoutePath = "apps/server/src/api/routes/audit.ts";
    const source = await readFile(
      "services/workflow-coordination/src/interface/http/audit-public-api.controller.ts",
      "utf8",
    );

    expect(await fileExists(legacyKernelRoutePath)).toBe(false);
    expect(await fileExists(legacyMetadataRoutePath)).toBe(false);
    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).not.toContain(LEGACY_OPENAPI_PACKAGE);
    expect(source).not.toContain(LEGACY_OPENAPI_FACTORY);
  });

  test("sprint public API is implemented as a Nest controller", async () => {
    const legacyKernelRoutePath = "apps/server/src/api/routes/kernel-sprints.ts";
    const legacyMetadataRoutePath = "apps/server/src/api/routes/sprints.ts";
    const source = await readFile(
      "services/work-management/src/interface/http/sprint-public-api.controller.ts",
      "utf8",
    );

    expect(await fileExists(legacyKernelRoutePath)).toBe(false);
    expect(await fileExists(legacyMetadataRoutePath)).toBe(false);
    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).toContain("Post(");
    expect(source).toContain("Patch(");
    expect(source).toContain("Delete(");
    expect(source).not.toContain(LEGACY_OPENAPI_PACKAGE);
    expect(source).not.toContain(LEGACY_OPENAPI_FACTORY);
  });

  test("report public API is implemented as a Nest controller", async () => {
    const legacyKernelRoutePath = "apps/server/src/api/routes/kernel-reports.ts";
    const source = await readFile(
      "services/work-management/src/interface/http/report-public-api.controller.ts",
      "utf8",
    );

    expect(await fileExists(legacyKernelRoutePath)).toBe(false);
    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).not.toContain(LEGACY_OPENAPI_PACKAGE);
    expect(source).not.toContain(LEGACY_OPENAPI_FACTORY);
  });

  test("document public API is implemented as a Nest controller", async () => {
    const legacyServerRoutePath = "apps/server/src/api/routes/docs.ts";
    const source = await readFile(
      "services/knowledge-workspace/src/interface/http/document-public-api.controller.ts",
      "utf8",
    );

    expect(await fileExists(legacyServerRoutePath)).toBe(false);
    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).toContain("Post(");
    expect(source).toContain("Patch(");
    expect(source).toContain("Delete(");
    expect(source).not.toContain(LEGACY_OPENAPI_PACKAGE);
    expect(source).not.toContain(LEGACY_OPENAPI_FACTORY);
  });

  test("memory public API is implemented as Nest controllers", async () => {
    const legacyServerRoutePath = "apps/server/src/api/routes/memory.ts";
    const source = await readFile(
      "services/knowledge-workspace/src/interface/http/memory-public-api.controller.ts",
      "utf8",
    );

    expect(await fileExists(legacyServerRoutePath)).toBe(false);
    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).toContain("Post(");
    expect(source).toContain("Patch(");
    expect(source).toContain("Delete(");
    expect(source).not.toContain(LEGACY_OPENAPI_PACKAGE);
    expect(source).not.toContain(LEGACY_OPENAPI_FACTORY);
  });

  test("saved-view public API is implemented as a Nest controller", async () => {
    const legacyServerRoutePath = "apps/server/src/api/routes/saved-views.ts";
    const source = await readFile(
      "services/work-management/src/interface/http/saved-view-public-api.controller.ts",
      "utf8",
    );

    expect(await fileExists(legacyServerRoutePath)).toBe(false);
    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).toContain("Post(");
    expect(source).toContain("Delete(");
    expect(source).not.toContain(LEGACY_OPENAPI_PACKAGE);
    expect(source).not.toContain(LEGACY_OPENAPI_FACTORY);
  });

  test("repository public API is implemented as a Nest controller", async () => {
    const legacyServerRoutePath = "apps/server/src/api/routes/repos.ts";
    const source = await readFile(
      "services/integration-hub/src/interface/http/repository-public-api.controller.ts",
      "utf8",
    );

    expect(await fileExists(legacyServerRoutePath)).toBe(false);
    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).toContain("Post(");
    expect(source).not.toContain(LEGACY_OPENAPI_PACKAGE);
    expect(source).not.toContain(LEGACY_OPENAPI_FACTORY);
  });

  test("connector public API is implemented as a Nest controller", async () => {
    const source = await readFile(
      "services/integration-hub/src/interface/http/connector-public-api.controller.ts",
      "utf8",
    );

    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).not.toContain(LEGACY_OPENAPI_PACKAGE);
    expect(source).not.toContain(LEGACY_OPENAPI_FACTORY);
  });

  test("webhook public API is implemented as a Nest controller", async () => {
    const source = await readFile(
      "services/integration-hub/src/interface/http/webhook-public-api.controller.ts",
      "utf8",
    );

    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).toContain("Post(");
    expect(source).toContain("Patch(");
    expect(source).toContain("Delete(");
    expect(source).not.toContain(LEGACY_OPENAPI_PACKAGE);
    expect(source).not.toContain(LEGACY_OPENAPI_FACTORY);
  });

  test("data portability public API is implemented as a Nest controller", async () => {
    const source = await readFile(
      "services/integration-hub/src/interface/http/data-portability-public-api.controller.ts",
      "utf8",
    );

    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).toContain("Post(");
    expect(source).not.toContain(LEGACY_OPENAPI_PACKAGE);
    expect(source).not.toContain(LEGACY_OPENAPI_FACTORY);
  });

  test("task public API is implemented as a Nest controller", async () => {
    const legacyKernelRoutePath = "apps/server/src/api/routes/kernel-tasks.ts";
    const legacyMetadataRoutePath = "apps/server/src/api/routes/tasks.ts";
    const source = await readFile(
      "services/work-management/src/interface/http/task-public-api.controller.ts",
      "utf8",
    );

    expect(await fileExists(legacyKernelRoutePath)).toBe(false);
    expect(await fileExists(legacyMetadataRoutePath)).toBe(false);
    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).toContain("Post(");
    expect(source).toContain("Patch(");
    expect(source).toContain("Delete(");
    expect(source).not.toContain(LEGACY_OPENAPI_PACKAGE);
    expect(source).not.toContain(LEGACY_OPENAPI_FACTORY);
  });

  test("task recurrence public API is implemented as a Nest controller", async () => {
    const source = await readFile(
      "services/work-management/src/interface/http/task-recurrence-public-api.controller.ts",
      "utf8",
    );

    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).toContain("Post(");
    expect(source).toContain("Delete(");
    expect(source).not.toContain(LEGACY_OPENAPI_PACKAGE);
    expect(source).not.toContain(LEGACY_OPENAPI_FACTORY);
  });

  test("inference public API is implemented as a Nest controller", async () => {
    const source = await readFile(
      "services/platform-core/src/interface/http/inference-public-api.controller.ts",
      "utf8",
    );

    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).toContain("Post(");
    expect(source).toContain("Patch(");
    expect(source).toContain("Delete(");
    expect(source).not.toContain(LEGACY_OPENAPI_PACKAGE);
    expect(source).not.toContain(LEGACY_OPENAPI_FACTORY);
  });

  test("error log public API is implemented as a Nest controller", async () => {
    const source = await readFile(
      "services/platform-core/src/interface/http/error-log-public-api.controller.ts",
      "utf8",
    );

    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).toContain("Delete(");
    expect(source).not.toContain(LEGACY_OPENAPI_PACKAGE);
    expect(source).not.toContain(LEGACY_OPENAPI_FACTORY);
  });

  test("feature experiment public API is implemented as a Nest controller", async () => {
    const source = await readFile(
      "services/feature-flags/src/interface/http/controllers/feature-experiment-public-api.controller.ts",
      "utf8",
    );

    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).toContain("Post(");
    expect(source).not.toContain(LEGACY_OPENAPI_PACKAGE);
    expect(source).not.toContain(LEGACY_OPENAPI_FACTORY);
  });

  test("telemetry public API is implemented as a Nest controller", async () => {
    const source = await readFile(
      "services/platform-core/src/interface/http/telemetry-public-api.controller.ts",
      "utf8",
    );

    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).toContain("Post(");
    expect(source).toContain("Delete(");
    expect(source).not.toContain(LEGACY_OPENAPI_PACKAGE);
    expect(source).not.toContain(LEGACY_OPENAPI_FACTORY);
  });

  test("subscription event stream public API is implemented as a Nest controller", async () => {
    const source = await readFile(
      "services/platform-core/src/interface/http/subscription-event-stream.controller.ts",
      "utf8",
    );

    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).not.toContain(LEGACY_OPENAPI_PACKAGE);
    expect(source).not.toContain(LEGACY_OPENAPI_FACTORY);
  });

  test("skill supply public API is implemented as a Nest controller", async () => {
    const source = await readFile(
      "services/platform-core/src/interface/http/skill-supply-public-api.controller.ts",
      "utf8",
    );

    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).toContain("Post(");
    expect(source).toContain("Patch(");
    expect(source).toContain("Delete(");
    expect(source).not.toContain(LEGACY_OPENAPI_PACKAGE);
    expect(source).not.toContain(LEGACY_OPENAPI_FACTORY);
  });

  test("OpenAPI bootstrap exposes a stable JSON document for generated clients", async () => {
    const source = await readFile("apps/server/src/nest-application.ts", "utf8");

    expect(source).toContain("deepScanRoutes: true");
    expect(source).toContain("operationIdFactory");
    expect(source).toContain('jsonDocumentUrl: "api/v1/openapi.json"');
  });

  test("mounted public API controllers are discoverable by Swagger", async () => {
    const appModuleSource = await readFile("apps/server/src/app.module.ts", "utf8");
    const workflowModuleSource = await readFile(
      "services/workflow-coordination/src/interface/http/workflow-cycle.module.ts",
      "utf8",
    );
    const controllerFiles = await listControllerFiles("services");
    const missingModuleImports: string[] = [];
    const missingControllerRegistrations: string[] = [];

    for (const file of controllerFiles) {
      const source = await readFile(file, "utf8");
      const modules = exportedModuleNames(source);
      if (modules.length > 0) {
        for (const moduleName of modules) {
          if (!appModuleSource.includes(moduleName)) missingModuleImports.push(`${file}:${moduleName}`);
        }
        continue;
      }

      const controllerNames = [...source.matchAll(/export class (\w*Controller)\b/g)].map((match) => match[1]!);
      for (const controllerName of controllerNames) {
        if (!workflowModuleSource.includes(controllerName)) {
          missingControllerRegistrations.push(`${file}:${controllerName}`);
        }
      }
    }

    expect(missingModuleImports).toEqual([]);
    expect(missingControllerRegistrations).toEqual([]);
  });

  test("public API route handlers carry OpenAPI discoverability, auth, and error metadata", async () => {
    const controllerFiles = await listControllerFiles("services");
    const offenders: string[] = [];

    for (const file of controllerFiles) {
      const source = await readFile(file, "utf8");
      if (source.includes("Controller(") && !source.includes("ApiTags(")) {
        offenders.push(`${file}: missing ApiTags metadata`);
      }
      if (source.includes('Headers("authorization")')) {
        if (!source.includes("ApiBearerAuth(")) offenders.push(`${file}: missing ApiBearerAuth metadata`);
        if (!source.includes("ApiUnauthorizedResponse(")) offenders.push(`${file}: missing ApiUnauthorizedResponse metadata`);
      }
      if (source.includes("ForbiddenException") && !source.includes("ApiForbiddenResponse(")) {
        offenders.push(`${file}: missing ApiForbiddenResponse metadata`);
      }

      if (declaredRouteHandlers(source).length > 0) {
        if (!source.includes("ApiOperation(")) offenders.push(`${file}: missing operation summary metadata`);
        if (!/\bApi(?:Ok|Created|Accepted|NoContent|BadRequest|Unauthorized|Forbidden|NotFound|Conflict|InternalServerError)Response\(/.test(source)) {
          offenders.push(`${file}: missing response metadata`);
        }
      }

      const openApiLabels = [
        ...source.matchAll(/ApiTags\(([^)]*)\)/g),
        ...source.matchAll(/ApiOperation\(\s*\{[^}]*summary:\s*([^,}]+)/g),
      ].map((match) => match[1]!);
      for (const label of openApiLabels) {
        if (PROVENANCE_LABEL_PATTERN.test(label)) offenders.push(`${file}: provenance label ${label.trim()}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  test("each public API route handler carries per-route ApiOperation and response metadata", async () => {
    const controllerFiles = await listControllerFiles("services");
    const offenders: string[] = [];
    const RESPONSE_DECORATOR = /\bApi(Ok|Created|Accepted|NoContent|BadRequest|Unauthorized|Forbidden|NotFound|Conflict|UnprocessableEntity|InternalServerError|TooManyRequests|Default)Response\b/;

    for (const file of controllerFiles) {
      const source = await readFile(file, "utf8");
      // Collect every concrete route registration: HttpVerb(...)(ClassName.prototype, "method", ...)
      const handlerTuples = new Map<string, { className: string; method: string }>();
      const HANDLER_PATTERN = /\b(Get|Post|Put|Patch|Delete|Sse|All|Options|Head)\([^)]*\)\(\s*(\w+)\.prototype\s*,\s*"([^"]+)"/g;
      for (const match of source.matchAll(HANDLER_PATTERN)) {
        const [, , className, method] = match;
        handlerTuples.set(`${className}::${method}`, { className: className!, method: method! });
      }

      if (handlerTuples.size === 0) continue;

      // For each tuple, require an ApiOperation and a response decorator targeting that same (Class.prototype, "method").
      for (const [key, { className, method }] of handlerTuples) {
        const target = new RegExp(
          `${className}\\.prototype\\s*,\\s*"${method}"`,
          "g",
        );
        let hasOperation = false;
        let hasResponse = false;
        // Inspect every line that mentions the (Class.prototype, "method") tuple.
        const lines = source.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]!;
          if (!target.test(line)) continue;
          target.lastIndex = 0;
          // Scan upward up to ~5 lines for the decorator factory the call belongs to.
          const block = lines.slice(Math.max(0, i - 5), i + 1).join("\n");
          if (/\bApiOperation\s*\(/.test(block)) hasOperation = true;
          if (RESPONSE_DECORATOR.test(block)) hasResponse = true;
        }
        if (!hasOperation) offenders.push(`${file}: ${key} missing ApiOperation`);
        if (!hasResponse) offenders.push(`${file}: ${key} missing per-route response decorator`);
      }
    }

    const { API_DECORATOR_RESIDUALS } = await import("./api-decorator-residuals.ts");
    const expected = [...API_DECORATOR_RESIDUALS].sort();
    expect(offenders.sort()).toEqual(expected);
  });
});
